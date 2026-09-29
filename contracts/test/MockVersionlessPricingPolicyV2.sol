// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../XNSPricingPolicyV2.sol";
import "../XNSPricingPolicyCompatibility.sol";

/// @dev Represents the original Pricing Policy V2 bytecode deployed before
/// version-aware price reads were added.
contract MockVersionlessPricingPolicyV2 {
    uint256 public immutable version;
    uint256 public immutable price;

    constructor(uint256 version_, uint256 price_) {
        version = version_;
        price = price_;
    }

    function priceUsdMicros(
        XNSPricingPolicyV2.Product,
        uint256,
        uint256
    ) external view returns (uint256) {
        return price;
    }
}

contract PricingPolicyCompatibilityHarness {
    function priceUsdMicrosForVersion(
        address policy,
        XNSPricingPolicyV2.Product product,
        uint256 labelLength,
        uint256 years_,
        uint256 quoteVersion
    ) external view returns (uint256) {
        return XNSPricingPolicyCompatibility.priceUsdMicrosForVersion(
            XNSPricingPolicyV2(policy),
            product,
            labelLength,
            years_,
            quoteVersion
        );
    }
}
