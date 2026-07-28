import { expect } from "chai";
import type { Address, Hex, PublicClient } from "viem";
import {
  inspectAccountDeployment,
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
  it("recognizes deployed contract code without claiming how the account executes", async function () {
    expect(await inspectAccountDeployment(clientWithBytecode("0x60016000"), payer)).to.equal("deployed-contract");
  });

  it("does not mistake no code for proof of an ordinary wallet", async function () {
    expect(await inspectAccountDeployment(clientWithBytecode(undefined), payer)).to.equal("no-code");
  });

  it("returns unknown when the RPC inspection fails", async function () {
    expect(await inspectAccountDeployment(clientWithBytecode(undefined, true), payer)).to.equal("unknown");
  });

  it("keeps the connected account as payer when a bundler submits the outer transaction", function () {
    expect(paymentReceiptActors(payer, bundler)).to.deep.equal({ payer, networkSubmitter: bundler });
  });

  it("omits a duplicate submitter for a direct transaction", function () {
    expect(paymentReceiptActors(payer, payer)).to.deep.equal({ payer, networkSubmitter: undefined });
  });
});
