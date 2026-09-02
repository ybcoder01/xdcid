import { expect } from "chai";
import {
  automaticForwardingMessage,
  getPaymentRouteCapability
} from "../frontend/lib/paymentRouteCapabilities";

describe("payment route capabilities", function () {
  const mainnetChainIds = [1, 50, 137, 8453, 42161];
  const testnetChainIds = [11155111, 51, 80002, 84532, 421614];

  it("enables automatic forwarding for every distinct mainnet pair", function () {
    for (const sourceChainId of mainnetChainIds) {
      for (const destinationChainId of mainnetChainIds) {
        const capability = getPaymentRouteCapability(
          sourceChainId,
          destinationChainId
        );
        expect(capability.standardTransfer).to.equal(true);
        expect(capability.automaticForwarding).to.equal(
          sourceChainId === destinationChainId
            ? "unavailable"
            : "mainnet-enabled"
        );
      }
    }
  });

  it("enables automatic forwarding for every distinct testnet pair", function () {
    for (const sourceChainId of testnetChainIds) {
      for (const destinationChainId of testnetChainIds) {
        const capability = getPaymentRouteCapability(
          sourceChainId,
          destinationChainId
        );
        expect(capability.standardTransfer).to.equal(true);
        expect(capability.automaticForwarding).to.equal(
          sourceChainId === destinationChainId
            ? "unavailable"
            : "testnet-enabled"
        );
      }
    }
  });

  it("does not mix mainnet and testnet routes", function () {
    expect(getPaymentRouteCapability(50, 84532)).to.deep.equal({
      standardTransfer: true,
      automaticForwarding: "unavailable"
    });
  });

  it("rejects unsupported networks", function () {
    expect(getPaymentRouteCapability(999, 51)).to.deep.equal({
      standardTransfer: false,
      automaticForwarding: "unavailable"
    });
  });

  it("describes enabled testnet forwarding clearly", function () {
    expect(automaticForwardingMessage("testnet-enabled")).to.equal(
      "Automatic forwarding is enabled for this testnet route."
    );
  });
});
