// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./XNSRegistry.sol";
import "./XNSPricingPolicyV2.sol";
import "./XNSDiscountAuthorization.sol";

interface IXNSLegacyRegistryV2 {
    function _tokenIdMaps(string calldata name) external view returns (uint256);
    function exists(uint256 tokenId) external view returns (bool);
}

/// @notice Modular top-level .xdc registrar using signed payment quotes.
/// @dev Subdomain registration is intentionally handled by a separate future module.
contract XNSRegistrarV2 is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YEAR = 365 days;
    uint256 public constant MIN_LABEL_LENGTH = 2;
    uint256 public constant MAX_LABEL_LENGTH = 63;
    uint256 public constant MAX_QUOTE_LIFETIME = 15 minutes;

    uint8 private constant REGISTRATION = 0;
    uint8 private constant RENEWAL = 1;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 node,address payer,address nameOwner,uint8 product,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline)"
    );

    struct Quote {
        bytes32 node;
        address payer;
        address nameOwner;
        uint8 product;
        uint256 termYears;
        address paymentToken;
        uint256 paymentAmount;
        uint256 usdMicros;
        uint256 policyVersion;
        uint256 nonce;
        uint256 issuedAt;
        uint256 deadline;
    }

    XNSRegistry public immutable registry;
    IXNSLegacyRegistryV2 public immutable legacyRegistry;
    XNSPricingPolicyV2 public immutable pricingPolicy;
    XNSDiscountAuthorization public immutable discountAuthorization;

    mapping(address => uint256) public nonces;
    bool public registrationsPaused;
    bool public renewalsPaused;

    error InvalidDependency();
    error InvalidName();
    error InvalidNameOwner();
    error Unavailable();
    error NotNameOwner();
    error InvalidProduct();
    error InvalidQuote();
    error QuoteNotYetValid();
    error QuoteExpired();
    error QuoteLifetimeTooLong();
    error InvalidNonce();
    error InvalidSigner();
    error PaymentDisabled();
    error InvalidPaymentToken();
    error WrongPaymentAmount();
    error PaymentTransferFailed();
    error RegistrationsPaused();
    error RenewalsPaused();

    event NameRegistered(
        bytes32 indexed node,
        address indexed nameOwner,
        address indexed payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 grossUsdMicros,
        uint256 netUsdMicros,
        uint16 discountBps,
        bytes32 quoteHash
    );
    event NameRenewed(
        bytes32 indexed node,
        address indexed nameOwner,
        address indexed payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 grossUsdMicros,
        uint256 netUsdMicros,
        uint16 discountBps,
        bytes32 quoteHash
    );
    event RegistrationPauseChanged(bool paused);
    event RenewalPauseChanged(bool paused);

    constructor(
        XNSRegistry registry_,
        IXNSLegacyRegistryV2 legacyRegistry_,
        XNSPricingPolicyV2 pricingPolicy_,
        XNSDiscountAuthorization discountAuthorization_,
        address initialOwner
    ) Ownable(initialOwner) EIP712("XDCID Registrar V2", "1") {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0 ||
            address(legacyRegistry_) == address(0) ||
            address(legacyRegistry_).code.length == 0 ||
            address(pricingPolicy_) == address(0) ||
            address(pricingPolicy_).code.length == 0 ||
            address(discountAuthorization_) == address(0) ||
            address(discountAuthorization_).code.length == 0
        ) revert InvalidDependency();

        registry = registry_;
        legacyRegistry = legacyRegistry_;
        pricingPolicy = pricingPolicy_;
        discountAuthorization = discountAuthorization_;
    }

    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationPauseChanged(paused);
    }

    function setRenewalsPaused(bool paused) external onlyOwner {
        renewalsPaused = paused;
        emit RenewalPauseChanged(paused);
    }

    function registerWithQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _register(name, quote, quoteSignature, 0);
    }

    function registerWithDiscountQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        XNSDiscountAuthorization.DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discountBps = discountAuthorization.consume(
            authorization,
            authorizationSignature,
            XNSDiscountAuthorization.ConsumptionContext({
                node: quote.node,
                beneficiary: quote.nameOwner,
                product: quote.product,
                termYears: quote.termYears
            })
        );
        _register(name, quote, quoteSignature, discountBps);
    }

    function renewWithQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _renew(name, quote, quoteSignature, 0);
    }

    function renewWithDiscountQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        XNSDiscountAuthorization.DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discountBps = discountAuthorization.consume(
            authorization,
            authorizationSignature,
            XNSDiscountAuthorization.ConsumptionContext({
                node: quote.node,
                beneficiary: quote.nameOwner,
                product: quote.product,
                termYears: quote.termYears
            })
        );
        _renew(name, quote, quoteSignature, discountBps);
    }

    function available(string calldata name) external view returns (bool) {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        return registry.expiryOf(node) < block.timestamp && !_legacyRegistered(canonicalName);
    }

    function legacyRegistered(string calldata name) external view returns (bool) {
        return _legacyRegistered(canonicalize(name));
    }

    function nodeFor(string calldata name) public pure returns (bytes32) {
        return keccak256(bytes(canonicalize(name)));
    }

    function quoteDigest(Quote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(_quoteStructHash(quote));
    }

    function canonicalize(string calldata name) public pure returns (string memory) {
        bytes memory raw = bytes(name);
        uint256 labelLength = _labelLength(raw);
        bytes memory canonical = new bytes(raw.length);

        for (uint256 i = 0; i < labelLength; i++) {
            bytes1 char = raw[i];
            uint8 code = uint8(char);
            if (code >= 65 && code <= 90) {
                code += 32;
                char = bytes1(code);
            }
            bool valid =
                (code >= 97 && code <= 122) ||
                (code >= 48 && code <= 57) ||
                char == 0x2d;
            if (!valid || (char == 0x2d && (i == 0 || i == labelLength - 1))) {
                revert InvalidName();
            }
            canonical[i] = char;
        }

        canonical[labelLength] = 0x2e;
        canonical[labelLength + 1] = 0x78;
        canonical[labelLength + 2] = 0x64;
        canonical[labelLength + 3] = 0x63;
        return string(canonical);
    }

    function _register(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        uint16 discountBps
    ) internal {
        if (registrationsPaused) revert RegistrationsPaused();
        if (quote.product != REGISTRATION) revert InvalidProduct();
        if (quote.nameOwner == address(0)) revert InvalidNameOwner();

        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (registry.expiryOf(node) >= block.timestamp || _legacyRegistered(canonicalName)) {
            revert Unavailable();
        }

        uint256 grossUsdMicros = _consumeQuote(
            quote,
            quoteSignature,
            node,
            bytes(canonicalName).length - 4,
            discountBps
        );
        _collectPayment(quote);

        uint256 expiry = block.timestamp + quote.termYears * YEAR;
        registry.register(node, quote.nameOwner, expiry);
        _emitNameRegistered(
            node,
            expiry,
            grossUsdMicros,
            discountBps,
            quote
        );
    }

    function _renew(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        uint16 discountBps
    ) internal {
        if (renewalsPaused) revert RenewalsPaused();
        if (quote.product != RENEWAL) revert InvalidProduct();

        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) revert Unavailable();
        if (currentOwner != msg.sender || quote.nameOwner != currentOwner) {
            revert NotNameOwner();
        }

        uint256 grossUsdMicros = _consumeQuote(
            quote,
            quoteSignature,
            node,
            bytes(canonicalName).length - 4,
            discountBps
        );
        _collectPayment(quote);

        uint256 expiry = registry.expiryOf(node) + quote.termYears * YEAR;
        registry.register(node, currentOwner, expiry);
        _emitNameRenewed(
            node,
            currentOwner,
            expiry,
            grossUsdMicros,
            discountBps,
            quote
        );
    }

    function _emitNameRegistered(
        bytes32 node,
        uint256 expiry,
        uint256 grossUsdMicros,
        uint16 discountBps,
        Quote calldata quote
    ) internal {
        emit NameRegistered(
            node,
            quote.nameOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            grossUsdMicros,
            quote.usdMicros,
            discountBps,
            _quoteStructHash(quote)
        );
    }

    function _emitNameRenewed(
        bytes32 node,
        address nameOwner,
        uint256 expiry,
        uint256 grossUsdMicros,
        uint16 discountBps,
        Quote calldata quote
    ) internal {
        emit NameRenewed(
            node,
            nameOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            grossUsdMicros,
            quote.usdMicros,
            discountBps,
            _quoteStructHash(quote)
        );
    }

    function _consumeQuote(
        Quote calldata quote,
        bytes calldata signature,
        bytes32 expectedNode,
        uint256 labelLength,
        uint16 discountBps
    ) internal returns (uint256 grossUsdMicros) {
        if (
            quote.node != expectedNode ||
            quote.payer != msg.sender ||
            quote.termYears == 0
        ) revert InvalidQuote();
        if (quote.issuedAt > block.timestamp) revert QuoteNotYetValid();
        if (quote.deadline < block.timestamp) revert QuoteExpired();
        if (
            quote.deadline < quote.issuedAt ||
            quote.deadline - quote.issuedAt > MAX_QUOTE_LIFETIME
        ) revert QuoteLifetimeTooLong();
        if (quote.nonce != nonces[msg.sender]) revert InvalidNonce();

        grossUsdMicros = pricingPolicy.priceUsdMicros(
            XNSPricingPolicyV2.Product(quote.product),
            labelLength,
            quote.termYears
        );
        uint256 expectedNetUsdMicros = discountAuthorization.applyDiscount(
            grossUsdMicros,
            discountBps
        );
        if (quote.usdMicros != expectedNetUsdMicros) revert InvalidQuote();
        if (!_isValidQuoteSignature(quote, signature)) revert InvalidSigner();

        nonces[msg.sender] = quote.nonce + 1;
    }

    function _isValidQuoteSignature(
        Quote calldata quote,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes32 digest = _hashTypedDataV4(_quoteStructHash(quote));
        XNSPricingPolicyV2.PricingConfig memory current = pricingPolicy.config();

        if (
            pricingPolicy.isQuoteAuthorizationValid(
                current.quoteSigner,
                quote.policyVersion
            ) &&
            SignatureChecker.isValidSignatureNow(
                current.quoteSigner,
                digest,
                signature
            )
        ) return true;

        address previousSigner = pricingPolicy.previousQuoteSigner();
        return
            previousSigner != address(0) &&
            pricingPolicy.isQuoteAuthorizationValid(
                previousSigner,
                quote.policyVersion
            ) &&
            SignatureChecker.isValidSignatureNow(
                previousSigner,
                digest,
                signature
            );
    }

    function _collectPayment(Quote calldata quote) internal {
        XNSPricingPolicyV2.PricingConfig memory current = pricingPolicy.config();

        if (quote.usdMicros == 0) {
            if (msg.value != 0 || quote.paymentAmount != 0) {
                revert WrongPaymentAmount();
            }
            if (
                quote.paymentToken != address(0) &&
                quote.paymentToken != current.usdcToken
            ) revert InvalidPaymentToken();
            return;
        }

        if (quote.paymentToken == address(0)) {
            if (!current.xdcPaymentsEnabled) revert PaymentDisabled();
            if (quote.paymentAmount == 0 || msg.value != quote.paymentAmount) {
                revert WrongPaymentAmount();
            }
            (bool sent, ) = payable(current.treasury).call{value: quote.paymentAmount}("");
            if (!sent) revert PaymentTransferFailed();
            return;
        }

        if (quote.paymentToken != current.usdcToken) revert InvalidPaymentToken();
        if (!current.usdcPaymentsEnabled) revert PaymentDisabled();
        if (msg.value != 0 || quote.paymentAmount != quote.usdMicros) {
            revert WrongPaymentAmount();
        }
        IERC20(current.usdcToken).safeTransferFrom(
            msg.sender,
            current.treasury,
            quote.paymentAmount
        );
    }

    function _quoteStructHash(Quote calldata quote) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUOTE_TYPEHASH, quote));
    }

    function _legacyRegistered(string memory canonicalName) internal view returns (bool) {
        uint256 tokenId = legacyRegistry._tokenIdMaps(canonicalName);
        return legacyRegistry.exists(tokenId);
    }

    function _labelLength(bytes memory raw) internal pure returns (uint256) {
        if (raw.length < MIN_LABEL_LENGTH + 4 || raw.length > MAX_LABEL_LENGTH + 4) {
            revert InvalidName();
        }
        uint256 dot = raw.length - 4;
        if (
            raw[dot] != 0x2e ||
            !_isX(raw[dot + 1]) ||
            !_isD(raw[dot + 2]) ||
            !_isC(raw[dot + 3])
        ) revert InvalidName();
        return dot;
    }

    function _isX(bytes1 char) internal pure returns (bool) {
        return char == 0x78 || char == 0x58;
    }

    function _isD(bytes1 char) internal pure returns (bool) {
        return char == 0x64 || char == 0x44;
    }

    function _isC(bytes1 char) internal pure returns (bool) {
        return char == 0x63 || char == 0x43;
    }
}
