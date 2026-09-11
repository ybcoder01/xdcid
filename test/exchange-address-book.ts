import { expect } from "chai";
import { getAddress } from "viem";
import {
  assetMatchesNetwork,
  normalizeExchangeAddressBookInput,
} from "../frontend/lib/exchangeAddressBook";

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
});
