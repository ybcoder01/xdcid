// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./XNSRegistry.sol";

interface IXNSQuotePricingPolicy {
    enum Product {
        Registration,
        Renewal,
        Subdomain,
        Migration
    }

    struct PricingConfig {
        uint64 threeCharacterAnnualUsdMicros;
        uint64 fourCharacterAnnualUsdMicros;
        uint64 standardAnnualUsdMicros;
        uint64 subdomainAnnualUsdMicros;
        uint64 migrationUsdMicros;
        uint16 threeYearDiscountBps;
        uint16 fiveYearDiscountBps;
        uint16 tenYearDiscountBps;
        uint16 xdcQuoteBufferBps;
        address quoteSigner;
        address usdcToken;
        address treasury;
        bool xdcPaymentsEnabled;
        bool usdcPaymentsEnabled;
    }

    function config() external view returns (PricingConfig memory);
    function priceUsdMicros(
        Product product,
        uint256 labelLength,
        uint256 years_
    ) external view returns (uint256);
    function isQuoteAuthorizationValid(
        address signer,
        uint256 quoteVersion
    ) external view returns (bool);
}

interface IXNSLegacyRegistry {
    function _tokenIdMaps(string calldata name) external view returns (uint256);
    function exists(uint256 tokenId) external view returns (bool);
}

