import { expect } from "chai";
import { getAddress, keccak256, toBytes, zeroAddress, type PublicClient } from "viem";
import {
  XdcidClient,
  XdcidSdkError,
  nodeForName,
  normalizeName,
  parseXdcidName
} from "../sdk/src";

type ReadRequest = {
  functionName: string;
  args?: readonly unknown[];
};

function mockClient(
  read: (request: ReadRequest) => unknown | Promise<unknown>,
  chainId = 50
): PublicClient {
  return {
    chain: { id: chainId },
    getChainId: async () => chainId,
    readContract: async (request: ReadRequest) => read(request)
  } as unknown as PublicClient;
}

describe("XDCID SDK", function () {
  it("normalizes bare and suffixed names", function () {
    expect(normalizeName(" Alice ")).to.equal("alice.xdc");
    expect(normalizeName("ALICE.XDC")).to.equal("alice.xdc");
    expect(nodeForName("Alice")).to.equal(keccak256(toBytes("alice.xdc")));
  });

  it("reports validation errors without throwing from parseXdcidName", function () {
    expect(parseXdcidName("ab").valid).to.equal(false);
    expect(parseXdcidName("-alice").valid).to.equal(false);
    expect(parseXdcidName("ali_ce").valid).to.equal(false);
    expect(parseXdcidName("alice.xdc.xdc").valid).to.equal(false);

    expect(() => normalizeName("ab"))
      .to.throw(XdcidSdkError)
      .with.property("code", "INVALID_NAME");
  });

  it("resolves an active name and uses its configured payment address", async function () {
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
    expect(result.name).to.equal("alice.xdc");
    expect(result.registered).to.equal(true);
    expect(result.expired).to.equal(false);
    expect(result.owner).to.equal(owner);
    expect(result.address).to.equal(paymentAddress);
    expect(await sdk.resolveAddress("alice.xdc")).to.equal(paymentAddress);
  });

  it("does not resolve expired or zero-owner names", async function () {
    const sdk = new XdcidClient(
      mockClient(({ functionName }) => {
        if (functionName === "ownerOf") return zeroAddress;
        if (functionName === "expiryOf") return 1n;
        if (functionName === "addresses") return zeroAddress;
        throw new Error("Unexpected read");
      })
    );

    const result = await sdk.resolveName("alice");
    expect(result.registered).to.equal(false);
    expect(result.expired).to.equal(true);
    expect(result.owner).to.equal(null);
    expect(result.address).to.equal(null);
  });

  it("verifies reverse records against the current registry owner", async function () {
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

    expect((await verified.reverseResolve(address))?.name).to.equal("alice.xdc");

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

    expect(await stale.reverseResolve(address)).to.equal(null);
  });

  it("returns availability and a multi-year total price", async function () {
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
    expect(result.available).to.equal(true);
    expect(result.pricePerYear).to.equal(price);
    expect(result.totalPrice).to.equal(price * 3n);
  });

  it("rejects clients connected to another chain", async function () {
    const sdk = new XdcidClient(mockClient(() => zeroAddress, 1));

    await expect(sdk.resolveName("alice"))
      .to.be.rejectedWith(XdcidSdkError)
      .and.have.property("code", "WRONG_CHAIN");
  });
});
