import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, keccak256, toBytes, zeroAddress } from "viem";
import {
  SUPPORTED_MULTICHAIN_NETWORKS,
  XDCID_CONTRACTS,
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
  assert.equal(parseXdcidName("ab").valid, true);
  assert.equal(parseXdcidName("a").valid, false);
  assert.equal(parseXdcidName("-alice").valid, false);
  assert.equal(parseXdcidName("ali_ce").valid, false);
  assert.equal(parseXdcidName("alice.xdc.xdc").valid, false);
  assert.throws(
    () => normalizeName("a"),
    (error) => error instanceof XdcidSdkError && error.code === "INVALID_NAME"
  );
});

test("exposes the verified resolver and initial multichain network metadata", () => {
  assert.equal(
    XDCID_CONTRACTS.multichainResolver,
    getAddress("0x978d46Ba080Ae71b5cB39691106A1cCf6C6c7240")
  );
  assert.deepEqual(
    SUPPORTED_MULTICHAIN_NETWORKS.map(({ chainId }) => chainId),
    [50, 1, 8453, 42161, 137]
  );
  assert.equal(
    XDCID_CONTRACTS.registrar,
    getAddress("0xdEaf1742614908a8d170f4c9520c3cd1e967ef36")
  );
  assert.equal(
    XDCID_CONTRACTS.subdomainRegistrar,
    getAddress("0x27b6Ef20912B50F7b86f6C0Aed75d0ddFD7DA1C7")
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

test("resolves multichain addresses and converts empty records to null", async () => {
  const target = getAddress("0x5555555555555555555555555555555555555555");
  const reads = [];
  const sdk = new XdcidClient(
    mockClient((request) => {
      reads.push(request);
      return request.args[1] === 8453n ? target : zeroAddress;
    })
  );

  assert.equal(await sdk.resolveMultichainAddress("alice", 8453), target);
  assert.equal(await sdk.resolveMultichainAddress("alice", 42161), null);
  assert.equal(reads[0].functionName, "addressFor");
  assert.equal(reads[0].args[1], 8453n);
});

test("returns a normalized multichain address record", async () => {
  const target = getAddress("0x6666666666666666666666666666666666666666");
  const recordOwner = getAddress("0x7777777777777777777777777777777777777777");
  const sdk = new XdcidClient(mockClient(() => [target, recordOwner, true]));

  const result = await sdk.getMultichainAddressRecord("Alice", 1);
  assert.equal(result.name, "alice.xdc");
  assert.equal(result.node, nodeForName("alice.xdc"));
  assert.equal(result.chainId, 1);
  assert.equal(result.target, target);
  assert.equal(result.recordOwner, recordOwner);
  assert.equal(result.active, true);
});

test("prepares owner-signed set and clear requests for XDC", () => {
  const target = getAddress("0x8888888888888888888888888888888888888888");
  const sdk = new XdcidClient(mockClient(() => zeroAddress));
  const setRequest = sdk.prepareSetMultichainAddress("Alice", 137, target);
  const clearRequest = sdk.prepareClearMultichainAddress("Alice", 137);

  assert.equal(setRequest.chainId, 50);
  assert.equal(setRequest.address, XDCID_CONTRACTS.multichainResolver);
  assert.equal(setRequest.functionName, "setAddress");
  assert.deepEqual(setRequest.args, [nodeForName("alice.xdc"), 137n, target]);
  assert.equal(clearRequest.chainId, 50);
  assert.equal(clearRequest.functionName, "clearAddress");
  assert.deepEqual(clearRequest.args, [nodeForName("alice.xdc"), 137n]);
});

test("rejects invalid multichain request inputs", () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress));
  assert.throws(
    () => sdk.prepareSetMultichainAddress("alice", 1, "not-an-address"),
    (error) => error instanceof XdcidSdkError && error.code === "INVALID_ADDRESS"
  );
  assert.throws(
    () => sdk.prepareSetMultichainAddress("alice", 1, zeroAddress),
    (error) => error instanceof XdcidSdkError && error.code === "INVALID_ADDRESS"
  );
  assert.throws(
    () => sdk.prepareClearMultichainAddress("alice", 0),
    (error) => error instanceof XdcidSdkError && error.code === "INVALID_CHAIN_ID"
  );
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

test("returns on-chain availability and delegates current pricing to the quote API", async () => {
  const sdk = new XdcidClient(
    mockClient(({ functionName }) => {
      if (functionName === "available") return true;
      if (functionName === "expiryOf") return 0n;
      throw new Error("Unexpected read");
    })
  );

  const result = await sdk.checkAvailability("alice", 3);
  assert.equal(result.available, true);
  assert.equal(result.pricePerYear, null);
  assert.equal(result.totalPrice, null);
});

test("prepares identity management calls without submitting them", () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress));
  const target = getAddress("0x9999999999999999999999999999999999999999");

  assert.deepEqual(sdk.prepareTransferName("ai", target).args, [nodeForName("ai"), target]);
  assert.equal(sdk.prepareSetResolver("ai").functionName, "setResolver");
  assert.equal(sdk.prepareSetAddress("ai", target).functionName, "setAddress");
  assert.deepEqual(sdk.prepareSetText("ai", "website", "https://example.com").args, [
    nodeForName("ai"),
    "website",
    "https://example.com"
  ]);
  assert.deepEqual(sdk.prepareSetPrimaryName("AI").args, ["ai.xdc", nodeForName("ai")]);
});

