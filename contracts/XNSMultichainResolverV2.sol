// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

interface IXNSPrimaryNameResolver {
    function primaryNames(address account) external view returns (string memory);
}

/// @notice Stores chain-qualified address overrides and resolves the verified
/// primary owner's wallet when an override is absent.
/// @dev This contract never bridges, transfers, or holds funds.
contract XNSMultichainResolverV2 {
    struct AddressRecord {
        address target;
        address recordOwner;
        uint256 ownershipGeneration;
    }

    XNSRegistry public immutable registry;
    IXNSPrimaryNameResolver public immutable reverseResolver;

    mapping(bytes32 => mapping(uint256 => AddressRecord)) private _addresses;

    error InvalidChainId();
    error InvalidDependency();
    error InvalidTarget();
    error NameNotAnchored();
    error NotNameOwner();

    event ChainAddressSet(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed target,
        address recordOwner
    );
    event ChainAddressCleared(
        bytes32 indexed node,
        uint256 indexed chainId,
        address indexed recordOwner
    );

    constructor(
        XNSRegistry registry_,
        IXNSPrimaryNameResolver reverseResolver_
    ) {
        if (
            address(registry_) == address(0) ||
            address(registry_).code.length == 0 ||
            address(reverseResolver_) == address(0) ||
            address(reverseResolver_).code.length == 0
        ) revert InvalidDependency();
        try registry_.ownershipGenerations(bytes32(0)) returns (uint256) {
            // The resolver requires a generation-aware Registry.
        } catch {
            revert InvalidDependency();
        }
        registry = registry_;
        reverseResolver = reverseResolver_;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    function setAddress(
        bytes32 node,
        uint256 chainId,
        address target
    ) external onlyNameOwner(node) {
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
        if (chainId == 0) revert InvalidChainId();
        if (target == address(0)) revert InvalidTarget();

        _addresses[node][chainId] = AddressRecord({
            target: target,
            recordOwner: msg.sender,
            ownershipGeneration: registry.ownershipGenerations(node)
        });
        emit ChainAddressSet(node, chainId, target, msg.sender);
    }

    function clearAddress(
        bytes32 node,
        uint256 chainId
    ) external onlyNameOwner(node) {
        if (registry.ownershipGenerations(node) == 0) revert NameNotAnchored();
        if (chainId == 0) revert InvalidChainId();

        delete _addresses[node][chainId];
        emit ChainAddressCleared(node, chainId, msg.sender);
    }

    function addressFor(
        bytes32 node,
        uint256 chainId
    ) public view returns (address) {
        if (chainId == 0) revert InvalidChainId();

        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) return address(0);

        AddressRecord memory record = _addresses[node][chainId];
        if (
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node)
        ) return record.target;

        string memory primaryName = reverseResolver.primaryNames(currentOwner);
        return keccak256(bytes(primaryName)) == node
            ? currentOwner
            : address(0);
    }

    function addressRecord(
        bytes32 node,
        uint256 chainId
    ) external view returns (
        address target,
        address recordOwner,
        bool active
    ) {
        if (chainId == 0) revert InvalidChainId();

        AddressRecord memory record = _addresses[node][chainId];
        address currentOwner = registry.ownerOf(node);
        active =
            currentOwner != address(0) &&
            record.recordOwner == currentOwner &&
            record.ownershipGeneration == registry.ownershipGenerations(node);
        return (record.target, record.recordOwner, active);
    }
}
