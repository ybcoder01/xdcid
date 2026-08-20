import { expect } from "chai";
import {
  CCTP_MESSAGE_TRANSMITTER_V2,
  CCTP_TOKEN_MESSENGER_V2,
  MAINNET_PAYMENT_NETWORKS,
  PAYMENT_NETWORKS,
  TESTNET_PAYMENT_NETWORKS,
  USDC_DECIMALS
} from "../frontend/config/paymentNetworks";
import {
  PaymentRouteError,
  planPaymentRoute,
  swapPaymentNetworks
} from "../frontend/lib/paymentRouting";

describe("multichain payment routing", () => {
  it("swaps XDC and Base in both directions", () => {
    const xdcToBase = {
      sourceChainId: 50,
      destinationChainId: 8453
    };
    const baseToXdc = swapPaymentNetworks(xdcToBase);

    expect(baseToXdc).to.deep.equal({
      sourceChainId: 8453,
      destinationChainId: 50
    });
    expect(swapPaymentNetworks(baseToXdc)).to.deep.equal(xdcToBase);
  });

  it("uses verified Circle configuration for all five networks", () => {
    expect(USDC_DECIMALS).to.equal(6);
    expect(CCTP_TOKEN_MESSENGER_V2).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(CCTP_MESSAGE_TRANSMITTER_V2).to.match(/^0x[0-9a-fA-F]{40}$/);

    expect(
      PAYMENT_NETWORKS.map(({ chainId, circleDomain, usdcAddress }) => ({
        chainId,
        circleDomain,
        usdcAddress
      }))
    ).to.deep.equal([
      {
        chainId: 1,
        circleDomain: 0,
        usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
      },
      {
        chainId: 50,
        circleDomain: 18,
        usdcAddress: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1"
      },
      {
        chainId: 137,
        circleDomain: 7,
        usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
      },
      {
        chainId: 8453,
        circleDomain: 6,
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      },
      {
        chainId: 42161,
        circleDomain: 3,
        usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
      }
    ]);
  });

  it("defines all five corresponding testnet networks", () => {
    expect(
      TESTNET_PAYMENT_NETWORKS.map(
        ({ chainId, circleDomain, nativeSymbol, usdcAddress }) => ({
          chainId,
          circleDomain,
          nativeSymbol,
          usdcAddress
        })
      )
    ).to.deep.equal([
      {
        chainId: 11155111,
        circleDomain: 0,
        nativeSymbol: "ETH",
        usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
      },
      {
        chainId: 51,
        circleDomain: 18,
        nativeSymbol: "TXDC",
        usdcAddress: "0xb5AB69F7bBada22B28e79C8FFAECe55eF1c771D4"
      },
      {
        chainId: 80002,
        circleDomain: 7,
        nativeSymbol: "POL",
        usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
      },
      {
        chainId: 84532,
        circleDomain: 6,
        nativeSymbol: "ETH",
        usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
      },
      {
        chainId: 421614,
        circleDomain: 3,
        nativeSymbol: "ETH",
        usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
      }
    ]);
    expect(MAINNET_PAYMENT_NETWORKS).to.have.length(5);
  });

  it("plans same-chain payments as direct transfers", () => {
    for (const network of PAYMENT_NETWORKS) {
      const route = planPaymentRoute({
        sourceChainId: network.chainId,
        destinationChainId: network.chainId,
        token: "NATIVE"
      });

      expect(route.kind).to.equal("direct");
      expect(route.steps).to.deep.equal(["transfer"]);
    }
  });

  it("plans every cross-chain USDC pair through CCTP", () => {
    for (const source of PAYMENT_NETWORKS) {
      for (const destination of PAYMENT_NETWORKS) {
        if (source.chainId === destination.chainId) continue;

        const route = planPaymentRoute({
          sourceChainId: source.chainId,
          destinationChainId: destination.chainId,
          token: "USDC"
        });

        expect(route.kind).to.equal("cctp-standard");
        expect(route.steps).to.deep.equal(["approve", "burn", "attest", "mint"]);
      }
    }
  });

  it("rejects unsupported cross-chain native transfers", () => {
    expect(() =>
      planPaymentRoute({
        sourceChainId: 1,
        destinationChainId: 50,
        token: "NATIVE"
      })
    ).to.throw(PaymentRouteError, "Cross-chain native-asset transfers are not supported.");
  });

  it("rejects chains outside the supported set", () => {
    expect(() =>
      planPaymentRoute({
        sourceChainId: 999,
        destinationChainId: 50,
        token: "USDC"
      })
    ).to.throw(PaymentRouteError, "Both source and destination must be supported payment networks.");
  });
});