contract XNSSignedQuoteRegistrar is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YEAR = 365 days;
    uint256 public constant MIN_LABEL_LENGTH = 3;
    uint256 public constant MAX_LABEL_LENGTH = 63;
    uint256 public constant MAX_QUOTE_LIFETIME = 15 minutes;

    uint8 private constant REGISTRATION = 0;
    uint8 private constant RENEWAL = 1;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 node,address payer,address nameOwner,uint8 product,uint256 years,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline)"
    );

    struct Quote {
        bytes32 node;
        address payer;
        address nameOwner;
        uint8 product;
        uint256 years;
        address paymentToken;
        uint256 paymentAmount;
        uint256 usdMicros;
        uint256 policyVersion;
        uint256 nonce;
        uint256 issuedAt;
        uint256 deadline;
    }

    XNSRegistry public immutable registry;
    IXNSLegacyRegistry public immutable legacyRegistry;
    IXNSQuotePricingPolicy public immutable pricingPolicy;
    mapping(address => uint256) public nonces;

    error InvalidRegistry();
    error InvalidLegacyRegistry();
    error InvalidPricingPolicy();
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

    event NameRegistered(
        bytes32 indexed node,
        string name,
        address indexed nameOwner,
        address indexed payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 usdMicros,
        uint256 policyVersion,
        uint256 nonce
    );
    event NameRenewed(
        bytes32 indexed node,
        string name,
        address indexed nameOwner,
        address indexed payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 usdMicros,
        uint256 policyVersion,
        uint256 nonce
    );

    constructor(
        XNSRegistry registry_,
        IXNSLegacyRegistry legacyRegistry_,
        IXNSQuotePricingPolicy pricingPolicy_
    ) EIP712("XDCID Signed Quote Registrar", "1") {
        if (address(registry_) == address(0) || address(registry_).code.length == 0) {
            revert InvalidRegistry();
        }
        if (
            address(legacyRegistry_) == address(0)
                || address(legacyRegistry_).code.length == 0
        ) {
            revert InvalidLegacyRegistry();
        }
        if (
            address(pricingPolicy_) == address(0)
                || address(pricingPolicy_).code.length == 0
        ) {
            revert InvalidPricingPolicy();
        }

        registry = registry_;
        legacyRegistry = legacyRegistry_;
        pricingPolicy = pricingPolicy_;
    }

    function registerWithQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata signature
    ) external payable nonReentrant {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (quote.product != REGISTRATION) revert InvalidProduct();
        if (quote.nameOwner == address(0)) revert InvalidNameOwner();
        if (
            registry.expiryOf(node) >= block.timestamp
                || _legacyRegistered(canonicalName)
        ) {
            revert Unavailable();
        }

        uint256 labelLength = bytes(canonicalName).length - 4;
        _consumeQuote(quote, signature, node, labelLength);
        _collectPayment(quote);

        uint256 expiry = block.timestamp + (quote.years * YEAR);
        registry.register(node, quote.nameOwner, expiry);
        emit NameRegistered(
            node,
            canonicalName,
            quote.nameOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            quote.usdMicros,
            quote.policyVersion,
            quote.nonce
        );
    }

    function renewWithQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata signature
    ) external payable nonReentrant {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (quote.product != RENEWAL) revert InvalidProduct();

        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) revert Unavailable();
        if (currentOwner != msg.sender || quote.nameOwner != currentOwner) {
            revert NotNameOwner();
        }

        uint256 labelLength = bytes(canonicalName).length - 4;
        _consumeQuote(quote, signature, node, labelLength);
        _collectPayment(quote);

        uint256 expiry = registry.expiryOf(node) + (quote.years * YEAR);
        registry.register(node, currentOwner, expiry);
        emit NameRenewed(
            node,
            canonicalName,
            currentOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            quote.usdMicros,
            quote.policyVersion,
            quote.nonce
        );
    }

    function available(string calldata name) external view returns (bool) {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        return
            registry.expiryOf(node) < block.timestamp
                && !_legacyRegistered(canonicalName);
    }

    function legacyRegistered(
        string calldata name
    ) external view returns (bool) {
        return _legacyRegistered(canonicalize(name));
    }

    function nodeFor(string calldata name) public pure returns (bytes32) {
        return keccak256(bytes(canonicalize(name)));
    }

    function quoteDigest(Quote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(_quoteStructHash(quote));
    }

    function canonicalize(
        string calldata name
    ) public pure returns (string memory) {
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
                (code >= 97 && code <= 122)
                    || (code >= 48 && code <= 57)
                    || char == 0x2d;
            if (
                !valid || (char == 0x2d && (i == 0 || i == labelLength - 1))
            ) {
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

    function _consumeQuote(
        Quote calldata quote,
        bytes calldata signature,
        bytes32 expectedNode,
        uint256 labelLength
    ) internal {
        if (
            quote.node != expectedNode
                || quote.payer != msg.sender
                || quote.years == 0
        ) {
            revert InvalidQuote();
        }
        if (quote.issuedAt > block.timestamp) revert QuoteNotYetValid();
        if (quote.deadline < block.timestamp) revert QuoteExpired();
        if (
            quote.deadline < quote.issuedAt
                || quote.deadline - quote.issuedAt > MAX_QUOTE_LIFETIME
        ) {
            revert QuoteLifetimeTooLong();
        }
        if (quote.nonce != nonces[msg.sender]) revert InvalidNonce();

        uint256 expectedUsdMicros = pricingPolicy.priceUsdMicros(
            IXNSQuotePricingPolicy.Product(quote.product),
            labelLength,
            quote.years
        );
        if (quote.usdMicros != expectedUsdMicros) revert InvalidQuote();

        address signer = ECDSA.recover(
            _hashTypedDataV4(_quoteStructHash(quote)),
            signature
        );
        if (
            !pricingPolicy.isQuoteAuthorizationValid(
                signer,
                quote.policyVersion
            )
        ) {
            revert InvalidSigner();
        }

        nonces[msg.sender] = quote.nonce + 1;
    }

    function _collectPayment(Quote calldata quote) internal {
        IXNSQuotePricingPolicy.PricingConfig memory current =
            pricingPolicy.config();

        if (quote.paymentToken == address(0)) {
            if (!current.xdcPaymentsEnabled) revert PaymentDisabled();
            if (quote.paymentAmount == 0 || msg.value != quote.paymentAmount) {
                revert WrongPaymentAmount();
            }
            (bool sent, ) = payable(current.treasury).call{
                value: quote.paymentAmount
            }("");
            if (!sent) revert PaymentTransferFailed();
            return;
        }

        if (quote.paymentToken != current.usdcToken) {
            revert InvalidPaymentToken();
        }
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

    function _quoteStructHash(
        Quote calldata quote
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.node,
                quote.payer,
                quote.nameOwner,
                quote.product,
                quote.years,
                quote.paymentToken,
                quote.paymentAmount,
                quote.usdMicros,
                quote.policyVersion,
                quote.nonce,
                quote.issuedAt,
                quote.deadline
            )
        );
    }

    function _legacyRegistered(
        string memory canonicalName
    ) internal view returns (bool) {
        uint256 tokenId = legacyRegistry._tokenIdMaps(canonicalName);
        return legacyRegistry.exists(tokenId);
    }

    function _labelLength(bytes memory raw) internal pure returns (uint256) {
        if (
            raw.length < MIN_LABEL_LENGTH + 4
                || raw.length > MAX_LABEL_LENGTH + 4
        ) {
            revert InvalidName();
        }

        uint256 dot = raw.length - 4;
        if (
            raw[dot] != 0x2e
                || !_isX(raw[dot + 1])
                || !_isD(raw[dot + 2])
                || !_isC(raw[dot + 3])
        ) {
            revert InvalidName();
        }
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
