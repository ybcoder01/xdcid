// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

contract XNSReverseResolver {
    XNSRegistry public immutable registry;
    mapping(address => string) public primaryNames;

    error InvalidName();
    error NotNameOwner();

    constructor(XNSRegistry registry_) {
        registry = registry_;
    }

    function setPrimaryName(string calldata name, bytes32 node) external {
        if (keccak256(bytes(name)) != node) revert InvalidName();
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        primaryNames[msg.sender] = name;
    }
}
