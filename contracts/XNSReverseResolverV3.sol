// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

/// @notice Owner-verified reverse resolution with registrar initialization.
/// @dev The active registry registrar may initialize an account's first
/// primary name, but can never replace an active primary selected by its owner.
contract XNSReverseResolverV3 {
    struct ReverseRecord {
        string name;
        bytes32 node;
    }

    XNSRegistry public immutable registry;
    mapping(address => ReverseRecord) private _records;

    error InvalidRegistry();
    error InvalidAccount();
    error InvalidName();
    error NotNameOwner();
    error NotRegistrar();

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

    constructor(XNSRegistry registry_) {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0
        ) revert InvalidRegistry();
        registry = registry_;
    }

    function setPrimaryName(string calldata name, bytes32 node) external {
        _validateOwnedName(msg.sender, name, node);
        _records[msg.sender] = ReverseRecord({name: name, node: node});
        emit PrimaryNameSet(msg.sender, node, name);
    }

    function initializePrimaryName(
        address account,
        string calldata name,
        bytes32 node
    ) external returns (bool initialized) {
        if (msg.sender != registry.registrar()) revert NotRegistrar();
        if (account == address(0)) revert InvalidAccount();
        _validateOwnedName(account, name, node);

        ReverseRecord storage current = _records[account];
        if (_isActive(account, current)) return false;

        _records[account] = ReverseRecord({name: name, node: node});
        emit PrimaryNameInitialized(account, node, name);
        return true;
    }

    function clearPrimaryName() external {
        delete _records[msg.sender];
        emit PrimaryNameCleared(msg.sender);
    }

    function primaryNames(address account) external view returns (string memory) {
        ReverseRecord storage record = _records[account];
        return _isActive(account, record) ? record.name : "";
    }

    function primaryRecord(
        address account
    ) external view returns (string memory name, bytes32 node, bool active) {
        ReverseRecord storage record = _records[account];
        return (record.name, record.node, _isActive(account, record));
    }

    function _validateOwnedName(
        address account,
        string calldata name,
        bytes32 node
    ) private view {
        if (keccak256(bytes(name)) != node) revert InvalidName();
        if (registry.ownerOf(node) != account) revert NotNameOwner();
    }

    function _isActive(
        address account,
        ReverseRecord storage record
    ) private view returns (bool) {
        return
            record.node != bytes32(0) &&
            registry.ownerOf(record.node) == account &&
            keccak256(bytes(record.name)) == record.node;
    }
}
