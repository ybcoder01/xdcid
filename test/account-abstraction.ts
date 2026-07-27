import { expect } from "chai";
import type { Address, Hex, PublicClient } from "viem";
import {
  detectConnectedAccountType,
  paymentReceiptActors,
} from "../frontend/lib/accountAbstraction";

const payer = "0x00000000000000000000000000000000000000aa" as Address;
const bundler = "0x00000000000000000000000000000000000000bb" as Address;

function clientWithBytecode(bytecode?: Hex, shouldFail = false): Pick<PublicClient, "getBytecode"> {
  return {
    getBytecode: async () => {
      if (shouldFail) throw new Error("RPC unavailable");
      return bytecode;
    },
  } as unknown as Pick<PublicClient, "getBytecode">;
}

describe("Account abstraction payment compatibility", function () {
  it("identifies an ordinary connected account", async function () {
    expect(await detectConnectedAccountType(clientWithBytecode(undefined), payer)).to.equal("eoa");
  });

  it("identifies a deployed smart account", async function () {
    expect(await detectConnectedAccountType(clientWithBytecode("0x60016000"), payer)).to.equal("smart-account");
  });

  it("does not guess the account type when RPC detection fails", async function () {
    expect(await detectConnectedAccountType(clientWithBytecode(undefined, true), payer)).to.equal("unknown");
  });

  it("keeps the connected smart account as payer when a bundler submits the outer transaction", function () {
    expect(paymentReceiptActors(payer, bundler)).to.deep.equal({ payer, networkSubmitter: bundler });
  });

  it("omits a duplicate submitter for an ordinary direct transaction", function () {
    expect(paymentReceiptActors(payer, payer)).to.deep.equal({ payer, networkSubmitter: undefined });
  });
});
