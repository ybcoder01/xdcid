import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, keccak256, toBytes, zeroAddress } from "viem";
import {
  XdcidClient,
  XdcidSdkError,
  nodeForName,
  normalizeName,
  parseXdcidName
} from "../dist/index.js";

function mockClient(read, chainId = 50) {
  return {
    chain: { id: chainId },
    getChainId: async () => chainId,
    readContract: async (request) => read(request)
  };
}

test("normalizes bare and suffixed names", () => {
  assert.equal(normalizeName(" Alice "), "alice.xdc");
  assert.equal(normalizeName("ALICE.XDC"), "alice.xdc");
  assert.equal(nodeForName("Alice"), keccak256(toBytes("alice.xdc")));
});

test("reports validation errors without throwing from parseXdcidName", () => {
  assert.equal(parseXdcidName("ab").valid, false);
  assert.equal(parseXdcidName("-alice").valid, false);
  assert.equal(parseXdcidName("ali_ce").valid, false);
  assert.equal(parseXdcidName("alice.xdc.xdc").valid, false);
  assert.throws(
    () => normalizeName("ab"),
    (error) => error instanceof XdcidSdkError && error.code === "INVALID_NAME"
  );
});

test("resolves an active name and its configured payment address", async () => {
  const owner = getAddress("0x1111111111111111111111111111111111111111");
  const paymentAddress = getAddress("0x2222222222222222222222222222222222222222");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3_600);
  const sdk = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "ownerOf") return owner;
      if (functionName === "expiryOf") return expiry;
      if (functionName === "addresses") return paymentAddress;
      throw new Error("Unexpected read");
    })
  );

  const result = await sdk.resolveName("Alice");
  assert.equal(result.name, "alice.xdc");
  assert.equal(result.registered, true);
  assert.equal(result.expired, false);
  assert.equal(result.owner, owner);
  assert.equal(result.address, paymentAddress);
  assert.equal(await sdk.resolveAddress("alice.xdc"), paymentAddress);
});

test("does not resolve expired or zero-owner names", async () => {
  const sdk = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "ownerOf") return zeroAddress;
      if (functionName === "expiryOf") return 1n;
      if (functionName === "addresses") return zeroAddress;
      throw new Error("Unexpected read");
    })
  );

  const result = await sdk.resolveName("alice");
  assert.equal(result.registered, false);
  assert.equal(result.expired, true);
  assert.equal(result.owner, null);
  assert.equal(result.address, null);
});

test("verifies reverse records against the current registry owner", async () => {
  const address = getAddress("0x3333333333333333333333333333333333333333");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3_600);
  const verified = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "primaryNames") return "alice.xdc";
      if (functionName === "ownerOf") return address;
      if (functionName === "expiryOf") return expiry;
      throw new Error("Unexpected read");
    })
  );
  assert.equal((await verified.reverseResolve(address))?.name, "alice.xdc");

  const stale = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "primaryNames") return "alice.xdc";
      if (functionName === "ownerOf") {
        return getAddress("0x4444444444444444444444444444444444444444");
      }
      if (functionName === "expiryOf") return expiry;
      throw new Error("Unexpected read");
    })
  );
  assert.equal(await stale.reverseResolve(address), null);
});

test("returns availability and a multi-year total price", async () => {
  const price = 10n * 10n ** 18n;
  const sdk = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "available") return true;
      if (functionName === "expiryOf") return 0n;
      if (functionName === "price") return price;
      throw new Error("Unexpected read");
    })
  );

  const result = await sdk.checkAvailability("alice", 3);
  assert.equal(result.available, true);
  assert.equal(result.pricePerYear, price);
  assert.equal(result.totalPrice, price * 3n);
});

test("rejects clients connected to another chain", async () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress, 1));
  await assert.rejects(
    () => sdk.resolveName("alice"),
    (error) => error instanceof XdcidSdkError && error.code === "WRONG_CHAIN"
  );
});
