// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface ILegacyXNSRegistry {
    function records(
        bytes32 node
    ) external view returns (address owner, address resolver, uint256 expiry);

    function ownerOf(bytes32 node) external view returns (address);
}

/// @notice Long-lived XDCID ownership registry with lazy legacy migration.
/// @dev Unmigrated names remain readable from the immutable legacy Registry.
/// A state-changing owner action anchors the name here. Resolver records bind
/// to ownershipGenerations so no record can reactivate in a later lifecycle.
contract XNSRegistryV2 is Ownable2Step {
    struct Record {
        address owner;
        address resolver;
        uint256 expiry;
    }

    uint256 public constant REGISTRAR_CHANGE_DELAY = 2 days;

    ILegacyXNSRegistry public immutable legacyRegistry;
    mapping(bytes32 => Record) private _records;
    mapping(bytes32 => uint256) private _ownershipGenerations;
    mapping(bytes32 => bool) public migrated;

    address public registrar;
    address public pendingRegistrar;
    uint256 public pendingRegistrarActivationTime;

    error AlreadyMigrated();
    error InvalidLegacyRegistry();
    error InvalidExpiry();
    error InvalidNameOwner();
    error InvalidRegistrar();
    error MigrationRequiresLegacyOwner();
    error NameUnavailable();
    error NoPendingRegistrar();
    error NotNameOwner();
    error NotRegistrar();
    error RegistrarAlreadyInitialized();
    error RegistrarChangeNotReady();

    event NameMigrated(
        bytes32 indexed node,
        address indexed nameOwner,
        uint256 expiry
    );
    event NameRegistered(
        bytes32 indexed node,
        address indexed nameOwner,
        uint256 expiry
    );
    event NameTransferred(
        bytes32 indexed node,
        address indexed previousOwner,
        address indexed newOwner
    );
    event OwnershipGenerationAdvanced(
        bytes32 indexed node,
        uint256 previousGeneration,
        uint256 newGeneration
    );
    event RegistrarChanged(
        address indexed previousRegistrar,
        address indexed newRegistrar
    );
    event RegistrarChangeProposed(
        address indexed currentRegistrar,
        address indexed proposedRegistrar,
        uint256 activationTime
    );
    event RegistrarChangeCancelled(address indexed proposedRegistrar);
    event ResolverChanged(
        bytes32 indexed node,
        address indexed nameOwner,
        address indexed resolver
    );

    constructor(
        address initialOwner,
        ILegacyXNSRegistry legacyRegistry_
    ) Ownable(initialOwner) {
        if (
            address(legacyRegistry_) == address(0) ||
            address(legacyRegistry_).code.length == 0
        ) revert InvalidLegacyRegistry();
        legacyRegistry = legacyRegistry_;
    }

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    /// @notice Initializes the first registrar exactly once.
    /// Future rotations must use the delayed propose/activate flow.
    function setRegistrar(address initialRegistrar) external onlyOwner {
        if (initialRegistrar == address(0)) revert InvalidRegistrar();
        if (registrar != address(0)) revert RegistrarAlreadyInitialized();
        registrar = initialRegistrar;
        emit RegistrarChanged(address(0), initialRegistrar);
    }

    function proposeRegistrar(address newRegistrar) external onlyOwner {
        if (newRegistrar == address(0) || newRegistrar == registrar) {
            revert InvalidRegistrar();
        }
        pendingRegistrar = newRegistrar;
        pendingRegistrarActivationTime =
            block.timestamp +
            REGISTRAR_CHANGE_DELAY;
        emit RegistrarChangeProposed(
            registrar,
            newRegistrar,
            pendingRegistrarActivationTime
        );
    }

    function cancelRegistrarChange() external onlyOwner {
        address proposedRegistrar = pendingRegistrar;
        if (proposedRegistrar == address(0)) revert NoPendingRegistrar();
        delete pendingRegistrar;
        delete pendingRegistrarActivationTime;
        emit RegistrarChangeCancelled(proposedRegistrar);
    }

    function activateRegistrar() external onlyOwner {
        address newRegistrar = pendingRegistrar;
        if (newRegistrar == address(0)) revert NoPendingRegistrar();
        if (block.timestamp < pendingRegistrarActivationTime) {
            revert RegistrarChangeNotReady();
        }
        address previousRegistrar = registrar;
        registrar = newRegistrar;
        delete pendingRegistrar;
        delete pendingRegistrarActivationTime;
        emit RegistrarChanged(previousRegistrar, newRegistrar);
    }

    /// @notice Lets the active legacy owner explicitly anchor a name in V2.
    function migrateName(bytes32 node) external {
        if (migrated[node]) revert AlreadyMigrated();
        (address legacyOwner, address legacyResolver, uint256 legacyExpiry) =
            legacyRegistry.records(node);
        if (
            legacyOwner != msg.sender ||
            legacyExpiry < block.timestamp ||
            legacyRegistry.ownerOf(node) != msg.sender
        ) revert MigrationRequiresLegacyOwner();

        _records[node] = Record({
            owner: legacyOwner,
            resolver: legacyResolver,
            expiry: legacyExpiry
        });
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit NameMigrated(node, legacyOwner, legacyExpiry);
    }

    function register(
        bytes32 node,
        address nameOwner,
        uint256 expiry
    ) external onlyRegistrar {
        if (nameOwner == address(0)) revert InvalidNameOwner();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        address previousOwner = ownerOf(node);
        uint256 previousExpiry = expiryOf(node);
        if (previousOwner != address(0) && previousOwner != nameOwner) {
            revert NameUnavailable();
        }
        if (previousOwner == nameOwner && expiry < previousExpiry) {
            revert InvalidExpiry();
        }
        if (!migrated[node]) {
            (
                address legacyOwner,
                address legacyResolver,
                uint256 legacyExpiry
            ) =
                legacyRegistry.records(node);
            if (
                legacyOwner != address(0) ||
                legacyResolver != address(0) ||
                legacyExpiry != 0
            ) {
                _materializeLegacy(
                    node,
                    previousOwner != address(0) &&
                        previousOwner == nameOwner &&
                        previousExpiry >= block.timestamp
                );
            } else {
                migrated[node] = true;
            }
        }

        Record storage record = _records[node];
        if (
            previousOwner != nameOwner ||
            previousOwner == address(0) ||
            previousExpiry < block.timestamp
        ) {
            _clearResolver(node, previousOwner);
            _advanceOwnershipGeneration(node);
        }
        record.owner = nameOwner;
        record.expiry = expiry;
        emit NameRegistered(node, nameOwner, expiry);
    }

    function transferName(
        bytes32 node,
        address newOwner
    ) external onlyNameOwner(node) {
        if (newOwner == address(0)) revert InvalidNameOwner();
        _materializeLegacy(node, true);

        address previousOwner = _records[node].owner;
        _records[node].owner = newOwner;
        if (previousOwner != newOwner) {
            _clearResolver(node, previousOwner);
            _advanceOwnershipGeneration(node);
        }
        emit NameTransferred(node, previousOwner, newOwner);
    }

    function setResolver(
        bytes32 node,
        address resolver
    ) external onlyNameOwner(node) {
        _materializeLegacy(node, true);
        _records[node].resolver = resolver;
        emit ResolverChanged(node, msg.sender, resolver);
    }

    function records(
        bytes32 node
    ) public view returns (address owner, address resolver, uint256 expiry) {
        if (migrated[node]) {
            Record storage record = _records[node];
            return (record.owner, record.resolver, record.expiry);
        }
        return legacyRegistry.records(node);
    }

    function ownershipGenerations(
        bytes32 node
    ) public view returns (uint256) {
        return _ownershipGenerations[node];
    }

    function ownerOf(bytes32 node) public view returns (address) {
        if (migrated[node]) {
            Record storage record = _records[node];
            return record.expiry < block.timestamp ? address(0) : record.owner;
        }
        return legacyRegistry.ownerOf(node);
    }

    function resolverOf(bytes32 node) external view returns (address) {
        if (ownerOf(node) == address(0)) return address(0);
        (, address resolver, ) = records(node);
        return resolver;
    }

    function expiryOf(bytes32 node) public view returns (uint256) {
        (, , uint256 expiry) = records(node);
        return expiry;
    }

    function _materializeLegacy(
        bytes32 node,
        bool advanceGeneration
    ) internal {
        if (migrated[node]) return;
        (address legacyOwner, address legacyResolver, uint256 legacyExpiry) =
            legacyRegistry.records(node);
        _records[node] = Record({
            owner: legacyOwner,
            resolver: legacyResolver,
            expiry: legacyExpiry
        });
        migrated[node] = true;
        if (advanceGeneration) _advanceOwnershipGeneration(node);
        emit NameMigrated(node, legacyOwner, legacyExpiry);
    }

    function _clearResolver(bytes32 node, address previousOwner) internal {
        if (_records[node].resolver == address(0)) return;
        _records[node].resolver = address(0);
        emit ResolverChanged(node, previousOwner, address(0));
    }

    function _advanceOwnershipGeneration(bytes32 node) internal {
        uint256 previousGeneration = _ownershipGenerations[node];
        uint256 newGeneration = previousGeneration + 1;
        _ownershipGenerations[node] = newGeneration;
        emit OwnershipGenerationAdvanced(
            node,
            previousGeneration,
            newGeneration
        );
    }
}
