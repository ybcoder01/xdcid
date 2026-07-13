// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract XNSRegistry is Ownable {
    struct Record {
        address owner;
        address resolver;
        uint256 expiry;
    }

    mapping(bytes32 => Record) public records;
    address public registrar;

    error NotRegistrar();
    error NotNameOwner();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    modifier onlyNameOwner(bytes32 node) {
        if (ownerOf(node) != msg.sender) revert NotNameOwner();
        _;
    }

    function setRegistrar(address newRegistrar) external onlyOwner {
        registrar = newRegistrar;
    }

    function register(bytes32 node, address nameOwner, uint256 expiry) external onlyRegistrar {
        records[node].owner = nameOwner;
        records[node].expiry = expiry;
    }

    function transferName(bytes32 node, address newOwner) external onlyNameOwner(node) {
        records[node].owner = newOwner;
    }

    function setResolver(bytes32 node, address resolver) external onlyNameOwner(node) {
        records[node].resolver = resolver;
    }

    function ownerOf(bytes32 node) public view returns (address) {
        if (records[node].expiry < block.timestamp) return address(0);
        return records[node].owner;
    }

    function resolverOf(bytes32 node) external view returns (address) {
        return records[node].resolver;
    }

    function expiryOf(bytes32 node) external view returns (uint256) {
        return records[node].expiry;
    }
}
