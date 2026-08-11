// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract XNSPricingPolicy is Ownable {
    uint256 public constant UPDATE_DELAY = 48 hours;
    uint256 public constant QUOTE_GRACE_PERIOD = 5 minutes;
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MIN_LABEL_LENGTH = 3;
    uint256 public constant MAX_LABEL_LENGTH = 63;

    enum Product {
        Registration,
        Renewal,
        Subdomain,
        Migration
    }

    struct PricingConfig {
        uint64 threeCharacterAnnualUsdMicros;
        uint64 fourCharacterAnnualUsdMicros;
        uint64 standardAnnualUsdMicros;
        uint64 subdomainAnnualUsdMicros;
        uint64 migrationUsdMicros;
        uint16 threeYearDiscountBps;
        uint16 fiveYearDiscountBps;
        uint16 tenYearDiscountBps;
        uint16 xdcQuoteBufferBps;
        address quoteSigner;
        address usdcToken;
        address treasury;
        bool xdcPaymentsEnabled;
        bool usdcPaymentsEnabled;
    }

    PricingConfig private _config;
    PricingConfig private _pendingConfig;
    uint256 public version = 1;
    uint256 public pendingActivationTime;
    bool public hasPendingConfig;

    uint256 public previousVersion;
    address public previousQuoteSigner;
    uint256 public previousQuoteValidUntil;

    error InvalidConfig();
    error InvalidLabelLength();
    error InvalidTerm();
    error NoPendingConfig();
    error UpdateDelayActive();

    event PricingConfigProposed(
        uint256 indexed nextVersion,
        bytes32 indexed configHash,
        uint256 activationTime
    );
    event PricingConfigCancelled(uint256 indexed nextVersion);
    event PricingConfigActivated(
        uint256 indexed version,
        bytes32 indexed configHash
    );

    constructor(
        PricingConfig memory initialConfig,
        address initialOwner
    ) Ownable(initialOwner) {
        _validateConfig(initialConfig);
        _config = initialConfig;
        emit PricingConfigActivated(1, hashConfig(initialConfig));
    }

    function config() external view returns (PricingConfig memory) {
        return _config;
    }

    function pendingConfig() external view returns (PricingConfig memory) {
        return _pendingConfig;
    }

    function proposeConfig(
        PricingConfig calldata nextConfig
    ) external onlyOwner {
        _validateConfig(nextConfig);
        _pendingConfig = nextConfig;
        pendingActivationTime = block.timestamp + UPDATE_DELAY;
        hasPendingConfig = true;
        emit PricingConfigProposed(
            version + 1,
            hashConfig(nextConfig),
            pendingActivationTime
        );
    }

    function cancelPendingConfig() external onlyOwner {
        if (!hasPendingConfig) revert NoPendingConfig();
        delete _pendingConfig;
        delete pendingActivationTime;
        hasPendingConfig = false;
        emit PricingConfigCancelled(version + 1);
    }

    function activatePendingConfig() external {
        if (!hasPendingConfig) revert NoPendingConfig();
        if (block.timestamp < pendingActivationTime) {
            revert UpdateDelayActive();
        }

        previousVersion = version;
        previousQuoteSigner = _config.quoteSigner;
        previousQuoteValidUntil = block.timestamp + QUOTE_GRACE_PERIOD;

        _config = _pendingConfig;
        version += 1;
        delete _pendingConfig;
        delete pendingActivationTime;
        hasPendingConfig = false;

        emit PricingConfigActivated(version, hashConfig(_config));
    }

    function priceUsdMicros(
        Product product,
        uint256 labelLength,
        uint256 years_
    ) external view returns (uint256) {
        if (product == Product.Migration) {
            if (years_ != 0) revert InvalidTerm();
            return _config.migrationUsdMicros;
        }

        uint256 annualPrice;
        if (product == Product.Subdomain) {
            annualPrice = _config.subdomainAnnualUsdMicros;
        } else {
            if (
                labelLength < MIN_LABEL_LENGTH ||
                labelLength > MAX_LABEL_LENGTH
            ) {
                revert InvalidLabelLength();
            }
            annualPrice = labelLength == 3
                ? _config.threeCharacterAnnualUsdMicros
                : labelLength == 4
                    ? _config.fourCharacterAnnualUsdMicros
                    : _config.standardAnnualUsdMicros;
        }

        uint256 discountBps = _discountForTerm(years_);
        uint256 gross = annualPrice * years_;
        return _divideRoundingUp(
            gross * (BASIS_POINTS - discountBps),
            BASIS_POINTS
        );
    }

    function isQuoteAuthorizationValid(
        address signer,
        uint256 quoteVersion
    ) external view returns (bool) {
        if (signer == _config.quoteSigner && quoteVersion == version) {
            return true;
        }
        return
            signer == previousQuoteSigner &&
            quoteVersion == previousVersion &&
            block.timestamp <= previousQuoteValidUntil;
    }

    function hashConfig(
        PricingConfig memory target
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(target));
    }

    function _discountForTerm(
        uint256 years_
    ) internal view returns (uint256) {
        if (years_ == 1) return 0;
        if (years_ == 3) return _config.threeYearDiscountBps;
        if (years_ == 5) return _config.fiveYearDiscountBps;
        if (years_ == 10) return _config.tenYearDiscountBps;
        revert InvalidTerm();
    }

    function _validateConfig(PricingConfig memory target) internal pure {
        _validatePricesAndAddresses(target);
        _validateDiscountsAndBuffer(target);
    }

    function _validatePricesAndAddresses(
        PricingConfig memory target
    ) internal pure {
        if (
            target.threeCharacterAnnualUsdMicros == 0 ||
            target.fourCharacterAnnualUsdMicros == 0 ||
            target.standardAnnualUsdMicros == 0 ||
            target.subdomainAnnualUsdMicros == 0 ||
            target.migrationUsdMicros == 0 ||
            target.quoteSigner == address(0) ||
            target.usdcToken == address(0) ||
            target.treasury == address(0)
        ) {
            revert InvalidConfig();
        }
    }

    function _validateDiscountsAndBuffer(
        PricingConfig memory target
    ) internal pure {
        if (
            target.threeYearDiscountBps > target.fiveYearDiscountBps ||
            target.fiveYearDiscountBps > target.tenYearDiscountBps ||
            target.tenYearDiscountBps >= BASIS_POINTS ||
            target.xdcQuoteBufferBps > 2_000
        ) {
            revert InvalidConfig();
        }
    }

    function _divideRoundingUp(
        uint256 numerator,
        uint256 denominator
    ) internal pure returns (uint256) {
        return (numerator + denominator - 1) / denominator;
    }
}
