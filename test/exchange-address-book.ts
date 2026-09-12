import { expect } from "chai";
import { getAddress } from "viem";
import {
  assetMatchesNetwork,
  normalizeExchangeAddressBookInput,
  paymentSelectionForSavedEntry,
} from "../frontend/lib/exchangeAddressBook";
import {
  MAINNET_PAYMENT_NETWORKS,
  TESTNET_PAYMENT_NETWORKS,
} from "../frontend/config/paymentNetworks";

const address = "0x00000000000000000000000000000000000000a1";

describe("exchange address book", function () {
  it("normalizes a network-bound encrypted-vault entry", function () {
    expect(normalizeExchangeAddressBookInput({
      exchange: "  Binance  ",
      label: " Main   USDC ",
      asset: "usdc",
      chainId: 8453,
      address,
      memo: "  account  14 ",
      notes: " treasury\n deposit ",
      status: "active",
    })).to.deep.equal({
      exchange: "Binance",
      label: "Main USDC",
      asset: "USDC",
      chainId: 8453,
      address: getAddress(address),
      memo: "account 14",
      notes: "treasury deposit",
      status: "active",
    });
  });

  it("rejects malformed addresses and unsupported networks", function () {
    const base = { exchange: "OKX", label: "Main deposit", asset: "USDC", chainId: 50, address };
    expect(() => normalizeExchangeAddressBookInput({ ...base, address: "xdc123" })).to.throw("valid EVM");
    expect(() => normalizeExchangeAddressBookInput({ ...base, chainId: 51 })).to.throw("supported mainnet");
    expect(() => normalizeExchangeAddressBookInput({ ...base, asset: "DOGE" })).to.throw("supported asset");
  });

  it("distinguishes USDC from each network's native asset", function () {
    expect(assetMatchesNetwork("USDC", 8453)).to.equal(true);
    expect(assetMatchesNetwork("XDC", 50)).to.equal(true);
    expect(assetMatchesNetwork("ETH", 8453)).to.equal(true);
    expect(assetMatchesNetwork("POL", 137)).to.equal(true);
    expect(assetMatchesNetwork("XDC", 1)).to.equal(false);
  });

  it("maps a saved network family to the active payment environment", function () {
    const entry = {
      id: "okx-arbitrum",
      exchange: "OKX",
      label: "OKX USDC",
      asset: "USDC" as const,
      chainId: 42161,
      address: getAddress(address),
      status: "active" as const,
      confirmedAt: "2026-09-12T00:00:00.000Z",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
    };

    expect(paymentSelectionForSavedEntry(entry, MAINNET_PAYMENT_NETWORKS)).to.deep.equal({
      chainId: 42161,
      token: "USDC",
    });
    expect(paymentSelectionForSavedEntry(entry, TESTNET_PAYMENT_NETWORKS)).to.deep.equal({
      chainId: 421614,
      token: "USDC",
    });
  });
});
