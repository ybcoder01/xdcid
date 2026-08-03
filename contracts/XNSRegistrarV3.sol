// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistrar.sol";

interface IXDCDomainsRegistry {
    function _tokenIdMaps(string calldata name) external view returns (uint256);
    function exists(uint256 tokenId) external view returns (bool);
}

contract XNSRegistrarV3 is XNSRegistrar {
    IXDCDomainsRegistry public immutable legacyRegistry;
    address public migrationController;

    error InvalidLegacyRegistry();
    error InvalidMigrationController();
    error MigrationControllerAlreadySet();
    error NotMigrationController();
    error LegacyNameRequired();
    error InvalidMigration();

    event MigrationControllerSet(address indexed controller);
    event LegacyNameMigrated(
        bytes32 indexed node,
        string name,
        address indexed nameOwner,
        uint256 expiry
    );

    constructor(
        XNSRegistry registry_,
        IXDCDomainsRegistry legacyRegistry_,
        address initialOwner
    ) XNSRegistrar(registry_, initialOwner) {
        if (
            address(legacyRegistry_) == address(0)
                || address(legacyRegistry_).code.length == 0
        ) {
            revert InvalidLegacyRegistry();
        }
        legacyRegistry = legacyRegistry_;
    }

    modifier onlyMigrationController() {
        if (msg.sender != migrationController) revert NotMigrationController();
        _;
    }

    function setMigrationController(address controller) external onlyOwner {
        if (migrationController != address(0)) {
            revert MigrationControllerAlreadySet();
        }
        if (controller == address(0) || controller.code.length == 0) {
            revert InvalidMigrationController();
        }

        migrationController = controller;
        emit MigrationControllerSet(controller);
    }

    function register(
        string calldata name,
        address nameOwner,
        uint256 years_
    ) external payable override nonReentrant {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (
            registry.expiryOf(node) >= block.timestamp
                || _legacyRegistered(canonicalName)
        ) {
            revert Unavailable();
        }

        uint256 cost = _price(bytes(canonicalName).length - 4) * years_;
        if (years_ == 0 || msg.value != cost) revert WrongPrice();

        registry.register(
            node,
            nameOwner,
            block.timestamp + (years_ * YEAR)
        );
    }

    function registerMigration(
        string calldata name,
        address nameOwner,
        uint256 years_
    ) external nonReentrant onlyMigrationController {
        if (nameOwner == address(0) || years_ == 0) revert InvalidMigration();

        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (!_legacyRegistered(canonicalName)) revert LegacyNameRequired();
        if (registry.expiryOf(node) >= block.timestamp) revert Unavailable();

        uint256 expiry = block.timestamp + (years_ * YEAR);
        registry.register(node, nameOwner, expiry);
        emit LegacyNameMigrated(node, canonicalName, nameOwner, expiry);
    }

    function available(
        string calldata name
    ) public view override returns (bool) {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        return
            registry.expiryOf(node) < block.timestamp
                && !_legacyRegistered(canonicalName);
    }

    function legacyRegistered(
        string calldata name
    ) external view returns (bool) {
        return _legacyRegistered(canonicalize(name));
    }

    function _legacyRegistered(
        string memory canonicalName
    ) internal view returns (bool) {
        uint256 tokenId = legacyRegistry._tokenIdMaps(canonicalName);
        return legacyRegistry.exists(tokenId);
    }
}
