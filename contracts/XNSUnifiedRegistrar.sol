// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./XNSRegistryV3.sol";
import "./XNSPricingPolicyV2.sol";
import "./XNSPricingPolicyCompatibility.sol";

interface IXNSPrimaryInitializerV4 {
    function initializePrimaryName(
        address account,
        string calldata name
    ) external returns (bool initialized);

    function importLegacyRoutes(
        bytes32 node,
        address recordOwner,
        uint256[5] calldata chainIds,
        address[5] calldata targets
    ) external;
}

interface IXNSLegacySubdomainRegistrar {
    function records(
        bytes32 node
    ) external view returns (address owner, bytes32 parentNode, uint256 expiry);

    function ownerOf(bytes32 node) external view returns (address);

    function addressOf(bytes32 node, uint256 chainId) external view returns (address);
}

/// @notice Registration, discounts, and parent-controlled subdomain policy.
/// @dev Registry V3 remains the sole ownership source. The registrar never holds
/// payments and commits state before the external treasury interaction. Pricing
/// remains in the independently administered XNSPricingPolicyV2 contract.
contract XNSUnifiedRegistrar is Ownable2Step, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YEAR = 365 days;
    uint256 public constant UPDATE_DELAY = 48 hours;
    uint256 public constant MAX_QUOTE_LIFETIME = 15 minutes;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_LABEL_LENGTH = 2;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    enum Product {
        Registration,
        Renewal,
        SubdomainRegistration,
        SubdomainRenewal
    }

    struct Quote {
        bytes32 node;
        bytes32 parentNode;
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

    struct DiscountAuthorization {
        bytes32 node;
        address beneficiary;
        uint8 product;
        uint256 termYears;
        uint16 discountBps;
        uint32 maxUses;
        uint64 validAfter;
        uint64 deadline;
        uint256 nonce;
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 node,bytes32 parentNode,address payer,address nameOwner,uint8 product,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline)"
    );
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "DiscountAuthorization(bytes32 node,address beneficiary,uint8 product,uint256 termYears,uint16 discountBps,uint32 maxUses,uint64 validAfter,uint64 deadline,uint256 nonce)"
    );
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant DISCOUNT_DOMAIN_NAME_HASH = keccak256(
        "XDCID Discount Authorization"
    );
    bytes32 private constant DOMAIN_VERSION_HASH = keccak256("1");

    XNSRegistryV3 public immutable registry;
    IXNSPrimaryInitializerV4 public immutable resolver;
    IXNSLegacySubdomainRegistrar public immutable legacySubdomains;
    XNSPricingPolicyV2 public immutable pricingPolicy;

    address public authorizationSigner;
    address public pendingAuthorizationSigner;
    uint256 public pendingActivationTime;
    bool public hasPendingConfiguration;

    mapping(address => uint256) public nonces;
    mapping(bytes32 => uint256) public uses;
    mapping(bytes32 => bool) public revoked;

    bool public topLevelRegistrationsPaused;
    bool public topLevelRenewalsPaused;
    bool public subdomainRegistrationsPaused;
    bool public subdomainRenewalsPaused;

    error AlreadyMigrated();
    error AuthorizationExhausted();
    error AuthorizationExpired();
    error AuthorizationIsRevoked();
    error AuthorizationNotYetValid();
    error ChildExpiryExceedsParent();
    error InvalidAuthorization();
    error InvalidConfiguration();
    error InvalidDependency();
    error InvalidName();
    error InvalidNameOwner();
    error InvalidNonce();
    error InvalidPaymentToken();
    error InvalidProduct();
    error InvalidQuote();
    error InvalidQuoteVersion();
    error InvalidSignature();
    error InvalidSigner();
    error InvalidTerm();
    error MigrationUnavailable();
    error NameUnavailable();
    error NoPendingConfiguration();
    error NotParentOwner();
    error NotTopLevelOwner();
    error PaymentDisabled();
    error PaymentTransferFailed();
    error QuoteExpired();
    error QuoteLifetimeTooLong();
    error QuoteNotYetValid();
    error RegistrationsPaused();
    error RenewalsPaused();
    error UpdateDelayActive();
    error WrongPaymentAmount();

    event ConfigurationProposed(
        address indexed authorizationSigner,
        address indexed consumer,
        uint256 activationTime
    );
    event ConfigurationCancelled();
    event ConfigurationActivated(
        address indexed authorizationSigner,
        address indexed consumer
    );
    event PauseStateChanged(
        bool topLevelRegistrations,
        bool topLevelRenewals,
        bool subdomainRegistrations,
        bool subdomainRenewals
    );
    event RegistrationPaid(
        bytes32 indexed node,
        address indexed payer,
        address indexed nameOwner,
        uint8 product,
        uint256 expiry,
        address paymentToken,
        uint256 paymentAmount,
        uint256 grossUsdMicros,
        uint256 netUsdMicros,
        uint16 discountBps,
        bytes32 quoteHash
    );
    event SubdomainMigrated(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed subdomainOwner,
        uint256 expiry
    );
    event PrimaryInitializationAttempted(
        bytes32 indexed node,
        address indexed nameOwner,
        bool initialized
    );
    event AuthorizationConsumed(
        bytes32 indexed authorizationHash,
        bytes32 indexed node,
        address indexed beneficiary,
        uint16 discountBps,
        uint256 useNumber,
        uint256 maxUses
    );
    event AuthorizationRevoked(bytes32 indexed authorizationHash);

    constructor(
        XNSRegistryV3 registry_,
        IXNSPrimaryInitializerV4 resolver_,
        IXNSLegacySubdomainRegistrar legacySubdomains_,
        XNSPricingPolicyV2 pricingPolicy_,
        address initialAuthorizationSigner,
        address initialOwner
    ) Ownable(initialOwner) EIP712("XDCID Unified Registrar", "1") {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0 ||
            address(resolver_) == address(0) ||
            address(resolver_).code.length == 0 ||
            (address(legacySubdomains_) != address(0) &&
                address(legacySubdomains_).code.length == 0) ||
            address(pricingPolicy_) == address(0) ||
            address(pricingPolicy_).code.length == 0
        ) revert InvalidDependency();
        if (initialAuthorizationSigner == address(0)) {
            revert InvalidConfiguration();
        }
        registry = registry_;
        resolver = resolver_;
        legacySubdomains = legacySubdomains_;
        pricingPolicy = pricingPolicy_;
        authorizationSigner = initialAuthorizationSigner;
        emit ConfigurationActivated(initialAuthorizationSigner, address(this));
    }

    /// @notice Compatibility hook used by the existing dashboard and SDK.
    function discountAuthorization() external view returns (address) {
        return address(this);
    }

    /// @notice The consolidated authorization consumer is always this registrar.
    function consumer() external view returns (address) {
        return address(this);
    }

    function pendingConsumer() external view returns (address) {
        return hasPendingConfiguration ? address(this) : address(0);
    }

    /// @notice Preserves the previous configuration ABI. The consumer cannot
    /// be changed after consolidation because only this registrar may consume.
    function proposeConfiguration(
        address nextAuthorizationSigner,
        address nextConsumer
    ) external onlyOwner {
        if (
            nextAuthorizationSigner == address(0) ||
            nextConsumer != address(this)
        ) revert InvalidConfiguration();
        pendingAuthorizationSigner = nextAuthorizationSigner;
        pendingActivationTime = block.timestamp + UPDATE_DELAY;
        hasPendingConfiguration = true;
        emit ConfigurationProposed(
            nextAuthorizationSigner,
            address(this),
            pendingActivationTime
        );
    }

    function cancelPendingConfiguration() external onlyOwner {
        if (!hasPendingConfiguration) revert NoPendingConfiguration();
        delete pendingAuthorizationSigner;
        delete pendingActivationTime;
        hasPendingConfiguration = false;
        emit ConfigurationCancelled();
    }

    function activatePendingConfiguration() external {
        if (!hasPendingConfiguration) revert NoPendingConfiguration();
        if (block.timestamp < pendingActivationTime) revert UpdateDelayActive();
        authorizationSigner = pendingAuthorizationSigner;
        delete pendingAuthorizationSigner;
        delete pendingActivationTime;
        hasPendingConfiguration = false;
        emit ConfigurationActivated(authorizationSigner, address(this));
    }

    function setPauseState(
        bool pauseTopLevelRegistrations,
        bool pauseTopLevelRenewals,
        bool pauseSubdomainRegistrations,
        bool pauseSubdomainRenewals
    ) external onlyOwner {
        topLevelRegistrationsPaused = pauseTopLevelRegistrations;
        topLevelRenewalsPaused = pauseTopLevelRenewals;
        subdomainRegistrationsPaused = pauseSubdomainRegistrations;
        subdomainRenewalsPaused = pauseSubdomainRenewals;
        emit PauseStateChanged(
            pauseTopLevelRegistrations,
            pauseTopLevelRenewals,
            pauseSubdomainRegistrations,
            pauseSubdomainRenewals
        );
    }

    function register(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _register(name, quote, quoteSignature, 0);
    }

    function registerWithDiscount(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discount = _consumeDiscount(
            authorization,
            authorizationSignature,
            quote
        );
        _register(name, quote, quoteSignature, discount);
    }

    function renew(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _renew(name, quote, quoteSignature, 0);
    }

    function renewWithDiscount(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discount = _consumeDiscount(
            authorization,
            authorizationSignature,
            quote
        );
        _renew(name, quote, quoteSignature, discount);
    }

    function registerSubdomain(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _registerSubdomain(parentName, label, quote, quoteSignature, 0);
    }

    function registerSubdomainWithDiscount(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata quoteSignature,
        DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discount = _consumeDiscount(
            authorization,
            authorizationSignature,
            quote
        );
        _registerSubdomain(
            parentName,
            label,
            quote,
            quoteSignature,
            discount
        );
    }

    function renewSubdomain(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable nonReentrant {
        _renewSubdomain(parentName, label, quote, quoteSignature, 0);
    }

    function renewSubdomainWithDiscount(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata quoteSignature,
        DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable nonReentrant {
        uint16 discount = _consumeDiscount(
            authorization,
            authorizationSignature,
            quote
        );
        _renewSubdomain(
            parentName,
            label,
            quote,
            quoteSignature,
            discount
        );
    }

    function _renewSubdomain(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata quoteSignature,
        uint16 discountBps
    ) private {
        if (subdomainRenewalsPaused) revert RenewalsPaused();
        (bytes32 parentNode, bytes32 node, ) = _subdomainNodes(
            parentName,
            label
        );
        _requireParentOwner(parentNode);
        XNSRegistryV3.Record memory record = registry.records(node);
        if (
            record.kind != XNSRegistryV3.NameKind.Subdomain ||
            record.parentNode != parentNode ||
            quote.nameOwner != record.owner
        ) revert NameUnavailable();
        _validateQuote(
            quote,
            quoteSignature,
            node,
            parentNode,
            Product.SubdomainRenewal,
            bytes(label).length,
            discountBps
        );
        uint256 base = record.expiry < block.timestamp
            ? block.timestamp
            : record.expiry;
        uint256 expiry = base + quote.termYears * YEAR;
        if (expiry > registry.expiryOf(parentNode)) {
            revert ChildExpiryExceedsParent();
        }
        registry.renewSubdomain(node, expiry);
        _collectPayment(quote);
        _emitPayment(node, expiry, discountBps, quote);
    }

    function reassignSubdomain(
        string calldata parentName,
        string calldata label,
        address newOwner
    ) external nonReentrant {
        (bytes32 parentNode, bytes32 node, ) = _subdomainNodes(
            parentName,
            label
        );
        _requireParentOwner(parentNode);
        registry.reassignSubdomain(node, newOwner);
    }

    function recallSubdomain(
        string calldata parentName,
        string calldata label
    ) external nonReentrant {
        (bytes32 parentNode, bytes32 node, ) = _subdomainNodes(
            parentName,
            label
        );
        address parentOwner = _requireParentOwner(parentNode);
        registry.reassignSubdomain(node, parentOwner);
    }

    function releaseSubdomain(
        string calldata parentName,
        string calldata label
    ) external nonReentrant {
        (bytes32 parentNode, bytes32 node, ) = _subdomainNodes(
            parentName,
            label
        );
        _requireParentOwner(parentNode);
        registry.releaseSubdomain(node);
    }

    /// @notice Permissionless, exact-state import from the frozen legacy module.
    function migrateSubdomain(bytes32 node) external nonReentrant {
        if (address(legacySubdomains) == address(0)) {
            revert MigrationUnavailable();
        }
        if (registry.ownershipGenerations(node) != 0) revert AlreadyMigrated();
        (address oldOwner, bytes32 parentNode, uint256 expiry) =
            legacySubdomains.records(node);
        if (
            oldOwner == address(0) ||
            legacySubdomains.ownerOf(node) != oldOwner ||
            expiry < block.timestamp
        ) revert MigrationUnavailable();
        registry.registerSubdomain(node, parentNode, oldOwner, expiry);
        uint256[5] memory chainIds = [
            uint256(50),
            uint256(1),
            uint256(8453),
            uint256(42161),
            uint256(137)
        ];
        address[5] memory targets = [
            legacySubdomains.addressOf(node, chainIds[0]),
            legacySubdomains.addressOf(node, chainIds[1]),
            legacySubdomains.addressOf(node, chainIds[2]),
            legacySubdomains.addressOf(node, chainIds[3]),
            legacySubdomains.addressOf(node, chainIds[4])
        ];
        resolver.importLegacyRoutes(node, oldOwner, chainIds, targets);
        emit SubdomainMigrated(node, parentNode, oldOwner, expiry);
    }

    function revokeDiscount(
        DiscountAuthorization calldata authorization
    ) external onlyOwner {
        _revokeDiscount(authorization);
    }

    /// @notice Compatibility alias for the previous authorization contract.
    function revoke(
        DiscountAuthorization calldata authorization
    ) external onlyOwner {
        _revokeDiscount(authorization);
    }

    function _revokeDiscount(
        DiscountAuthorization calldata authorization
    ) private {
        bytes32 authHash = hashAuthorization(authorization);
        if (revoked[authHash]) revert AuthorizationIsRevoked();
        revoked[authHash] = true;
        emit AuthorizationRevoked(authHash);
    }

    function available(string calldata name) external view returns (bool) {
        bytes32 node = keccak256(bytes(canonicalizeTopLevel(name)));
        return registry.ownerOf(node) == address(0) && registry.expiryOf(node) < block.timestamp;
    }

    function nodeFor(string calldata name) external pure returns (bytes32) {
        return keccak256(bytes(canonicalizeTopLevel(name)));
    }

    function subdomainNodeFor(
        string calldata parentName,
        string calldata label
    ) external pure returns (bytes32) {
        (, bytes32 node, ) = _subdomainNodes(parentName, label);
        return node;
    }

    function quoteDigest(Quote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(_quoteHash(quote));
    }

    function priceUsdMicrosForVersion(
        Product product,
        uint256 labelLength,
        uint256 years_,
        uint256 targetVersion
    ) public view returns (uint256) {
        return XNSPricingPolicyCompatibility.priceUsdMicrosForVersion(
            pricingPolicy,
            _pricingProduct(product),
            labelLength,
            years_,
            targetVersion
        );
    }

    function hashAuthorization(
        DiscountAuthorization calldata authorization
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                AUTHORIZATION_TYPEHASH,
                authorization.node,
                authorization.beneficiary,
                authorization.product,
                authorization.termYears,
                authorization.discountBps,
                authorization.maxUses,
                authorization.validAfter,
                authorization.deadline,
                authorization.nonce
            )
        );
    }

    /// @notice Preserves the dashboard's preflight validation interface.
    function isUsable(
        DiscountAuthorization calldata authorization,
        bytes calldata signature
    ) external view returns (bool) {
        bytes32 authHash = hashAuthorization(authorization);
        if (
            authorization.beneficiary == address(0) ||
            authorization.discountBps == 0 ||
            authorization.discountBps > BASIS_POINTS ||
            authorization.maxUses == 0 ||
            authorization.deadline < authorization.validAfter ||
            block.timestamp < authorization.validAfter ||
            block.timestamp > authorization.deadline ||
            revoked[authHash] ||
            uses[authHash] >= authorization.maxUses
        ) return false;
        return SignatureChecker.isValidSignatureNow(
            authorizationSigner,
            _discountDigest(authHash),
            signature
        );
    }

    function applyDiscount(
        uint256 grossUsdMicros,
        uint16 discountBps
    ) external pure returns (uint256) {
        return _applyDiscount(grossUsdMicros, discountBps);
    }

    function canonicalizeTopLevel(
        string calldata name
    ) public pure returns (string memory) {
        bytes memory raw = bytes(name);
        uint256 labelLength = _topLevelLabelLength(raw);
        bytes memory canonical = new bytes(raw.length);
        for (uint256 i = 0; i < labelLength; i++) {
            canonical[i] = _canonicalCharacter(raw[i], i, labelLength);
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
        bytes calldata signature,
        uint16 discountBps
    ) private {
        if (topLevelRegistrationsPaused) revert RegistrationsPaused();
        string memory canonical = canonicalizeTopLevel(name);
        bytes32 node = keccak256(bytes(canonical));
        uint256 labelLength = bytes(canonical).length - 4;
        _validateQuote(
            quote,
            signature,
            node,
            bytes32(0),
            Product.Registration,
            labelLength,
            discountBps
        );
        uint256 expiry = block.timestamp + quote.termYears * YEAR;
        registry.registerTopLevel(node, quote.nameOwner, expiry);
        if (quote.nameOwner == msg.sender) {
            bool initialized = resolver.initializePrimaryName(
                quote.nameOwner,
                canonical
            );
            emit PrimaryInitializationAttempted(
                node,
                quote.nameOwner,
                initialized
            );
        }
        _collectPayment(quote);
        _emitPayment(node, expiry, discountBps, quote);
    }

    function _renew(
        string calldata name,
        Quote calldata quote,
        bytes calldata signature,
        uint16 discountBps
    ) private {
        if (topLevelRenewalsPaused) revert RenewalsPaused();
        string memory canonical = canonicalizeTopLevel(name);
        bytes32 node = keccak256(bytes(canonical));
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0) || currentOwner != msg.sender) {
            revert NotTopLevelOwner();
        }
        if (quote.nameOwner != currentOwner) revert InvalidQuote();
        _validateQuote(
            quote,
            signature,
            node,
            bytes32(0),
            Product.Renewal,
            bytes(canonical).length - 4,
            discountBps
        );
        uint256 expiry = registry.expiryOf(node) + quote.termYears * YEAR;
        registry.renewTopLevel(node, expiry);
        _collectPayment(quote);
        _emitPayment(node, expiry, discountBps, quote);
    }

    function _registerSubdomain(
        string calldata parentName,
        string calldata label,
        Quote calldata quote,
        bytes calldata signature,
        uint16 discountBps
    ) private {
        if (subdomainRegistrationsPaused) revert RegistrationsPaused();
        (bytes32 parentNode, bytes32 node, ) = _subdomainNodes(
            parentName,
            label
        );
        _requireParentOwner(parentNode);
        _validateQuote(
            quote,
            signature,
            node,
            parentNode,
            Product.SubdomainRegistration,
            bytes(label).length,
            discountBps
        );
        uint256 expiry = block.timestamp + quote.termYears * YEAR;
        if (expiry > registry.expiryOf(parentNode)) {
            revert ChildExpiryExceedsParent();
        }
        registry.registerSubdomain(node, parentNode, quote.nameOwner, expiry);
        // The parent may assign a child without acceptance, but can never set
        // another wallet's primary. The recipient selects it explicitly.
        _collectPayment(quote);
        _emitPayment(node, expiry, discountBps, quote);
    }

    function _validateQuote(
        Quote calldata quote,
        bytes calldata signature,
        bytes32 node,
        bytes32 parentNode,
        Product product,
        uint256 labelLength,
        uint16 discountBps
    ) private {
        if (
            quote.node != node ||
            quote.parentNode != parentNode ||
            quote.payer != msg.sender ||
            quote.nameOwner == address(0) ||
            quote.product != uint8(product) ||
            quote.termYears == 0
        ) revert InvalidQuote();
        if (quote.issuedAt > block.timestamp) revert QuoteNotYetValid();
        if (quote.deadline < block.timestamp) revert QuoteExpired();
        if (
            quote.deadline < quote.issuedAt ||
            quote.deadline - quote.issuedAt > MAX_QUOTE_LIFETIME
        ) revert QuoteLifetimeTooLong();
        if (quote.nonce != nonces[msg.sender]) revert InvalidNonce();

        uint256 gross = priceUsdMicrosForVersion(
            product,
            labelLength,
            quote.termYears,
            quote.policyVersion
        );
        uint256 net = _applyDiscount(gross, discountBps);
        if (quote.usdMicros != net) revert InvalidQuote();
        if (!_isValidQuoteSignature(quote, signature)) revert InvalidSigner();
        nonces[msg.sender] = quote.nonce + 1;
    }

    function _isValidQuoteSignature(
        Quote calldata quote,
        bytes calldata signature
    ) private view returns (bool) {
        bytes32 digest = _hashTypedDataV4(_quoteHash(quote));
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

    function _consumeDiscount(
        DiscountAuthorization calldata authorization,
        bytes calldata signature,
        Quote calldata quote
    ) private returns (uint16) {
        if (
            authorization.node != quote.node ||
            authorization.beneficiary != quote.nameOwner ||
            authorization.product != quote.product ||
            authorization.termYears != quote.termYears ||
            authorization.beneficiary == address(0) ||
            authorization.discountBps == 0 ||
            authorization.discountBps > BASIS_POINTS ||
            authorization.maxUses == 0 ||
            authorization.deadline < authorization.validAfter
        ) revert InvalidAuthorization();
        if (block.timestamp < authorization.validAfter) {
            revert AuthorizationNotYetValid();
        }
        if (block.timestamp > authorization.deadline) {
            revert AuthorizationExpired();
        }
        bytes32 authHash = hashAuthorization(authorization);
        if (revoked[authHash]) revert AuthorizationIsRevoked();
        uint256 used = uses[authHash];
        if (used >= authorization.maxUses) revert AuthorizationExhausted();
        if (
            !SignatureChecker.isValidSignatureNow(
                authorizationSigner,
                _discountDigest(authHash),
                signature
            )
        ) revert InvalidSignature();
        uses[authHash] = used + 1;
        emit AuthorizationConsumed(
            authHash,
            authorization.node,
            authorization.beneficiary,
            authorization.discountBps,
            used + 1,
            authorization.maxUses
        );
        return authorization.discountBps;
    }

    function _collectPayment(Quote calldata quote) private {
        XNSPricingPolicyV2.PricingConfig memory current = pricingPolicy.config();
        if (quote.usdMicros == 0) {
            if (msg.value != 0 || quote.paymentAmount != 0) {
                revert WrongPaymentAmount();
            }
            return;
        }
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

    function _emitPayment(
        bytes32 node,
        uint256 expiry,
        uint16 discountBps,
        Quote calldata quote
    ) private {
        uint256 gross = quote.usdMicros == 0
            ? 0
            : _grossFromNet(quote.usdMicros, discountBps);
        emit RegistrationPaid(
            node,
            quote.payer,
            quote.nameOwner,
            quote.product,
            expiry,
            quote.paymentToken,
            quote.paymentAmount,
            gross,
            quote.usdMicros,
            discountBps,
            _quoteHash(quote)
        );
    }

    function _pricingProduct(
        Product product
    ) private pure returns (XNSPricingPolicyV2.Product) {
        if (product == Product.Registration) {
            return XNSPricingPolicyV2.Product.Registration;
        }
        if (product == Product.Renewal) {
            return XNSPricingPolicyV2.Product.Renewal;
        }
        return XNSPricingPolicyV2.Product.Subdomain;
    }

    function _requireParentOwner(
        bytes32 parentNode
    ) private view returns (address parentOwner) {
        parentOwner = registry.ownerOf(parentNode);
        if (parentOwner == address(0) || parentOwner != msg.sender) {
            revert NotParentOwner();
        }
        if (registry.kindOf(parentNode) != XNSRegistryV3.NameKind.TopLevel) {
            revert NotParentOwner();
        }
    }

    function _subdomainNodes(
        string calldata parentName,
        string calldata label
    ) private pure returns (
        bytes32 parentNode,
        bytes32 node,
        string memory fullName
    ) {
        string memory canonicalParent = canonicalizeTopLevel(parentName);
        bytes memory rawLabel = bytes(label);
        if (rawLabel.length == 0 || rawLabel.length > MAX_LABEL_LENGTH) {
            revert InvalidName();
        }
        bytes memory canonicalLabel = new bytes(rawLabel.length);
        for (uint256 i = 0; i < rawLabel.length; i++) {
            canonicalLabel[i] = _canonicalCharacter(
                rawLabel[i],
                i,
                rawLabel.length
            );
        }
        fullName = string.concat(string(canonicalLabel), ".", canonicalParent);
        parentNode = keccak256(bytes(canonicalParent));
        node = keccak256(bytes(fullName));
    }

    function _topLevelLabelLength(
        bytes memory raw
    ) private pure returns (uint256) {
        if (
            raw.length < MIN_LABEL_LENGTH + 4 ||
            raw.length > MAX_LABEL_LENGTH + 4
        ) revert InvalidName();
        uint256 dot = raw.length - 4;
        if (
            raw[dot] != 0x2e ||
            !_eqIgnoreCase(raw[dot + 1], 0x78) ||
            !_eqIgnoreCase(raw[dot + 2], 0x64) ||
            !_eqIgnoreCase(raw[dot + 3], 0x63)
        ) revert InvalidName();
        return dot;
    }

    function _canonicalCharacter(
        bytes1 character,
        uint256 index,
        uint256 length
    ) private pure returns (bytes1) {
        uint8 code = uint8(character);
        if (code >= 65 && code <= 90) code += 32;
        bool valid =
            (code >= 97 && code <= 122) ||
            (code >= 48 && code <= 57) ||
            code == 45;
        if (!valid || (code == 45 && (index == 0 || index + 1 == length))) {
            revert InvalidName();
        }
        return bytes1(code);
    }

    function _eqIgnoreCase(bytes1 character, bytes1 lower) private pure returns (bool) {
        return character == lower || uint8(character) + 32 == uint8(lower);
    }

    function _applyDiscount(
        uint256 gross,
        uint16 discountBps
    ) private pure returns (uint256) {
        if (discountBps > BASIS_POINTS) revert InvalidAuthorization();
        return _divideRoundingUp(
            gross * (BASIS_POINTS - discountBps),
            BASIS_POINTS
        );
    }

    function _grossFromNet(
        uint256 net,
        uint16 discountBps
    ) private pure returns (uint256) {
        if (discountBps == 0) return net;
        return _divideRoundingUp(
            net * BASIS_POINTS,
            BASIS_POINTS - discountBps
        );
    }

    function _quoteHash(Quote calldata quote) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.node,
                quote.parentNode,
                quote.payer,
                quote.nameOwner,
                quote.product,
                quote.termYears,
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

    function _discountDigest(
        bytes32 authorizationHash
    ) private view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                DISCOUNT_DOMAIN_NAME_HASH,
                DOMAIN_VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, authorizationHash)
        );
    }

    function _divideRoundingUp(
        uint256 numerator,
        uint256 denominator
    ) private pure returns (uint256) {
        return (numerator + denominator - 1) / denominator;
    }
}
