"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Address, Hash, Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract
} from "wagmi";
import {
  CCTP_TOKEN_MESSENGER_V2,
  getPaymentNetwork
} from "../config/paymentNetworks";
import {
  isCctpTransactionHash,
  mainnetUsdcAbi,
  parseMainnetUsdcAmount,
  prepareMainnetCctpBurn,
  prepareMainnetCctpReceive,
  prepareMainnetUsdcTransfer
} from "../lib/cctpMainnet";

type Phase =
  | "idle"
  | "checking"
  | "approving"
  | "transferring"
  | "burning"
  | "waiting"
  | "ready"
  | "minting"
  | "complete";

type Attestation = { message: Hex; attestation: Hex };

type MultichainUsdcExecutorProps = {
  sourceChainId: number;
  destinationChainId: number;
  amount: string;
  recipient: Address;
  ready: boolean;
};

const phaseLabels: Record<Phase, string> = {
  idle: "Ready for wallet review",
  checking: "Checking USDC balance and allowance",
  approving: "Confirm the exact USDC approval in your wallet",
  transferring: "Confirm the USDC transfer in your wallet",
  burning: "Confirm the CCTP burn in your wallet",
  waiting: "Waiting for Circle's Standard Transfer attestation",
  ready: "Attestation ready — mint on the destination network",
  minting: "Confirm the destination mint in your wallet",
  complete: "Transfer complete"
};

const explorerUrls: Record<number, string> = {
  1: "https://etherscan.io",
  50: "https://xdcscan.com",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io"
};

