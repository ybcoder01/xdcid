// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./XNSRegistry.sol";

contract XNSRegistrar is Ownable, ReentrancyGuard {
    XNSRegistry public immutable registry;
    uint256 public constant YEAR = 365 days;
    uint256 public constant MIN_LABEL_LENGTH = 3;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    error InvalidName();
    error Unavailable();
    error WrongPrice();
    error NotNameOwner();

    constructor(XNSRegistry registry_, address initialOwner) Ownable(initialOwner) {
        registry = registry_;
    }

    function register(string calldata name, address nameOwner, uint256 years_) external payable nonReentrant {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        if (registry.expiryOf(node) >= block.timestamp) revert Unavailable();

        uint256 cost = _price(bytes(canonicalName).length - 4) * years_;
        if (years_ == 0 || msg.value != cost) revert WrongPrice();

        registry.register(node, nameOwner, block.timestamp + (years_ * YEAR));
    }

    function renew(string calldata name, uint256 years_) external payable nonReentrant {
        string memory canonicalName = canonicalize(name);
        bytes32 node = keccak256(bytes(canonicalName));
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) revert Unavailable();
        if (currentOwner != msg.sender) revert NotNameOwner();

        uint256 cost = _price(bytes(canonicalName).length - 4) * years_;
        if (years_ == 0 || msg.value != cost) revert WrongPrice();

        uint256 currentExpiry = registry.expiryOf(node);
        registry.register(node, msg.sender, currentExpiry + (years_ * YEAR));
    }

    function withdraw(address payable to) external onlyOwner {
        to.transfer(address(this).balance);
    }

    function available(string calldata name) public view returns (bool) {
        return registry.expiryOf(nodeFor(name)) < block.timestamp;
    }

    function price(string calldata name) public pure returns (uint256) {
        bytes memory canonicalName = bytes(canonicalize(name));
        return _price(canonicalName.length - 4);
    }

    function nodeFor(string calldata name) public pure returns (bytes32) {
        return keccak256(bytes(canonicalize(name)));
    }

    function canonicalize(string calldata name) public pure returns (string memory) {
        bytes memory raw = bytes(name);
        uint256 labelLength = _labelLength(raw);
        bytes memory canonical = new bytes(raw.length);

        for (uint256 i = 0; i < labelLength; i++) {
            bytes1 char = raw[i];
            uint8 code = uint8(char);

            if (code >= 65 && code <= 90) {
                code += 32;
                char = bytes1(code);
            }

            bool valid = (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || char == 0x2d;
            if (!valid || (char == 0x2d && (i == 0 || i == labelLength - 1))) revert InvalidName();

            canonical[i] = char;
        }

        canonical[labelLength] = 0x2e;
        canonical[labelLength + 1] = 0x78;
        canonical[labelLength + 2] = 0x64;
        canonical[labelLength + 3] = 0x63;
        return string(canonical);
    }

    function _price(uint256 labelLength) internal pure returns (uint256) {
        if (labelLength == 3) return 500 ether;
        if (labelLength == 4) return 100 ether;
        return 10 ether;
    }

    function _labelLength(bytes memory raw) internal pure returns (uint256) {
        if (raw.length < MIN_LABEL_LENGTH + 4 || raw.length > MAX_LABEL_LENGTH + 4) revert InvalidName();

        uint256 dot = raw.length - 4;
        if (
            raw[dot] != 0x2e
                || !_isX(raw[dot + 1])
                || !_isD(raw[dot + 2])
                || !_isC(raw[dot + 3])
        ) {
            revert InvalidName();
        }

        return dot;
    }

    function _isX(bytes1 char) internal pure returns (bool) {
        return char == 0x78 || char == 0x58;
    }

    function _isD(bytes1 char) internal pure returns (bool) {
        return char == 0x64 || char == 0x44;
    }

    function _isC(bytes1 char) internal pure returns (bool) {
        return char == 0x63 || char == 0x43;
    }
}
