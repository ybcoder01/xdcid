// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockERC1271Wallet {
    bytes4 public constant MAGIC_VALUE = 0x1626ba7e;
    bytes4 public constant INVALID_VALUE = 0xffffffff;

    address public signer;
    bytes4 public validResult = MAGIC_VALUE;
    bool public shouldRevert;

    constructor(address signer_) {
        signer = signer_;
    }

    function setSigner(address signer_) external {
        signer = signer_;
    }

    function setValidResult(bytes4 validResult_) external {
        validResult = validResult_;
    }

    function setShouldRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        require(!shouldRevert, "Mock signature check reverted");
        return ECDSA.recover(hash, signature) == signer ? validResult : INVALID_VALUE;
    }
}
