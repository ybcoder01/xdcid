import type { Address, Hex, PublicClient } from "viem";

export type ConnectedAccountType = "eoa" | "smart-account" | "unknown";

export async function detectConnectedAccountType(
  client: Pick<PublicClient, "getBytecode">,
  address: Address,
): Promise<ConnectedAccountType> {
  try {
    const bytecode = await client.getBytecode({ address });
    return bytecode && bytecode !== ("0x" as Hex) ? "smart-account" : "eoa";
  } catch {
    return "unknown";
  }
}

export type PaymentReceiptActors = {
  payer?: Address;
  networkSubmitter?: Address;
};

export function paymentReceiptActors(
  connectedAccount?: Address,
  transactionSender?: Address,
): PaymentReceiptActors {
  if (!connectedAccount) return { networkSubmitter: transactionSender };
  const differentSubmitter = transactionSender &&
    transactionSender.toLowerCase() !== connectedAccount.toLowerCase();
  return {
    payer: connectedAccount,
    networkSubmitter: differentSubmitter ? transactionSender : undefined,
  };
}
