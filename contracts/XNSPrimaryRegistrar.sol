// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./XNSRegistrarV2.sol";

/// @notice Signed-quote registrar that initializes the first primary XDCID in
/// the same registration transaction without replacing an existing primary.
contract XNSPrimaryRegistrar is XNSRegistrarV2 {
    IXNSPrimaryNameInitializer public immutable primaryNameResolver;

    constructor(
        XNSRegistry registry_,
        IXNSLegacyRegistryV2 legacyRegistry_,
        XNSPricingPolicyV2 pricingPolicy_,
        XNSDiscountAuthorization discountAuthorization_,
        IXNSPrimaryNameInitializer primaryNameResolver_,
        address initialOwner
    )
        XNSRegistrarV2(
            registry_,
            legacyRegistry_,
            pricingPolicy_,
            discountAuthorization_,
            initialOwner
        )
    {
        if (
            address(primaryNameResolver_) == address(0) ||
            address(primaryNameResolver_).code.length == 0
        ) revert InvalidDependency();
        primaryNameResolver = primaryNameResolver_;
    }

    function registerWithQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature
    ) external payable override nonReentrant {
        _register(name, quote, quoteSignature, 0);
        _initializePrimary(name, quote.nameOwner);
    }

    function registerWithDiscountQuote(
        string calldata name,
        Quote calldata quote,
        bytes calldata quoteSignature,
        XNSDiscountAuthorization.DiscountAuthorization calldata authorization,
        bytes calldata authorizationSignature
    ) external payable override nonReentrant {
        uint16 discountBps = discountAuthorization.consume(
            authorization,
            authorizationSignature,
            XNSDiscountAuthorization.ConsumptionContext({
                node: quote.node,
                beneficiary: quote.nameOwner,
                product: quote.product,
                termYears: quote.termYears
            })
        );
        _register(name, quote, quoteSignature, discountBps);
        _initializePrimary(name, quote.nameOwner);
    }

    function _initializePrimary(
        string calldata name,
        address nameOwner
    ) private {
        string memory canonicalName = canonicalize(name);
        primaryNameResolver.initializePrimaryName(
            nameOwner,
            canonicalName,
            keccak256(bytes(canonicalName))
        );
    }
}
