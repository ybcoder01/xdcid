// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

/// @notice Owner-bound default address and profile records for XDCID names.
/// @dev Records become inactive automatically when a name expires or changes owner.
contract XNSResolverV2 {
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

    XNSRegistry public immutable registry;

    mapping(bytes32 => AddressRecord) private _addresses;
    mapping(bytes32 => mapping(string => TextRecord)) private _texts;

    error InvalidRegistry();
    error NameNotAnchored();
    error NotNameOwner();
    error UnsupportedKey();

    event AddressSet(
        bytes32 indexed node,
        address indexed target,
        address indexed recordOwner
    );
    event AddressCleared(bytes32 indexed node, address indexed recordOwner);
    event TextSet(
        bytes32 indexed node,
        string indexed key,
        string value,
        address indexed recordOwner
    );

    constructor(XNSRegistry registry_) {
        if (address(registry_) == address(0) || address(registry_).code.length == 0) {
            revert InvalidRegistry();
        }
        try registry_.ownershipGenerations(bytes32(0)) returns (uint256) {
            // The resolver requires a generation-aware Registry.
        } catch {
            revert InvalidRegistry();
        }
        registry = registry_;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    function setAddress(
        bytes32 node,
        address target
    ) external onlyNameOwner(node) {
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
        if (target == address(0)) {
            delete _addresses[node];
            emit AddressCleared(node, msg.sender);
            return;
        }

        _addresses[node] = AddressRecord({
            target: target,
            recordOwner: msg.sender,
            ownershipGeneration: registry.ownershipGenerations(node)
        });
        emit AddressSet(node, target, msg.sender);
    }

    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external onlyNameOwner(node) {
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
        if (!_supportedKey(key)) revert UnsupportedKey();

        if (bytes(value).length == 0) {
            delete _texts[node][key];
        } else {
            _texts[node][key] = TextRecord({
                value: value,
                recordOwner: msg.sender,
                ownershipGeneration: registry.ownershipGenerations(node)
            });
        }
        emit TextSet(node, key, value, msg.sender);
    }

    function addresses(bytes32 node) external view returns (address) {
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) return address(0);

        AddressRecord memory record = _addresses[node];
        if (
            record.recordOwner != currentOwner ||
            record.ownershipGeneration != registry.ownershipGenerations(node) ||
            record.target == address(0)
        ) {
            return currentOwner;
        }
        return record.target;
    }

    function addressRecord(
        bytes32 node
    ) external view returns (address target, address recordOwner, bool active) {
        AddressRecord memory record = _addresses[node];
        address currentOwner = registry.ownerOf(node);
        active =
            currentOwner != address(0) &&
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node);
        return (record.target, record.recordOwner, active);
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
        ) {
            return "";
        }
        return record.value;
    }

    function textRecord(
        bytes32 node,
        string calldata key
    ) external view returns (string memory value, address recordOwner, bool active) {
        TextRecord storage record = _texts[node][key];
        address currentOwner = registry.ownerOf(node);
        active =
            currentOwner != address(0) &&
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node);
        return (record.value, record.recordOwner, active);
    }

    function _supportedKey(string calldata key) internal pure returns (bool) {
        bytes32 hashed = keccak256(bytes(key));
        return
            hashed == keccak256(bytes("avatar")) ||
            hashed == keccak256(bytes("website")) ||
            hashed == keccak256(bytes("twitter")) ||
            hashed == keccak256(bytes("telegram")) ||
            hashed == keccak256(bytes("bio"));
    }
}
