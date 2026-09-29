import { expect } from "chai";
import {
  multichainRecordChainId,
  PAYMENT_NETWORK_ENV,
  PAYMENT_NETWORKS
} from "../frontend/config/paymentNetworks";
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

  it("falls back to the current registry owner only for the XDC network", () => {
    const xdcChainId = PAYMENT_NETWORK_ENV === "testnet" ? 51 : 50;
    expect(
      selectPaymentDestination({
        destinationChainId: xdcChainId,
        currentOwner
      })
    ).to.deep.equal({
      address: currentOwner,
      source: "registry-owner"
    });
  });

  for (const network of PAYMENT_NETWORKS.filter(
    (candidate) => multichainRecordChainId(candidate.chainId) !== 50
  )) {
    it(`does not fall back to the owner on ${network.name}`, () => {
      expect(
        selectPaymentDestination({
          destinationChainId: network.chainId,
          currentOwner
        })
      ).to.equal(null);
    });
  }

  it("maps dev payment networks to the five canonical resolver records", () => {
    expect(multichainRecordChainId(51)).to.equal(50);
    expect(multichainRecordChainId(11155111)).to.equal(1);
    expect(multichainRecordChainId(84532)).to.equal(8453);
    expect(multichainRecordChainId(421614)).to.equal(42161);
    expect(multichainRecordChainId(80002)).to.equal(137);
  });

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
