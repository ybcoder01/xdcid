import { expect } from "chai";
import { PAYMENT_NETWORKS } from "../frontend/config/paymentNetworks";
import { selectPaymentDestination } from "../frontend/lib/paymentPreparation";

const multichainAddress = "0x1111111111111111111111111111111111111111";
const currentOwner = "0x2222222222222222222222222222222222222222";

describe("payment destination selection", () => {
  it("prefers the destination-chain address record", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 8453,
        multichainAddress,
        currentOwner
      })
    ).to.deep.equal({
      address: multichainAddress,
      source: "multichain"
    });
  });

  for (const network of PAYMENT_NETWORKS) {
    it(`falls back to the current registry owner on ${network.name}`, () => {
      expect(
        selectPaymentDestination({
          destinationChainId: network.chainId,
          currentOwner
        })
      ).to.deep.equal({
        address: currentOwner,
        source: "registry-owner"
      });
    });
  }

  it("does not apply the fallback to an unsupported network", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 999_999,
        currentOwner
      })
    ).to.equal(null);
  });

  it("rejects malformed and zero receiving addresses", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 137,
        multichainAddress: "not-an-address"
      })
    ).to.equal(null);

    expect(
      selectPaymentDestination({
        destinationChainId: 50,
        multichainAddress: "0x0000000000000000000000000000000000000000",
        currentOwner: "0x0000000000000000000000000000000000000000"
      })
    ).to.equal(null);
  });
});
