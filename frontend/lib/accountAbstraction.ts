import type { Address, Hex, PublicClient } from "viem";

export type AccountDeploymentState = "deployed-contract" | "no-code" | "unknown";

export async function inspectAccountDeployment(
  client: Pick<PublicClient, "getBytecode">,
  address: Address,
): Promise<AccountDeploymentState> {
  try {
    const bytecode = await client.getBytecode({ address });
    return bytecode && bytecode !== ("0x" as Hex) ? "deployed-contract" : "no-code";
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
  const hasDifferentSubmitter = Boolean(
    transactionSender && transactionSender.toLowerCase() !== connectedAccount.toLowerCase(),
  );
  return {
    payer: connectedAccount,
    networkSubmitter: hasDifferentSubmitter ? transactionSender : undefined,
  };
}
