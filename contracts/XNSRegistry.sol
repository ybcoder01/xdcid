// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract XNSRegistry is Ownable {
    struct Record {
        address owner;
        address resolver;
        uint256 expiry;
    }

    mapping(bytes32 => Record) internal _records;
    mapping(bytes32 => uint256) internal _ownershipGenerations;
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
    event OwnershipGenerationAdvanced(
        bytes32 indexed node,
        uint256 previousGeneration,
        uint256 newGeneration
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

    function setRegistrar(address newRegistrar) external virtual onlyOwner {
        if (newRegistrar == address(0)) revert InvalidRegistrar();
        address previousRegistrar = registrar;
        registrar = newRegistrar;
        emit RegistrarChanged(previousRegistrar, newRegistrar);
    }

    function register(bytes32 node, address nameOwner, uint256 expiry) external virtual onlyRegistrar {
        if (nameOwner == address(0)) revert InvalidNameOwner();
        Record storage record = _records[node];
        address previousOwner = record.owner;
        if (
            previousOwner != nameOwner ||
            record.expiry < block.timestamp
        ) {
            _clearResolver(node, previousOwner);
            _advanceOwnershipGeneration(node);
        }
        record.owner = nameOwner;
        record.expiry = expiry;
        emit NameRegistered(node, nameOwner, expiry);
    }

    function transferName(bytes32 node, address newOwner) external virtual onlyNameOwner(node) {
        if (newOwner == address(0)) revert InvalidNameOwner();
        address previousOwner = _records[node].owner;
        _records[node].owner = newOwner;
        if (previousOwner != newOwner) {
            _clearResolver(node, previousOwner);
            _advanceOwnershipGeneration(node);
        }
        emit NameTransferred(node, previousOwner, newOwner);
    }

    function setResolver(bytes32 node, address resolver) external virtual onlyNameOwner(node) {
        _records[node].resolver = resolver;
        emit ResolverChanged(node, msg.sender, resolver);
    }

    function records(
        bytes32 node
    ) public view virtual returns (address owner, address resolver, uint256 expiry) {
        Record storage record = _records[node];
        return (record.owner, record.resolver, record.expiry);
    }

    function ownershipGenerations(
        bytes32 node
    ) public view virtual returns (uint256) {
        return _ownershipGenerations[node];
    }

    function ownerOf(bytes32 node) public view virtual returns (address) {
        if (_records[node].expiry < block.timestamp) return address(0);
        return _records[node].owner;
    }

    function resolverOf(bytes32 node) external view virtual returns (address) {
        if (ownerOf(node) == address(0)) return address(0);
        return _records[node].resolver;
    }

    function expiryOf(bytes32 node) external view virtual returns (uint256) {
        return _records[node].expiry;
    }

    function _clearResolver(bytes32 node, address previousOwner) internal {
        if (_records[node].resolver == address(0)) return;
        _records[node].resolver = address(0);
        emit ResolverChanged(node, previousOwner, address(0));
    }

    function _advanceOwnershipGeneration(bytes32 node) internal {
        uint256 previousGeneration = _ownershipGenerations[node];
        uint256 newGeneration = previousGeneration + 1;
        _ownershipGenerations[node] = newGeneration;
        emit OwnershipGenerationAdvanced(
            node,
            previousGeneration,
            newGeneration
        );
    }
}
