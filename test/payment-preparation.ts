import { expect } from "chai";
import { PAYMENT_NETWORKS } from "../frontend/config/paymentNetworks";
import { selectPaymentDestination } from "../frontend/lib/paymentPreparation";

const multichainAddress = "0x1111111111111111111111111111111111111111";
const defaultEvmAddress = "0x2222222222222222222222222222222222222222";

describe("payment destination selection", () => {
  it("prefers the destination-chain address record", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 8453,
        multichainAddress,
        defaultEvmAddress
      })
    ).to.deep.equal({
      address: multichainAddress,
      source: "multichain"
    });
  });

  for (const network of PAYMENT_NETWORKS) {
    it(`falls back to the default EVM address on ${network.name}`, () => {
      expect(
        selectPaymentDestination({
          destinationChainId: network.chainId,
          defaultEvmAddress
        })
      ).to.deep.equal({
        address: defaultEvmAddress,
        source: "evm-default"
      });
    });
  }

  it("does not apply the fallback to an unsupported network", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 999_999,
        defaultEvmAddress
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
        defaultEvmAddress: "0x0000000000000000000000000000000000000000"
      })
    ).to.equal(null);
  });
});
