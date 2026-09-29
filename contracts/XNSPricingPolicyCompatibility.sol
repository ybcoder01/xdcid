// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSPricingPolicyV2.sol";

/// @notice Compatibility reads for long-lived Pricing Policy V2 deployments.
/// @dev Early V2 deployments expose `priceUsdMicros` and `version`, but predate
/// `priceUsdMicrosForVersion`. A current-version quote remains safe to price
/// through the original function. Reverts from policies that do implement the
/// versioned function are preserved so expired grace-period quotes cannot fall
/// back to current pricing.
library XNSPricingPolicyCompatibility {
    error UnsupportedPricingPolicyVersion();

    function priceUsdMicrosForVersion(
        XNSPricingPolicyV2 policy,
        XNSPricingPolicyV2.Product product,
        uint256 labelLength,
        uint256 years_,
        uint256 quoteVersion
    ) internal view returns (uint256) {
        (bool succeeded, bytes memory result) = address(policy).staticcall(
            abi.encodeCall(
                policy.priceUsdMicrosForVersion,
                (product, labelLength, years_, quoteVersion)
            )
        );

        if (succeeded) return abi.decode(result, (uint256));

        // A deployed policy with this selector deliberately rejected the
        // quote. Preserve its custom error instead of weakening validation.
        if (result.length != 0) {
            assembly ("memory-safe") {
                revert(add(result, 0x20), mload(result))
            }
        }

        // The selector is absent on the original V2 policy. Only its current
        // version can be priced safely because that bytecode has no historical
        // configuration lookup.
        if (quoteVersion != policy.version()) {
            revert UnsupportedPricingPolicyVersion();
        }
        return policy.priceUsdMicros(product, labelLength, years_);
    }
}
