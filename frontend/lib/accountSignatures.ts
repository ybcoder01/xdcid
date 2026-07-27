import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { paymentRequestTypedData, type PaymentRequest } from "./paymentRequests";

export const ERC1271_MAGIC_VALUE = "0x1626ba7e" as const;

export const erc1271Abi = [
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [
      { name: "hash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
] as const;

export type PaymentRequestSignatureVerification = {
  valid: boolean;
  accountType: "eoa" | "contract" | "unknown";
  signer: Address;
  error?: string;
};

export async function verifyPaymentRequestSignature(
  client: PublicClient,
  request: PaymentRequest,
  signature: Hex,
  expectedSigner: Address,
): Promise<PaymentRequestSignatureVerification> {
  let accountType: PaymentRequestSignatureVerification["accountType"] = "unknown";

  try {
    const bytecode = await client.getBytecode({ address: expectedSigner });
    accountType = bytecode && bytecode !== "0x" ? "contract" : "eoa";

    if (accountType === "eoa") {
      const recoveredSigner = await recoverTypedDataAddress({
        ...paymentRequestTypedData(request),
        signature,
      });
      const valid = recoveredSigner.toLowerCase() === expectedSigner.toLowerCase();
      return {
        valid,
        accountType,
        signer: expectedSigner,
        error: valid ? undefined : "The signature was not created by the current XNS owner.",
      };
    }

    const digest = hashTypedData(paymentRequestTypedData(request));
    const result = await client.readContract({
      address: expectedSigner,
      abi: erc1271Abi,
      functionName: "isValidSignature",
      args: [digest, signature],
    });
    const valid = result.toLowerCase() === ERC1271_MAGIC_VALUE;
    return {
      valid,
      accountType,
      signer: expectedSigner,
      error: valid ? undefined : "The smart account rejected this signature.",
    };
  } catch {
    return {
      valid: false,
      accountType,
      signer: expectedSigner,
      error: accountType === "contract"
        ? "The smart account signature check failed or reverted."
        : "Payment request signature could not be verified.",
    };
  }
}
