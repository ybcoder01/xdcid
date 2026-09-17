// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

/// @notice Owner-verified reverse resolution for XDCID names.
/// @dev A reverse record becomes inactive automatically when ownership changes
/// or the referenced name expires.
contract XNSReverseResolverV2 {
    struct ReverseRecord {
        string name;
        bytes32 node;
    }

    XNSRegistry public immutable registry;
    mapping(address => ReverseRecord) private _records;

    error InvalidRegistry();
    error InvalidName();
    error NotNameOwner();

    event PrimaryNameSet(
        address indexed account,
        bytes32 indexed node,
        string name
    );
    event PrimaryNameCleared(address indexed account);

    constructor(XNSRegistry registry_) {
        if (address(registry_) == address(0) || address(registry_).code.length == 0) {
            revert InvalidRegistry();
        }
        registry = registry_;
    }

    function setPrimaryName(string calldata name, bytes32 node) external {
        if (keccak256(bytes(name)) != node) revert InvalidName();
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();

        _records[msg.sender] = ReverseRecord({name: name, node: node});
        emit PrimaryNameSet(msg.sender, node, name);
    }

    function clearPrimaryName() external {
        delete _records[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    function primaryNames(address account) external view returns (string memory) {
        ReverseRecord storage record = _records[account];
        if (
            record.node == bytes32(0) ||
            registry.ownerOf(record.node) != account ||
            keccak256(bytes(record.name)) != record.node
        ) {
            return "";
        }
        return record.name;
    }

    function primaryRecord(
        address account
    ) external view returns (string memory name, bytes32 node, bool active) {
        ReverseRecord storage record = _records[account];
        active =
            record.node != bytes32(0) &&
            registry.ownerOf(record.node) == account &&
            keccak256(bytes(record.name)) == record.node;
        return (record.name, record.node, active);
    }
}
