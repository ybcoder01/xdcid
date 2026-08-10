import { expect } from "chai";
import {
  buildRpcUrls,
  getRpcUrls,
  SUPPORTED_RPC_CHAIN_IDS,
} from "../frontend/config/rpcTransports";

describe("multi-network RPC fallback", function () {
  it("prioritizes configured endpoints, removes duplicates, and keeps defaults", function () {
    expect(
      buildRpcUrls(
        " https://primary.example,https://primary.example,not-a-url ",
        ["https://fallback.example"],
      ),
    ).to.deep.equal([
      "https://primary.example",
      "https://fallback.example",
    ]);
  });

  it("uses the requested MEV Blocker endpoints for Ethereum", function () {
    const urls = getRpcUrls(1);
    expect(urls).to.include("https://rpc.mevblocker.io");
    expect(urls).to.include("https://rpc.mevblocker.io/fullprivacy");
  });

  it("provides at least two HTTPS fallbacks for every supported mainnet", function () {
    for (const chainId of SUPPORTED_RPC_CHAIN_IDS) {
      const urls = getRpcUrls(chainId);
      expect(urls.length).to.be.greaterThanOrEqual(2);
      expect(new Set(urls).size).to.equal(urls.length);
      expect(urls.every((url) => url.startsWith("https://"))).to.equal(true);
    }
  });
});
