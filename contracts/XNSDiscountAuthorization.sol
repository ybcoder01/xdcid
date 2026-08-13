// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Verifies and consumes exact-name discount authorizations for XDCID.
/// @dev Only the configured registrar may consume an authorization. The signer
/// may be an EOA or an ERC-1271 smart-contract wallet.
contract XNSDiscountAuthorization is Ownable, EIP712 {
    uint256 public constant UPDATE_DELAY = 48 hours;
    uint256 public constant BASIS_POINTS = 10_000;

    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "DiscountAuthorization(bytes32 node,address beneficiary,uint8 product,uint256 termYears,uint16 discountBps,uint32 maxUses,uint64 validAfter,uint64 deadline,uint256 nonce)"
    );

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

    address public authorizationSigner;
    address public consumer;

    address public pendingAuthorizationSigner;
    address public pendingConsumer;
    uint256 public pendingActivationTime;
    bool public hasPendingConfiguration;

    mapping(bytes32 => uint256) public uses;
    mapping(bytes32 => bool) public revoked;

    error InvalidConfiguration();
    error NoPendingConfiguration();
    error UpdateDelayActive();
    error UnauthorizedConsumer();
    error InvalidAuthorization();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationExhausted();
    error AuthorizationIsRevoked();
    error InvalidSignature();
    error AlreadyRevoked();

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
        address initialOwner,
        address initialAuthorizationSigner,
        address initialConsumer
    )
        Ownable(initialOwner)
        EIP712("XDCID Discount Authorization", "1")
    {
        _validateConfiguration(
            initialAuthorizationSigner,
            initialConsumer
        );
        authorizationSigner = initialAuthorizationSigner;
        consumer = initialConsumer;
        emit ConfigurationActivated(
            initialAuthorizationSigner,
            initialConsumer
        );
    }

    modifier onlyConsumer() {
        if (msg.sender != consumer) revert UnauthorizedConsumer();
        _;
    }

    function proposeConfiguration(
        address nextAuthorizationSigner,
        address nextConsumer
    ) external onlyOwner {
        _validateConfiguration(nextAuthorizationSigner, nextConsumer);
        pendingAuthorizationSigner = nextAuthorizationSigner;
        pendingConsumer = nextConsumer;
        pendingActivationTime = block.timestamp + UPDATE_DELAY;
        hasPendingConfiguration = true;
        emit ConfigurationProposed(
            nextAuthorizationSigner,
            nextConsumer,
            pendingActivationTime
        );
    }

    function cancelPendingConfiguration() external onlyOwner {
        if (!hasPendingConfiguration) revert NoPendingConfiguration();
        delete pendingAuthorizationSigner;
        delete pendingConsumer;
        delete pendingActivationTime;
        hasPendingConfiguration = false;
        emit ConfigurationCancelled();
    }

    function activatePendingConfiguration() external {
        if (!hasPendingConfiguration) revert NoPendingConfiguration();
        if (block.timestamp < pendingActivationTime) {
            revert UpdateDelayActive();
        }

        authorizationSigner = pendingAuthorizationSigner;
        consumer = pendingConsumer;
        delete pendingAuthorizationSigner;
        delete pendingConsumer;
        delete pendingActivationTime;
        hasPendingConfiguration = false;

        emit ConfigurationActivated(authorizationSigner, consumer);
    }

    function consume(
        DiscountAuthorization calldata authorization,
        bytes calldata signature,
        bytes32 expectedNode,
        address expectedBeneficiary,
        uint8 expectedProduct,
        uint256 expectedTermYears
    ) external onlyConsumer returns (uint16 discountBps) {
        if (
            authorization.node != expectedNode ||
            authorization.beneficiary != expectedBeneficiary ||
            authorization.product != expectedProduct ||
            authorization.termYears != expectedTermYears ||
            authorization.beneficiary == address(0) ||
            authorization.discountBps == 0 ||
            authorization.discountBps > BASIS_POINTS ||
            authorization.maxUses == 0 ||
            authorization.deadline < authorization.validAfter
        ) {
            revert InvalidAuthorization();
        }
        if (block.timestamp < authorization.validAfter) {
            revert AuthorizationNotYetValid();
        }
        if (block.timestamp > authorization.deadline) {
            revert AuthorizationExpired();
        }

        bytes32 authorizationHash = hashAuthorization(authorization);
        if (revoked[authorizationHash]) revert AuthorizationIsRevoked();

        uint256 useCount = uses[authorizationHash];
        if (useCount >= authorization.maxUses) {
            revert AuthorizationExhausted();
        }

        bytes32 digest = _hashTypedDataV4(authorizationHash);
        if (
            !SignatureChecker.isValidSignatureNow(
                authorizationSigner,
                digest,
                signature
            )
        ) {
            revert InvalidSignature();
        }

        uint256 nextUse = useCount + 1;
        uses[authorizationHash] = nextUse;
        emit AuthorizationConsumed(
            authorizationHash,
            authorization.node,
            authorization.beneficiary,
            authorization.discountBps,
            nextUse,
            authorization.maxUses
        );
        return authorization.discountBps;
    }

    function revoke(
        DiscountAuthorization calldata authorization
    ) external onlyOwner {
        bytes32 authorizationHash = hashAuthorization(authorization);
        if (revoked[authorizationHash]) revert AlreadyRevoked();
        revoked[authorizationHash] = true;
        emit AuthorizationRevoked(authorizationHash);
    }

    function isUsable(
        DiscountAuthorization calldata authorization,
        bytes calldata signature
    ) external view returns (bool) {
        bytes32 authorizationHash = hashAuthorization(authorization);
        if (
            authorization.beneficiary == address(0) ||
            authorization.discountBps == 0 ||
            authorization.discountBps > BASIS_POINTS ||
            authorization.maxUses == 0 ||
            authorization.deadline < authorization.validAfter ||
            block.timestamp < authorization.validAfter ||
            block.timestamp > authorization.deadline ||
            revoked[authorizationHash] ||
            uses[authorizationHash] >= authorization.maxUses
        ) {
            return false;
        }
        return SignatureChecker.isValidSignatureNow(
            authorizationSigner,
            _hashTypedDataV4(authorizationHash),
            signature
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

    function applyDiscount(
        uint256 grossUsdMicros,
        uint16 discountBps
    ) external pure returns (uint256) {
        if (discountBps > BASIS_POINTS) revert InvalidAuthorization();
        if (discountBps == BASIS_POINTS) return 0;
        uint256 numerator =
            grossUsdMicros * (BASIS_POINTS - discountBps);
        return (numerator + BASIS_POINTS - 1) / BASIS_POINTS;
    }

    function _validateConfiguration(
        address signer,
        address targetConsumer
    ) internal pure {
        if (signer == address(0) || targetConsumer == address(0)) {
            revert InvalidConfiguration();
        }
    }
}
