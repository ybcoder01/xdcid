import { decodeFunctionData, parseAbiItem, type Hex } from "viem";
import { unifiedRegistrarAbi } from "../config/contracts";
import { parseXnsName } from "./names";

export const unifiedRegistrationPaidEvent = parseAbiItem(
  "event RegistrationPaid(bytes32 indexed node,address indexed payer,address indexed nameOwner,uint8 product,uint256 expiry,address paymentToken,uint256 paymentAmount,uint256 grossUsdMicros,uint256 netUsdMicros,uint16 discountBps,bytes32 quoteHash)",
);

export type UnifiedRegisteredName = {
  name: string;
  kind: "top-level" | "subdomain";
};

/**
 * RegistrationPaid deliberately contains only the canonical node hash. Recover
 * the human-readable name from the registrar transaction that emitted it.
 */
export function decodeUnifiedRegisteredName(
  input: Hex,
): UnifiedRegisteredName | null {
  try {
    const decoded = decodeFunctionData({
      abi: unifiedRegistrarAbi,
      data: input,
    }) as { functionName: string; args: readonly unknown[] };

    if (
      decoded.functionName === "register" ||
      decoded.functionName === "renew" ||
      decoded.functionName === "registerWithDiscount" ||
      decoded.functionName === "renewWithDiscount"
    ) {
      const parsed = parseXnsName(String(decoded.args[0]));
      return parsed.isValid
        ? { name: parsed.name, kind: "top-level" }
        : null;
    }

    if (
      decoded.functionName === "registerSubdomain" ||
      decoded.functionName === "renewSubdomain" ||
      decoded.functionName === "registerSubdomainWithDiscount" ||
      decoded.functionName === "renewSubdomainWithDiscount"
    ) {
      const parent = parseXnsName(String(decoded.args[0]));
      const label = String(decoded.args[1]).trim().toLowerCase();
      if (
        !parent.isValid ||
        !/^[a-z0-9-]+$/.test(label) ||
        label.startsWith("-") ||
        label.endsWith("-")
      ) {
        return null;
      }
      return {
        name: `${label}.${parent.name}`,
        kind: "subdomain",
      };
    }
  } catch {
    // A payment log may belong to a future registrar function. Unknown inputs
    // are ignored until their canonical name can be decoded safely.
  }

  return null;
}
