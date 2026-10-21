// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistryV3.sol";

/// @notice Single forward, multichain, profile, and verified-primary resolver.
/// @dev Every record is bound to an ownership generation. Forward resolution
/// defaults to the current owner; reverse resolution is always forward-verified.
contract XNSUniversalResolver {
    struct AddressRecord {
        address target;
        address recordOwner;
        uint256 ownershipGeneration;
    }

    struct TextRecord {
        string value;
        address recordOwner;
        uint256 ownershipGeneration;
    }

    struct PrimaryRecord {
        string name;
        bytes32 node;
        uint256 ownershipGeneration;
    }

    XNSRegistryV3 public immutable registry;

    mapping(bytes32 => mapping(uint256 => AddressRecord)) private _addresses;
    mapping(bytes32 => mapping(string => TextRecord)) private _texts;
    mapping(address => PrimaryRecord) private _primaryRecords;
    mapping(bytes32 => bool) public legacyRoutesImported;

    error InvalidAccount();
    error InvalidChainId();
    error InvalidName();
    error InvalidRegistry();
    error NameNotAnchored();
    error NotNameOwner();
    error NotRegistrar();
    error RoutesAlreadyImported();
    error UnsupportedKey();

    event AddressSet(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed target,
        address recordOwner
    );
    event AddressCleared(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed recordOwner
    );
    event TextSet(
        bytes32 indexed node,
        string indexed key,
        string value,
        address indexed recordOwner
    );
    event PrimaryNameSet(
        address indexed account,
        bytes32 indexed node,
        string name
    );
    event PrimaryNameInitialized(
        address indexed account,
        bytes32 indexed node,
        string name
    );
    event PrimaryNameCleared(address indexed account);
    event LegacyRoutesImported(
        bytes32 indexed node,
        address indexed recordOwner,
        uint256 ownershipGeneration
    );

    constructor(XNSRegistryV3 registry_) {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0
        ) revert InvalidRegistry();
        registry = registry_;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    /// @param chainId Zero is the default EVM/XDC route. Other values are EVM chain IDs.
    function setAddress(
        bytes32 node,
        uint256 chainId,
        address target
    ) external onlyNameOwner(node) {
        uint256 generation = registry.ownershipGenerations(node);
        if (generation == 0) revert NameNotAnchored();
        if (target == address(0)) {
            delete _addresses[node][chainId];
            emit AddressCleared(node, chainId, msg.sender);
            return;
        }
        _addresses[node][chainId] = AddressRecord({
            target: target,
            recordOwner: msg.sender,
            ownershipGeneration: generation
        });
        emit AddressSet(node, chainId, target, msg.sender);
    }

    function clearAddress(
        bytes32 node,
        uint256 chainId
    ) external onlyNameOwner(node) {
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
        delete _addresses[node][chainId];
        emit AddressCleared(node, chainId, msg.sender);
    }

    /// @notice One-time migration hook for owner-bound records from the retired
    /// subdomain module. Only the active registrar can call it, and only for the
    /// owner currently recorded by Registry V3.
    function importLegacyRoutes(
        bytes32 node,
        address recordOwner,
        uint256[5] calldata chainIds,
        address[5] calldata targets
    ) external {
        if (msg.sender != registry.registrar()) revert NotRegistrar();
        if (legacyRoutesImported[node]) revert RoutesAlreadyImported();
        if (registry.ownerOf(node) != recordOwner) revert NotNameOwner();
        uint256 generation = registry.ownershipGenerations(node);
        if (generation == 0) revert NameNotAnchored();
        legacyRoutesImported[node] = true;
        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chainIds[i] == 0) revert InvalidChainId();
            if (targets[i] == address(0)) continue;
            _addresses[node][chainIds[i]] = AddressRecord({
                target: targets[i],
                recordOwner: recordOwner,
                ownershipGeneration: generation
            });
            emit AddressSet(node, chainIds[i], targets[i], recordOwner);
        }
        emit LegacyRoutesImported(node, recordOwner, generation);
    }

    function addressFor(
        bytes32 node,
        uint256 chainId
    ) public view returns (address) {
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) return address(0);
        AddressRecord memory record = _addresses[node][chainId];
        if (
            record.target != address(0) &&
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node)
        ) return record.target;
        return currentOwner;
    }

    function addresses(bytes32 node) external view returns (address) {
        return addressFor(node, 0);
    }

    function addressRecord(
        bytes32 node,
        uint256 chainId
    ) external view returns (
        address target,
        address recordOwner,
        bool active
    ) {
        AddressRecord memory record = _addresses[node][chainId];
        address currentOwner = registry.ownerOf(node);
        active =
            record.target != address(0) &&
            currentOwner != address(0) &&
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node);
        return (record.target, record.recordOwner, active);
    }

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external onlyNameOwner(node) {
        uint256 generation = registry.ownershipGenerations(node);
        if (generation == 0) revert NameNotAnchored();
        if (!_supportedKey(key)) revert UnsupportedKey();
        if (bytes(value).length == 0) {
            delete _texts[node][key];
        } else {
            _texts[node][key] = TextRecord({
                value: value,
                recordOwner: msg.sender,
                ownershipGeneration: generation
            });
        }
        emit TextSet(node, key, value, msg.sender);
    }

    function text(
        bytes32 node,
        string calldata key
    ) external view returns (string memory) {
        TextRecord storage record = _texts[node][key];
        address currentOwner = registry.ownerOf(node);
        if (
            currentOwner == address(0) ||
            record.recordOwner != currentOwner ||
            record.ownershipGeneration != registry.ownershipGenerations(node)
        ) return "";
        return record.value;
    }

    function setPrimaryName(string calldata name) external {
        bytes32 node = keccak256(bytes(name));
        _validateOwnedName(msg.sender, name, node);
        _primaryRecords[msg.sender] = PrimaryRecord({
            name: name,
            node: node,
            ownershipGeneration: registry.ownershipGenerations(node)
        });
        emit PrimaryNameSet(msg.sender, node, name);
    }

    /// @notice Initializes only an account without a currently valid primary.
    function initializePrimaryName(
        address account,
        string calldata name
    ) external returns (bool initialized) {
        if (msg.sender != registry.registrar()) revert NotRegistrar();
        if (account == address(0)) revert InvalidAccount();
        bytes32 node = keccak256(bytes(name));
        _validateOwnedName(account, name, node);
        PrimaryRecord storage current = _primaryRecords[account];
        if (_isPrimaryActive(account, current)) return false;
        _primaryRecords[account] = PrimaryRecord({
            name: name,
            node: node,
            ownershipGeneration: registry.ownershipGenerations(node)
        });
        emit PrimaryNameInitialized(account, node, name);
        return true;
    }

    function clearPrimaryName() external {
        delete _primaryRecords[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    function primaryNames(address account) external view returns (string memory) {
        PrimaryRecord storage record = _primaryRecords[account];
        return _isPrimaryActive(account, record) ? record.name : "";
    }

    function primaryRecord(
        address account
    ) external view returns (string memory name, bytes32 node, bool active) {
        PrimaryRecord storage record = _primaryRecords[account];
        return (record.name, record.node, _isPrimaryActive(account, record));
    }

    /// @notice Returns a primary only when its forward route still matches the account.
    function reverse(
        address account,
        uint256 chainId
    ) external view returns (string memory) {
        PrimaryRecord storage record = _primaryRecords[account];
        if (!_isPrimaryActive(account, record)) return "";
        return addressFor(record.node, chainId) == account ? record.name : "";
    }

    function _validateOwnedName(
        address account,
        string calldata name,
        bytes32 node
    ) private view {
        if (bytes(name).length == 0 || keccak256(bytes(name)) != node) {
            revert InvalidName();
        }
        if (registry.ownerOf(node) != account) revert NotNameOwner();
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
    }

    function _isPrimaryActive(
        address account,
        PrimaryRecord storage record
    ) private view returns (bool) {
        return
            record.node != bytes32(0) &&
            registry.ownerOf(record.node) == account &&
            record.ownershipGeneration ==
                registry.ownershipGenerations(record.node) &&
            keccak256(bytes(record.name)) == record.node;
    }

    function _supportedKey(string calldata key) private pure returns (bool) {
        bytes32 hashed = keccak256(bytes(key));
        return
            hashed == keccak256(bytes("avatar")) ||
            hashed == keccak256(bytes("website")) ||
            hashed == keccak256(bytes("twitter")) ||
            hashed == keccak256(bytes("telegram")) ||
            hashed == keccak256(bytes("bio"));
    }
}
