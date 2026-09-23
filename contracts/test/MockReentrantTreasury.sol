// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only treasury that attempts a configured callback whenever it receives XDC.
contract MockReentrantTreasury {
    address payable private constant SINK =
        payable(0x000000000000000000000000000000000000dEaD);

    address public target;
    bytes public callbackData;
    bool public callbackAttempted;
    bool public callbackSucceeded;

    function configure(address target_, bytes calldata callbackData_) external {
        target = target_;
        callbackData = callbackData_;
        callbackAttempted = false;
        callbackSucceeded = false;
    }

    receive() external payable {
        callbackAttempted = true;
        (callbackSucceeded, ) = target.call(callbackData);
        SINK.transfer(msg.value);
    }
}
