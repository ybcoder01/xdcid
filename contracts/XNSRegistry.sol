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
    error InvalidRegistrar();
    error InvalidNameOwner();

    event RegistrarChanged(
        address indexed previousRegistrar,
        address indexed newRegistrar
    );
    event NameRegistered(
        bytes32 indexed node,
        address indexed nameOwner,
        uint256 expiry
    );
    event NameTransferred(
        bytes32 indexed node,
        address indexed previousOwner,
        address indexed newOwner
    );
    event ResolverChanged(
        bytes32 indexed node,
        address indexed nameOwner,
        address indexed resolver
    );

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
        if (newRegistrar == address(0)) revert InvalidRegistrar();
        address previousRegistrar = registrar;
        registrar = newRegistrar;
        emit RegistrarChanged(previousRegistrar, newRegistrar);
    }

    function register(bytes32 node, address nameOwner, uint256 expiry) external onlyRegistrar {
        if (nameOwner == address(0)) revert InvalidNameOwner();
        Record storage record = records[node];
        address previousOwner = record.owner;
        if (
            previousOwner != nameOwner ||
            record.expiry < block.timestamp
        ) {
            _clearResolver(node, previousOwner);
        }
        record.owner = nameOwner;
        record.expiry = expiry;
        emit NameRegistered(node, nameOwner, expiry);
    }

    function transferName(bytes32 node, address newOwner) external onlyNameOwner(node) {
        if (newOwner == address(0)) revert InvalidNameOwner();
        address previousOwner = records[node].owner;
        records[node].owner = newOwner;
        if (previousOwner != newOwner) {
            _clearResolver(node, previousOwner);
        }
        emit NameTransferred(node, previousOwner, newOwner);
    }

    function setResolver(bytes32 node, address resolver) external onlyNameOwner(node) {
        records[node].resolver = resolver;
        emit ResolverChanged(node, msg.sender, resolver);
    }

    function ownerOf(bytes32 node) public view returns (address) {
        if (records[node].expiry < block.timestamp) return address(0);
        return records[node].owner;
    }

    function resolverOf(bytes32 node) external view returns (address) {
        if (ownerOf(node) == address(0)) return address(0);
        return records[node].resolver;
    }

    function expiryOf(bytes32 node) external view returns (uint256) {
        return records[node].expiry;
    }

    function _clearResolver(bytes32 node, address previousOwner) internal {
        if (records[node].resolver == address(0)) return;
        records[node].resolver = address(0);
        emit ResolverChanged(node, previousOwner, address(0));
    }
}
