// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockLegacySubdomainRegistrar {
    struct Record {
        address owner;
        bytes32 parentNode;
        uint256 expiry;
    }

    mapping(bytes32 => Record) public records;
    mapping(bytes32 => mapping(uint256 => address)) public routes;

    function seed(
        bytes32 node,
        bytes32 parentNode,
        address owner,
        uint256 expiry
    ) external {
        records[node] = Record(owner, parentNode, expiry);
    }

    function ownerOf(bytes32 node) external view returns (address) {
        Record memory record = records[node];
        return record.owner == address(0) || record.expiry < block.timestamp
            ? address(0)
            : record.owner;
    }

    function setAddress(bytes32 node, uint256 chainId, address target) external {
        routes[node][chainId] = target;
    }

    function addressOf(bytes32 node, uint256 chainId) external view returns (address) {
        Record memory record = records[node];
        if (record.owner == address(0) || record.expiry < block.timestamp) {
            return address(0);
        }
        address target = routes[node][chainId];
        return target == address(0) ? record.owner : target;
    }
}
