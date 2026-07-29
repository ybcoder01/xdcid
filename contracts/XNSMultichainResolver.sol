// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

/// @notice Stores chain-qualified EVM address records for every registered XDCID name.
/// @dev This contract resolves addresses only. It never bridges, transfers, or holds funds.
contract XNSMultichainResolver {
    struct AddressRecord {
        address target;
        address recordOwner;
    }

    XNSRegistry public immutable registry;

    mapping(bytes32 => mapping(uint256 => AddressRecord)) private _addresses;

    error InvalidChainId();
    error InvalidTarget();
    error NotNameOwner();

    event ChainAddressSet(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed target,
        address recordOwner
    );
    event ChainAddressCleared(bytes32 indexed node, uint256 indexed chainId, address indexed recordOwner);

    constructor(XNSRegistry registry_) {
        if (address(registry_) == address(0)) revert InvalidTarget();
        registry = registry_;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    function setAddress(bytes32 node, uint256 chainId, address target) external onlyNameOwner(node) {
        if (chainId == 0) revert InvalidChainId();
        if (target == address(0)) revert InvalidTarget();

        _addresses[node][chainId] = AddressRecord({target: target, recordOwner: msg.sender});
        emit ChainAddressSet(node, chainId, target, msg.sender);
    }

    function clearAddress(bytes32 node, uint256 chainId) external onlyNameOwner(node) {
        if (chainId == 0) revert InvalidChainId();

        delete _addresses[node][chainId];
        emit ChainAddressCleared(node, chainId, msg.sender);
    }

    function addressFor(bytes32 node, uint256 chainId) public view returns (address) {
        if (chainId == 0) revert InvalidChainId();

        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) return address(0);

        AddressRecord memory record = _addresses[node][chainId];
        if (record.recordOwner != currentOwner) return address(0);
        return record.target;
    }

    function addressRecord(bytes32 node, uint256 chainId)
        external
        view
        returns (address target, address recordOwner, bool active)
    {
        if (chainId == 0) revert InvalidChainId();

        AddressRecord memory record = _addresses[node][chainId];
        address currentOwner = registry.ownerOf(node);
        active = currentOwner != address(0) && record.recordOwner == currentOwner;
        return (record.target, record.recordOwner, active);
    }
}
