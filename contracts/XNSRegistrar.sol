// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./XNSRegistry.sol";

contract XNSRegistrar is Ownable, ReentrancyGuard {
    XNSRegistry public immutable registry;
    uint256 public constant YEAR = 365 days;

    error InvalidName();
    error Unavailable();
    error WrongPrice();
    error NotNameOwner();

    constructor(XNSRegistry registry_, address initialOwner) Ownable(initialOwner) {
        registry = registry_;
    }

    function register(string calldata name, address nameOwner, uint256 years_) external payable nonReentrant {
        bytes32 node = nodeFor(name);
        if (!available(name)) revert Unavailable();

        uint256 cost = price(name) * years_;
        if (years_ == 0 || msg.value != cost) revert WrongPrice();

        registry.register(node, nameOwner, block.timestamp + (years_ * YEAR));
    }

    function renew(string calldata name, uint256 years_) external payable nonReentrant {
        bytes32 node = nodeFor(name);
        address currentOwner = registry.ownerOf(node);
        if (currentOwner == address(0)) revert Unavailable();
        if (currentOwner != msg.sender) revert NotNameOwner();

        uint256 cost = price(name) * years_;
        if (years_ == 0 || msg.value != cost) revert WrongPrice();

        uint256 currentExpiry = registry.expiryOf(node);
        registry.register(node, msg.sender, currentExpiry + (years_ * YEAR));
    }

    function withdraw(address payable to) external onlyOwner {
        to.transfer(address(this).balance);
    }

    function available(string calldata name) public view returns (bool) {
        bytes32 node = nodeFor(name);
        return registry.expiryOf(node) < block.timestamp;
    }

    function price(string calldata name) public pure returns (uint256) {
        uint256 labelLength = _labelLength(name);
        if (labelLength == 3) return 500 ether;
        if (labelLength == 4) return 100 ether;
        return 10 ether;
    }

    function nodeFor(string calldata name) public pure returns (bytes32) {
        _labelLength(name);
        return keccak256(bytes(name));
    }

    function _labelLength(string calldata name) internal pure returns (uint256) {
        bytes memory raw = bytes(name);
        if (raw.length < 7) revert InvalidName();

        uint256 dot = raw.length - 4;
        if (
            raw[dot] != 0x2e
                || !_isX(raw[dot + 1])
                || !_isD(raw[dot + 2])
                || !_isC(raw[dot + 3])
        ) {
            revert InvalidName();
        }

        uint256 labelLength = raw.length - 4;
        if (labelLength < 3) revert InvalidName();
        return labelLength;
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
