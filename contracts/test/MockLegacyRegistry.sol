// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IXNSRegistrarMigrationTarget {
    function registerMigration(
        string calldata name,
        address nameOwner,
        uint256 years_
    ) external;
}

contract MockLegacyRegistry {
    mapping(string => uint256) private tokenIds;
    mapping(uint256 => bool) private registeredTokens;
    bool public failReads;

    function setName(
        string calldata name,
        uint256 tokenId,
        bool registered
    ) external {
        tokenIds[name] = tokenId;
        registeredTokens[tokenId] = registered;
    }

    function setFailReads(bool value) external {
        failReads = value;
    }

    function _tokenIdMaps(
        string calldata name
    ) external view returns (uint256) {
        require(!failReads, "legacy read failed");
        return tokenIds[name];
    }

    function exists(uint256 tokenId) external view returns (bool) {
        require(!failReads, "legacy read failed");
        return registeredTokens[tokenId];
    }
}

contract MockMigrationController {
    function migrate(
        address registrar,
        string calldata name,
        address nameOwner,
        uint256 years_
    ) external {
        IXNSRegistrarMigrationTarget(registrar).registerMigration(
            name,
            nameOwner,
            years_
        );
    }
}
