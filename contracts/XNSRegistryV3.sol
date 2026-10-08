// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IXNSLegacyRegistryV3 {
    function records(
        bytes32 node
    ) external view returns (address owner, address resolver, uint256 expiry);

    function ownerOf(bytes32 node) external view returns (address);
}

/// @notice Canonical ownership registry for top-level XDCIDs and one-level subdomains.
/// @dev Registration policy, payments, records, and reverse resolution intentionally live
/// outside this contract. Every lifecycle change advances a generation so stale resolver
/// state can never reactivate if ownership later returns to an earlier wallet.
contract XNSRegistryV3 is Ownable2Step {
    enum NameKind {
        None,
        TopLevel,
        Subdomain
    }

    struct Record {
        address owner;
        address resolver;
        uint64 expiry;
        bytes32 parentNode;
        NameKind kind;
    }

    uint256 public constant REGISTRAR_CHANGE_DELAY = 2 days;

    IXNSLegacyRegistryV3 public immutable legacyRegistry;
    mapping(bytes32 => Record) private _records;
    mapping(bytes32 => uint256) private _ownershipGenerations;
    mapping(bytes32 => bool) public migrated;

    address public registrar;
    address public pendingRegistrar;
    uint256 public pendingRegistrarActivationTime;

    error AlreadyMigrated();
    error ChildExpiryExceedsParent();
    error InvalidExpiry();
    error InvalidLegacyRegistry();
    error InvalidNameOwner();
    error InvalidRegistrar();
    error InvalidSubdomain();
    error MigrationRequiresLegacyOwner();
    error NameUnavailable();
    error NoPendingRegistrar();
    error NotNameOwner();
    error NotRegistrar();
    error ParentUnavailable();
    error RegistrarAlreadyInitialized();
    error RegistrarChangeNotReady();
    error SubdomainIsNonTransferable();

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
    event NameRenewed(
        bytes32 indexed node,
        address indexed nameOwner,
        uint256 expiry
    );
    event NameTransferred(
        bytes32 indexed node,
        address indexed previousOwner,
        address indexed newOwner
    );
    event SubdomainRegistered(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed subdomainOwner,
        uint256 expiry
    );
    event SubdomainReassigned(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed previousOwner,
        address newOwner
    );
    event SubdomainRenewed(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed subdomainOwner,
        uint256 expiry
    );
    event SubdomainReleased(
        bytes32 indexed node,
        bytes32 indexed parentNode,
        address indexed previousOwner
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
        IXNSLegacyRegistryV3 legacyRegistry_
    ) Ownable(initialOwner) {
        if (
            address(legacyRegistry_) != address(0) &&
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
        pendingRegistrarActivationTime = block.timestamp + REGISTRAR_CHANGE_DELAY;
        emit RegistrarChangeProposed(
            registrar,
            newRegistrar,
            pendingRegistrarActivationTime
        );
    }

    function cancelRegistrarChange() external onlyOwner {
        address proposed = pendingRegistrar;
        if (proposed == address(0)) revert NoPendingRegistrar();
        delete pendingRegistrar;
        delete pendingRegistrarActivationTime;
        emit RegistrarChangeCancelled(proposed);
    }

    function activateRegistrar() external onlyOwner {
        address next = pendingRegistrar;
        if (next == address(0)) revert NoPendingRegistrar();
        if (block.timestamp < pendingRegistrarActivationTime) {
            revert RegistrarChangeNotReady();
        }
        address previous = registrar;
        registrar = next;
        delete pendingRegistrar;
        delete pendingRegistrarActivationTime;
        emit RegistrarChanged(previous, next);
    }

    /// @notice Anchors an active top-level name inherited from Registry V2.
    function migrateName(bytes32 node) external {
        if (migrated[node]) revert AlreadyMigrated();
        (address legacyOwner, address legacyResolver, uint256 legacyExpiry) =
            _legacyRecords(node);
        if (
            legacyOwner != msg.sender ||
            legacyExpiry < block.timestamp ||
            _legacyOwnerOf(node) != msg.sender
        ) revert MigrationRequiresLegacyOwner();

        _records[node] = Record({
            owner: legacyOwner,
            resolver: legacyResolver,
            expiry: _asUint64(legacyExpiry),
            parentNode: bytes32(0),
            kind: NameKind.TopLevel
        });
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit NameMigrated(node, legacyOwner, legacyExpiry);
    }

    function registerTopLevel(
        bytes32 node,
        address nameOwner,
        uint256 expiry
    ) external onlyRegistrar {
        _requireOwnerAndFutureExpiry(nameOwner, expiry);
        address previousOwner = ownerOf(node);
        if (previousOwner != address(0)) revert NameUnavailable();

        if (!migrated[node]) {
            (address oldOwner, address oldResolver, uint256 oldExpiry) =
                _legacyRecords(node);
            if (
                oldOwner != address(0) ||
                oldResolver != address(0) ||
                oldExpiry != 0
            ) {
                if (oldExpiry >= block.timestamp) revert NameUnavailable();
            }
        }

        _records[node] = Record({
            owner: nameOwner,
            resolver: address(0),
            expiry: _asUint64(expiry),
            parentNode: bytes32(0),
            kind: NameKind.TopLevel
        });
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit NameRegistered(node, nameOwner, expiry);
    }

    function renewTopLevel(
        bytes32 node,
        uint256 expiry
    ) external onlyRegistrar {
        _materializeLegacy(node);
        Record storage record = _records[node];
        if (
            record.kind != NameKind.TopLevel ||
            record.owner == address(0) ||
            record.expiry < block.timestamp
        ) revert NameUnavailable();
        if (expiry <= record.expiry) revert InvalidExpiry();
        record.expiry = _asUint64(expiry);
        emit NameRenewed(node, record.owner, expiry);
    }

    function registerSubdomain(
        bytes32 node,
        bytes32 parentNode,
        address subdomainOwner,
        uint256 expiry
    ) external onlyRegistrar {
        _requireOwnerAndFutureExpiry(subdomainOwner, expiry);
        if (node == bytes32(0) || parentNode == bytes32(0) || node == parentNode) {
            revert InvalidSubdomain();
        }
        uint256 parentExpiry = _requireActiveTopLevel(parentNode);
        if (expiry > parentExpiry) revert ChildExpiryExceedsParent();
        // Expired labels stay reserved until the parent explicitly renews or
        // releases them. This prevents an unrelated registration path from
        // silently taking over a previously issued company identity.
        if (_records[node].owner != address(0)) revert NameUnavailable();

        _records[node] = Record({
            owner: subdomainOwner,
            resolver: address(0),
            expiry: _asUint64(expiry),
            parentNode: parentNode,
            kind: NameKind.Subdomain
        });
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit SubdomainRegistered(node, parentNode, subdomainOwner, expiry);
    }

    function renewSubdomain(
        bytes32 node,
        uint256 expiry
    ) external onlyRegistrar {
        Record storage record = _records[node];
        if (
            record.kind != NameKind.Subdomain ||
            record.owner == address(0)
        ) revert NameUnavailable();
        uint256 parentExpiry = _requireActiveTopLevel(record.parentNode);
        if (expiry <= block.timestamp || expiry <= record.expiry) {
            revert InvalidExpiry();
        }
        if (expiry > parentExpiry) revert ChildExpiryExceedsParent();
        bool reactivating = record.expiry < block.timestamp;
        record.expiry = _asUint64(expiry);
        if (reactivating) {
            record.resolver = address(0);
            _advanceOwnershipGeneration(node);
        }
        emit SubdomainRenewed(node, record.parentNode, record.owner, expiry);
    }

    /// @notice Parent-authorized reassignment and recall share the same primitive.
    function reassignSubdomain(
        bytes32 node,
        address newOwner
    ) external onlyRegistrar {
        if (newOwner == address(0)) revert InvalidNameOwner();
        Record storage record = _records[node];
        if (
            record.kind != NameKind.Subdomain ||
            ownerOf(node) == address(0)
        ) revert NameUnavailable();
        address previousOwner = record.owner;
        if (previousOwner == newOwner) return;
        record.owner = newOwner;
        record.resolver = address(0);
        _advanceOwnershipGeneration(node);
        emit SubdomainReassigned(
            node,
            record.parentNode,
            previousOwner,
            newOwner
        );
    }

    function releaseSubdomain(bytes32 node) external onlyRegistrar {
        Record storage record = _records[node];
        if (record.kind != NameKind.Subdomain || record.owner == address(0)) {
            revert NameUnavailable();
        }
        address previousOwner = record.owner;
        bytes32 parentNode = record.parentNode;
        delete _records[node];
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit SubdomainReleased(node, parentNode, previousOwner);
    }

    function transferName(
        bytes32 node,
        address newOwner
    ) external onlyNameOwner(node) {
        if (newOwner == address(0)) revert InvalidNameOwner();
        _materializeLegacy(node);
        Record storage record = _records[node];
        if (record.kind == NameKind.Subdomain) {
            revert SubdomainIsNonTransferable();
        }
        address previousOwner = record.owner;
        if (previousOwner == newOwner) return;
        record.owner = newOwner;
        record.resolver = address(0);
        _advanceOwnershipGeneration(node);
        emit NameTransferred(node, previousOwner, newOwner);
    }

    function setResolver(
        bytes32 node,
        address resolver
    ) external onlyNameOwner(node) {
        _materializeLegacy(node);
        _records[node].resolver = resolver;
        emit ResolverChanged(node, msg.sender, resolver);
    }

    function records(
        bytes32 node
    ) public view returns (Record memory record) {
        if (migrated[node]) return _records[node];
        (address owner, address resolver, uint256 expiry) =
            _legacyRecords(node);
        return Record({
            owner: owner,
            resolver: resolver,
            expiry: expiry > type(uint64).max ? type(uint64).max : uint64(expiry),
            parentNode: bytes32(0),
            kind: owner == address(0) && expiry == 0
                ? NameKind.None
                : NameKind.TopLevel
        });
    }

    function ownerOf(bytes32 node) public view returns (address) {
        Record memory record = records(node);
        if (record.owner == address(0) || record.expiry < block.timestamp) {
            return address(0);
        }
        if (record.kind == NameKind.Subdomain) {
            Record memory parent = records(record.parentNode);
            if (
                parent.kind != NameKind.TopLevel ||
                parent.owner == address(0) ||
                parent.expiry < block.timestamp
            ) return address(0);
        }
        return record.owner;
    }

    function resolverOf(bytes32 node) external view returns (address) {
        if (ownerOf(node) == address(0)) return address(0);
        return records(node).resolver;
    }

    function expiryOf(bytes32 node) public view returns (uint256) {
        return records(node).expiry;
    }

    function parentOf(bytes32 node) external view returns (bytes32) {
        return records(node).parentNode;
    }

    function kindOf(bytes32 node) external view returns (NameKind) {
        return records(node).kind;
    }

    function ownershipGenerations(bytes32 node) external view returns (uint256) {
        return _ownershipGenerations[node];
    }

    function _requireActiveTopLevel(
        bytes32 parentNode
    ) internal view returns (uint256 parentExpiry) {
        Record memory parent = records(parentNode);
        if (
            parent.kind != NameKind.TopLevel ||
            parent.owner == address(0) ||
            parent.expiry < block.timestamp
        ) revert ParentUnavailable();
        return parent.expiry;
    }

    function _materializeLegacy(bytes32 node) internal {
        if (migrated[node]) return;
        (address owner, address resolver, uint256 expiry) =
            _legacyRecords(node);
        if (owner == address(0) || expiry < block.timestamp) {
            revert NameUnavailable();
        }
        _records[node] = Record({
            owner: owner,
            resolver: resolver,
            expiry: _asUint64(expiry),
            parentNode: bytes32(0),
            kind: NameKind.TopLevel
        });
        migrated[node] = true;
        _advanceOwnershipGeneration(node);
        emit NameMigrated(node, owner, expiry);
    }

    function _requireOwnerAndFutureExpiry(
        address nameOwner,
        uint256 expiry
    ) internal view {
        if (nameOwner == address(0)) revert InvalidNameOwner();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (expiry > type(uint64).max) revert InvalidExpiry();
    }

    function _asUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) revert InvalidExpiry();
        return uint64(value);
    }

    function _advanceOwnershipGeneration(bytes32 node) internal {
        uint256 previous = _ownershipGenerations[node];
        uint256 next = previous + 1;
        _ownershipGenerations[node] = next;
        emit OwnershipGenerationAdvanced(node, previous, next);
    }

    function _legacyRecords(
        bytes32 node
    ) internal view returns (address, address, uint256) {
        if (address(legacyRegistry) == address(0)) {
            return (address(0), address(0), 0);
        }
        (bool succeeded, bytes memory result) = address(legacyRegistry)
            .staticcall(
                abi.encodeCall(IXNSLegacyRegistryV3.records, (node))
            );
        if (!succeeded || result.length < 96) revert InvalidLegacyRegistry();
        return abi.decode(result, (address, address, uint256));
    }

    function _legacyOwnerOf(bytes32 node) internal view returns (address) {
        if (address(legacyRegistry) == address(0)) return address(0);
        return legacyRegistry.ownerOf(node);
    }
}