export function MultichainUsdcExecutor({
  sourceChainId,
  destinationChainId,
  amount,
  recipient,
  ready
}: MultichainUsdcExecutorProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [burnHash, setBurnHash] = useState("");
  const [receiveHash, setReceiveHash] = useState<Hash | "">("");
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [error, setError] = useState("");

  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const sourceClient = usePublicClient({ chainId: sourceChainId });
  const destinationClient = usePublicClient({ chainId: destinationChainId });
  const source = getPaymentNetwork(sourceChainId);
  const destination = getPaymentNetwork(destinationChainId);
  const crossChain = sourceChainId !== destinationChainId;
  const working = useMemo(
    () =>
      ["checking", "approving", "transferring", "burning", "waiting", "minting"].includes(
        phase
      ),
    [phase]
  );

  async function startTransfer() {
    setError("");
    setReceiveHash("");
    setAttestation(null);

    if (!ready || !source || !destination) {
      setError("Complete the payment details and XNS resolution first");
      return;
    }
    if (!isConnected || !address) {
      setError("Connect a wallet before starting the transfer");
      return;
    }
    if (!sourceClient) {
      setError("Source network client is unavailable");
      return;
    }

    try {
      const units = parseMainnetUsdcAmount(amount);
      setPhase("checking");

      const balance = await sourceClient.readContract({
        address: source.usdcAddress,
        abi: mainnetUsdcAbi,
        functionName: "balanceOf",
        args: [address]
      });
      if (balance < units) {
        throw new Error("The connected wallet does not have enough USDC on " + source.name);
      }

      await switchChainAsync({ chainId: source.chainId });

      if (!crossChain) {
        const request = prepareMainnetUsdcTransfer({
          chainId: source.chainId,
          amount: units,
          recipient
        });
        setPhase("transferring");
        const transferHash = await writeContractAsync(request as never);
        setReceiveHash(transferHash);
        await sourceClient.waitForTransactionReceipt({ hash: transferHash });
        setPhase("complete");
        return;
      }

      const plan = prepareMainnetCctpBurn({
        sourceChainId,
        destinationChainId,
        amount: units,
        recipient
      });
      const allowance = await sourceClient.readContract({
        address: source.usdcAddress,
        abi: mainnetUsdcAbi,
        functionName: "allowance",
        args: [address, CCTP_TOKEN_MESSENGER_V2]
      });

      if (allowance < units) {
        setPhase("approving");
        const approvalHash = await writeContractAsync(plan.approvalRequest as never);
        await sourceClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      setPhase("burning");
      const nextBurnHash = await writeContractAsync(plan.burnRequest as never);
      setBurnHash(nextBurnHash);
      await sourceClient.waitForTransactionReceipt({ hash: nextBurnHash });

      setPhase("waiting");
      const nextAttestation = await waitForMainnetAttestation(
        sourceChainId,
        nextBurnHash
      );
      setAttestation(nextAttestation);
      setPhase("ready");
    } catch (cause) {
      setError(readError(cause));
      setPhase("idle");
    }
  }

  async function resumeAttestation() {
    setError("");
    setAttestation(null);
    if (!isCctpTransactionHash(burnHash)) {
      setError("Enter a valid 32-byte CCTP burn transaction hash");
      return;
    }

    try {
      setPhase("waiting");
      const nextAttestation = await waitForMainnetAttestation(
        sourceChainId,
        burnHash
      );
      setAttestation(nextAttestation);
      setPhase("ready");
    } catch (cause) {
      setError(readError(cause));
      setPhase("idle");
    }
  }

  async function mintOnDestination() {
    setError("");
    if (!attestation || !destination || !destinationClient) {
      setError("The Circle attestation is not ready");
      return;
    }

    try {
      const request = prepareMainnetCctpReceive(
        destinationChainId,
        attestation.message,
        attestation.attestation
      );
      setPhase("minting");
      await switchChainAsync({ chainId: destination.chainId });
      const nextReceiveHash = await writeContractAsync(request as never);
      setReceiveHash(nextReceiveHash);
      await destinationClient.waitForTransactionReceipt({ hash: nextReceiveHash });
      setPhase("complete");
    } catch (cause) {
      setError(readError(cause));
      setPhase("ready");
    }
  }

  return (
    <section className="mt-5 rounded-md border border-teal-200 bg-teal-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Wallet execution
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">
        {phaseLabels[phase]}
      </p>
      <p className="mt-1 text-xs text-neutral-600">
        {crossChain
          ? "USDC will be burned on " +
            (source?.name || "the source") +
            " and minted to the XNS-resolved address on " +
            (destination?.name || "the destination") +
            "."
          : "USDC will be transferred directly to the XNS-resolved address."}
      </p>

      {phase === "idle" ? (
        <button
          className="mt-4 w-full rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={!ready || !isConnected}
          onClick={startTransfer}
        >
          {isConnected ? "Review and send USDC" : "Connect wallet to continue"}
        </button>
      ) : null}

      {working ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-white p-3 text-xs text-neutral-600">
          Keep this tab open. Each on-chain action requires confirmation in your wallet.
        </div>
      ) : null}

      {phase === "ready" ? (
        <button
          className="mt-4 w-full rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
          onClick={mintOnDestination}
        >
          Mint USDC on {destination?.name || "destination"}
        </button>
      ) : null}

      {burnHash ? (
        <TransactionLink
          label="Burn"
          hash={burnHash}
          explorerUrl={explorerUrls[sourceChainId]}
        />
      ) : null}
      {receiveHash ? (
        <TransactionLink
          label={crossChain ? "Mint" : "Transfer"}
          hash={receiveHash}
          explorerUrl={explorerUrls[destinationChainId]}
        />
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {crossChain && phase !== "complete" ? (
        <div className="mt-5 border-t border-teal-200 pt-4">
          <p className="text-sm font-semibold text-slate-950">
            Resume after closing or reloading
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Select the original source network and paste its public burn transaction hash.
          </p>
          <div className="mt-3 grid gap-2">
            <input
              className="rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-xs"
              value={burnHash}
              onChange={(event) => setBurnHash(event.target.value.trim())}
              placeholder="0x burn transaction hash"
              disabled={working}
            />
            <button
              className="rounded-md border border-teal-700 bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
              onClick={resumeAttestation}
              disabled={working || !burnHash}
            >
              Resume attestation lookup
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TransactionLink({
  label,
  hash,
  explorerUrl
}: {
  label: string;
  hash: string;
  explorerUrl?: string;
}) {
  const content: ReactNode = explorerUrl ? (
    <a
      className="text-teal-700 underline"
      href={explorerUrl + "/tx/" + hash}
      target="_blank"
      rel="noreferrer"
    >
      {hash}
    </a>
  ) : (
    hash
  );

  return (
    <p className="mt-3 break-all text-xs text-neutral-600">
      {label}: {content}
    </p>
  );
}

async function waitForMainnetAttestation(
  sourceChainId: number,
  transactionHash: Hash
): Promise<Attestation> {
  const query = new URLSearchParams({
    sourceChainId: String(sourceChainId),
    transactionHash
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch(
      "/api/cctp/mainnet-attestation?" + query.toString(),
      { cache: "no-store" }
    );
    const body = (await response.json()) as {
      status?: string;
      message?: string;
      attestation?: string;
      error?: string;
    };

    if (
      response.ok &&
      body.status === "complete" &&
      isHexBytes(body.message) &&
      isHexBytes(body.attestation)
    ) {
      return {
        message: body.message as Hex,
        attestation: body.attestation as Hex
      };
    }
    if (response.status !== 202 && response.status < 500) {
      throw new Error(body.error || "Circle rejected the attestation lookup");
    }
    await delay(5_000);
  }

  throw new Error(
    "Circle attestation was not ready within 20 minutes. Resume with the burn hash later."
  );
}

function isHexBytes(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readError(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return "The transfer could not continue";
}