test("prepares a signed XDC registration payment plan", () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress));
  const payer = getAddress("0x1111111111111111111111111111111111111111");
  const data = {
    authorizedForPayment: true,
    chainId: 50,
    registrar: XDCID_CONTRACTS.registrar,
    policy: XDCID_CONTRACTS.pricingPolicy,
    product: "registration",
    name: "ai.xdc",
    paymentCurrency: "XDC",
    quote: {
      node: nodeForName("ai"),
      payer,
      nameOwner: payer,
      product: 0,
      termYears: "1",
      paymentToken: zeroAddress,
      paymentAmount: "1000",
      usdMicros: "50000000",
      policyVersion: "2",
      nonce: "0",
      issuedAt: "1",
      deadline: String(Math.floor(Date.now() / 1000) + 600)
    },
    signature: "0x1234"
  };

  const plan = sdk.prepareRegistrarPayment(data);
  assert.equal(plan.approval, null);
  assert.equal(plan.transaction.functionName, "registerWithQuote");
  assert.equal(plan.transaction.value, 1000n);
  assert.equal(plan.transaction.args[0], "ai.xdc");
});

test("prepares a gas-only registration with a matching discount grant", () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress));
  const payer = getAddress("0x1111111111111111111111111111111111111111");
  const deadline = String(Math.floor(Date.now() / 1000) + 600);
  const node = nodeForName("beta");
  const plan = sdk.prepareRegistrarPayment({
    authorizedForPayment: true,
    chainId: 50,
    registrar: XDCID_CONTRACTS.registrar,
    policy: XDCID_CONTRACTS.pricingPolicy,
    product: "registration",
    name: "beta.xdc",
    paymentCurrency: "XDC",
    quote: {
      node,
      payer,
      nameOwner: payer,
      product: 0,
      termYears: "1",
      paymentToken: zeroAddress,
      paymentAmount: "0",
      usdMicros: "0",
      policyVersion: "2",
      nonce: "1",
      issuedAt: "1",
      deadline
    },
    signature: "0x1234",
    discount: {
      authorizationContract: XDCID_CONTRACTS.discountAuthorization,
      authorization: {
        node,
        beneficiary: payer,
        product: 0,
        termYears: "1",
        discountBps: 10_000,
        maxUses: 1,
        validAfter: "0",
        deadline,
        nonce: "2"
      },
      signature: "0x5678"
    }
  });

  assert.equal(plan.approval, null);
  assert.equal(plan.transaction.functionName, "registerWithDiscountQuote");
  assert.equal(plan.transaction.value, 0n);
});

test("rejects clients connected to another chain", async () => {
  const sdk = new XdcidClient(mockClient(() => zeroAddress, 1));
  await assert.rejects(
    () => sdk.resolveName("alice"),
    (error) => error instanceof XdcidSdkError && error.code === "WRONG_CHAIN"
  );
});
