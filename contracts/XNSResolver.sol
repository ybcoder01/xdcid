// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistry.sol";

contract XNSResolver {
    XNSRegistry public immutable registry;

    mapping(bytes32 => address) private _addresses;
    mapping(bytes32 => mapping(string => string)) public texts;

    error NotNameOwner();
    error UnsupportedKey();

    constructor(XNSRegistry registry_) {
        registry = registry_;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (registry.ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    function setAddress(bytes32 node, address addr) external onlyNameOwner(node) {
        _addresses[node] = addr;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external onlyNameOwner(node) {
        if (!_supportedKey(key)) revert UnsupportedKey();
        texts[node][key] = value;
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return texts[node][key];
    }

    function addresses(bytes32 node) external view returns (address) {
        address addr = _addresses[node];
        if (addr != address(0)) return addr;
        return registry.ownerOf(node);
    }

    function _supportedKey(string calldata key) internal pure returns (bool) {
        bytes32 hashed = keccak256(bytes(key));
        return hashed == keccak256(bytes("avatar"))
            || hashed == keccak256(bytes("website"))
            || hashed == keccak256(bytes("twitter"))
            || hashed == keccak256(bytes("telegram"))
            || hashed == keccak256(bytes("bio"));
    }
}
