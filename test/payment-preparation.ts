import { expect } from "chai";
import { selectPaymentDestination } from "../frontend/lib/paymentPreparation";

const multichainAddress = "0x1111111111111111111111111111111111111111";
const xdcDefaultAddress = "0x2222222222222222222222222222222222222222";

describe("payment destination selection", () => {
  it("prefers the destination-chain address record", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 8453,
        multichainAddress,
        xdcDefaultAddress
      })
    ).to.deep.equal({
      address: multichainAddress,
      source: "multichain"
    });
  });

  it("falls back to the XDC default record only for XDC", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 50,
        xdcDefaultAddress
      })
    ).to.deep.equal({
      address: xdcDefaultAddress,
      source: "xdc-default"
    });
  });

  it("does not send another network to the XDC default address", () => {
    expect(
      selectPaymentDestination({
        destinationChainId: 1,
        xdcDefaultAddress
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
        xdcDefaultAddress: "0x0000000000000000000000000000000000000000"
      })
    ).to.equal(null);
  });
});
