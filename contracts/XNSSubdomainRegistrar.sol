// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./XNSRegistry.sol";
import "./XNSPricingPolicyV2.sol";

/// @notice Paid subdomains beneath active XDCID names without changing the top-level registry.
/// @dev The module is authoritative for subdomain ownership and chain-specific address records.
contract XNSSubdomainRegistrar is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_QUOTE_LIFETIME = 15 minutes;
    uint256 public constant MIN_SUBDOMAIN_LABEL_LENGTH = 1;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "SubdomainQuote(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline)"
    );

    struct SubdomainRecord {
        address owner;
        bytes32 parentNode;
        uint256 expiry;
    }

    struct SubdomainQuote {
        bytes32 node;
        bytes32 parentNode;
        address payer;
        address subdomainOwner;
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
    XNSPricingPolicyV2 public immutable pricingPolicy;

    mapping(bytes32 => SubdomainRecord) public records;
    mapping(bytes32 => mapping(uint256 => address)) private _addresses;
    mapping(bytes32 => mapping(address => mapping(address => bool))) public parentOperators;
    mapping(address => uint256) public nonces;

    bool public registrationsPaused;
    bool public renewalsPaused;

    error InvalidDependency();
    error InvalidName();
    error InvalidOwner();
    error ParentUnavailable();
    error NotParentController();
    error NotSubdomainOwner();
    error Unavailable();
    error TermExceedsParentExpiry();
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

    event SubdomainRegistered(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed subdomainOwner,
        address payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 usdMicros,
        bytes32 quoteHash
    );
    event SubdomainRenewed(
        bytes32 indexed node,
        address indexed subdomainOwner,
        address indexed payer,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 usdMicros,
        bytes32 quoteHash
    );
    event SubdomainTransferred(
        bytes32 indexed node,
        address indexed previousOwner,
        address indexed newOwner
    );
    event SubdomainRevoked(bytes32 indexed node, bytes32 indexed parentNode);
    event AddressChanged(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed destination
    );
    event ParentOperatorChanged(
        bytes32 indexed parentNode,
        address indexed parentOwner,
        address indexed operator,
        bool approved
    );
    event RegistrationPauseChanged(bool paused);
    event RenewalPauseChanged(bool paused);

    constructor(
        XNSRegistry registry_,
        XNSPricingPolicyV2 pricingPolicy_,
        address initialOwner
    ) Ownable(initialOwner) EIP712("XDCID Subdomain Registrar", "1") {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0 ||
            address(pricingPolicy_) == address(0) ||
            address(pricingPolicy_).code.length == 0 ||
            initialOwner == address(0)
        ) revert InvalidDependency();

        registry = registry_;
        pricingPolicy = pricingPolicy_;
    }

    function setRegistrationsPaused(bool paused) external onlyOwner {
        registrationsPaused = paused;
        emit RegistrationPauseChanged(paused);
    }

    function setRenewalsPaused(bool paused) external onlyOwner {
        renewalsPaused = paused;
        emit RenewalPauseChanged(paused);
    }

    function setParentOperator(
        string calldata parentName,
        address operator,
        bool approved
    ) external {
        bytes32 parentNode = parentNodeFor(parentName);
        address parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0)) revert ParentUnavailable();
        if (msg.sender != parentOwner) revert NotParentController();
        if (operator == address(0)) revert InvalidOwner();

        parentOperators[parentNode][parentOwner][operator] = approved;
        emit ParentOperatorChanged(parentNode, parentOwner, operator, approved);
    }

    function registerWithQuote(
        string calldata parentName,
        string calldata label,
        SubdomainQuote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        if (registrationsPaused) revert RegistrationsPaused();
        if (quote.subdomainOwner == address(0)) revert InvalidOwner();

        (bytes32 parentNode, bytes32 node) = _nodes(parentName, label);
        address parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0)) revert ParentUnavailable();
        if (
            msg.sender != parentOwner &&
            !parentOperators[parentNode][parentOwner][msg.sender]
        ) revert NotParentController();
        if (records[node].expiry >= block.timestamp) revert Unavailable();

        uint256 expiry = block.timestamp + quote.termYears * YEAR;
        if (expiry > registry.expiryOf(parentNode)) {
            revert TermExceedsParentExpiry();
        }

        _consumeQuote(quote, quoteSignature, node, parentNode, quote.subdomainOwner);
        _collectPayment(quote);

        records[node] = SubdomainRecord({
            owner: quote.subdomainOwner,
            parentNode: parentNode,
            expiry: expiry
        });

        emit SubdomainRegistered(
            node,
            parentNode,
            quote.subdomainOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            quote.usdMicros,
            _quoteStructHash(quote)
        );
    }

    function renewWithQuote(
        string calldata parentName,
        string calldata label,
        SubdomainQuote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        if (renewalsPaused) revert RenewalsPaused();

        (bytes32 parentNode, bytes32 node) = _nodes(parentName, label);
        SubdomainRecord storage record = records[node];
        address currentOwner = ownerOf(node);
        if (currentOwner == address(0)) revert Unavailable();
        if (msg.sender != currentOwner || quote.subdomainOwner != currentOwner) {
            revert NotSubdomainOwner();
        }
        if (record.parentNode != parentNode) revert InvalidName();

        uint256 expiry = record.expiry + quote.termYears * YEAR;
        if (expiry > registry.expiryOf(parentNode)) {
            revert TermExceedsParentExpiry();
        }

        _consumeQuote(quote, quoteSignature, node, parentNode, currentOwner);
        _collectPayment(quote);

        record.expiry = expiry;
        emit SubdomainRenewed(
            node,
            currentOwner,
            msg.sender,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            quote.usdMicros,
            _quoteStructHash(quote)
        );
    }

    function transferSubdomain(bytes32 node, address newOwner) external {
        address currentOwner = ownerOf(node);
        if (currentOwner == address(0) || msg.sender != currentOwner) {
            revert NotSubdomainOwner();
        }
        if (newOwner == address(0)) revert InvalidOwner();

        records[node].owner = newOwner;
        emit SubdomainTransferred(node, currentOwner, newOwner);
    }

    function revokeSubdomain(
        string calldata parentName,
        string calldata label
    ) external {
        (bytes32 parentNode, bytes32 node) = _nodes(parentName, label);
        address parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0)) revert ParentUnavailable();
        if (
            msg.sender != parentOwner &&
            !parentOperators[parentNode][parentOwner][msg.sender]
        ) revert NotParentController();
        if (records[node].parentNode != parentNode) revert Unavailable();

        delete records[node];
        emit SubdomainRevoked(node, parentNode);
    }

    function setAddress(
        bytes32 node,
        uint256 chainId,
        address destination
    ) external {
        if (ownerOf(node) != msg.sender) revert NotSubdomainOwner();
        _addresses[node][chainId] = destination;
        emit AddressChanged(node, chainId, destination);
    }

    function ownerOf(bytes32 node) public view returns (address) {
        SubdomainRecord memory record = records[node];
        if (
            record.owner == address(0) ||
            record.expiry < block.timestamp ||
            registry.ownerOf(record.parentNode) == address(0)
        ) return address(0);
        return record.owner;
    }

    function addressOf(
        bytes32 node,
        uint256 chainId
    ) external view returns (address) {
        if (ownerOf(node) == address(0)) return address(0);
        address destination = _addresses[node][chainId];
        return destination == address(0) ? records[node].owner : destination;
    }

    function available(
        string calldata parentName,
        string calldata label
    ) external view returns (bool) {
        (bytes32 parentNode, bytes32 node) = _nodes(parentName, label);
        return
            registry.ownerOf(parentNode) != address(0) &&
            records[node].expiry < block.timestamp;
    }

    function nodeFor(
        string calldata parentName,
        string calldata label
    ) external pure returns (bytes32) {
        (, bytes32 node) = _nodes(parentName, label);
        return node;
    }

    function parentNodeFor(
        string calldata parentName
    ) public pure returns (bytes32) {
        return keccak256(bytes(_canonicalParent(parentName)));
    }

    function quoteDigest(
        SubdomainQuote calldata quote
    ) external view returns (bytes32) {
        return _hashTypedDataV4(_quoteStructHash(quote));
    }

    function _consumeQuote(
        SubdomainQuote calldata quote,
        bytes calldata signature,
        bytes32 expectedNode,
        bytes32 expectedParentNode,
        address expectedOwner
    ) internal {
        if (
            quote.node != expectedNode ||
            quote.parentNode != expectedParentNode ||
            quote.payer != msg.sender ||
            quote.subdomainOwner != expectedOwner ||
            quote.termYears == 0
        ) revert InvalidQuote();
        if (quote.issuedAt > block.timestamp) revert QuoteNotYetValid();
        if (quote.deadline < block.timestamp) revert QuoteExpired();
        if (
            quote.deadline < quote.issuedAt ||
            quote.deadline - quote.issuedAt > MAX_QUOTE_LIFETIME
        ) revert QuoteLifetimeTooLong();
        if (quote.nonce != nonces[msg.sender]) revert InvalidNonce();

        uint256 expectedUsdMicros = pricingPolicy.priceUsdMicros(
            XNSPricingPolicyV2.Product.Subdomain,
            1,
            quote.termYears
        );
        if (quote.usdMicros != expectedUsdMicros) revert InvalidQuote();
        if (!_isValidQuoteSignature(quote, signature)) revert InvalidSigner();

        nonces[msg.sender] = quote.nonce + 1;
    }

    function _isValidQuoteSignature(
        SubdomainQuote calldata quote,
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

    function _collectPayment(SubdomainQuote calldata quote) internal {
        XNSPricingPolicyV2.PricingConfig memory current = pricingPolicy.config();

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

    function _nodes(
        string calldata parentName,
        string calldata label
    ) internal pure returns (bytes32 parentNode, bytes32 node) {
        string memory canonicalParent = _canonicalParent(parentName);
        string memory canonicalLabel = _canonicalLabel(label);
        parentNode = keccak256(bytes(canonicalParent));
        node = keccak256(
            bytes(string.concat(canonicalLabel, ".", canonicalParent))
        );
    }

    function _canonicalParent(
        string calldata parentName
    ) internal pure returns (string memory) {
        bytes memory raw = bytes(parentName);
        if (
            raw.length < 6 ||
            raw.length > MAX_LABEL_LENGTH + 4 ||
            raw[raw.length - 4] != 0x2e ||
            !_isX(raw[raw.length - 3]) ||
            !_isD(raw[raw.length - 2]) ||
            !_isC(raw[raw.length - 1])
        ) revert InvalidName();

        uint256 labelLength = raw.length - 4;
        bytes memory canonical = new bytes(raw.length);
        for (uint256 i = 0; i < labelLength; i++) {
            canonical[i] = _canonicalCharacter(
                raw[i],
                i,
                labelLength
            );
        }
        canonical[labelLength] = 0x2e;
        canonical[labelLength + 1] = 0x78;
        canonical[labelLength + 2] = 0x64;
        canonical[labelLength + 3] = 0x63;
        return string(canonical);
    }

    function _canonicalLabel(
        string calldata label
    ) internal pure returns (string memory) {
        bytes memory raw = bytes(label);
        if (
            raw.length < MIN_SUBDOMAIN_LABEL_LENGTH ||
            raw.length > MAX_LABEL_LENGTH
        ) revert InvalidName();

        bytes memory canonical = new bytes(raw.length);
        for (uint256 i = 0; i < raw.length; i++) {
            canonical[i] = _canonicalCharacter(raw[i], i, raw.length);
        }
        return string(canonical);
    }

    function _canonicalCharacter(
        bytes1 char,
        uint256 index,
        uint256 length
    ) internal pure returns (bytes1) {
        uint8 code = uint8(char);
        if (code >= 65 && code <= 90) {
            code += 32;
            char = bytes1(code);
        }
        bool valid =
            (code >= 97 && code <= 122) ||
            (code >= 48 && code <= 57) ||
            char == 0x2d;
        if (!valid || (char == 0x2d && (index == 0 || index == length - 1))) {
            revert InvalidName();
        }
        return char;
    }

    function _quoteStructHash(
        SubdomainQuote calldata quote
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUOTE_TYPEHASH, quote));
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
