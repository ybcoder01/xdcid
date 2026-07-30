"use client";

import { useMemo, useState } from "react";
import type { Hash, Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract
} from "wagmi";
import {
  CCTP_TESTNETS,
  prepareCctpBurn,
  prepareCctpReceive,
  type CctpTestnetKey
} from "../../../sdk/src/cctp";

type Phase = "idle" | "approving" | "burning" | "waiting" | "ready" | "minting" | "complete";
type Attestation = { message: Hex; attestation: Hex };

const phaseLabels: Record<Phase, string> = {
  idle: "Ready to start",
  approving: "Confirm the exact USDC approval in your wallet",
  burning: "Confirm the CCTP burn in your wallet",
  waiting: "Waiting for Circle attestation",
  ready: "Attestation ready — mint on the destination network",
  minting: "Confirm the destination mint in your wallet",
  complete: "Transfer complete"
};

export default function BridgePage() {
  const [sourceKey, setSourceKey] = useState<CctpTestnetKey>("arbitrumSepolia");
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [burnHash, setBurnHash] = useState("");
  const [receiveHash, setReceiveHash] = useState<Hash | "">("");
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const destinationKey: CctpTestnetKey =
    sourceKey === "arbitrumSepolia" ? "xdcApothem" : "arbitrumSepolia";
  const source = CCTP_TESTNETS[sourceKey];
  const destination = CCTP_TESTNETS[destinationKey];
  const sourceClient = usePublicClient({ chainId: source.chainId });
  const destinationClient = usePublicClient({ chainId: destination.chainId });

  const working = useMemo(
    () => ["approving", "burning", "waiting", "minting"].includes(phase),
    [phase]
  );

  function changeDirection(nextSource: CctpTestnetKey) {
    setSourceKey(nextSource);
    setBurnHash("");
    setReceiveHash("");
    setAttestation(null);
    setError("");
    setPhase("idle");
  }

  async function startTransfer() {
    setError("");
    setReceiveHash("");
    setAttestation(null);

    if (!isConnected || !address) {
      setError("Connect a wallet before starting the transfer");
      return;
    }
    if (!sourceClient) {
      setError("Source network client is unavailable");
      return;
    }

    try {
      const plan = prepareCctpBurn({
        source: sourceKey,
        destination: destinationKey,
        amount,
        recipient: recipient.trim() || address
      });

      setPhase("approving");
      await switchChainAsync({ chainId: plan.source.chainId });
      const approvalHash = await writeContractAsync(plan.approvalRequest as never);
      await sourceClient.waitForTransactionReceipt({ hash: approvalHash });

      setPhase("burning");
      const nextBurnHash = await writeContractAsync(plan.burnRequest as never);
      setBurnHash(nextBurnHash);
      await sourceClient.waitForTransactionReceipt({ hash: nextBurnHash });

      setPhase("waiting");
      const nextAttestation = await waitForAttestation(sourceKey, nextBurnHash);
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
    if (!/^0x[0-9a-fA-F]{64}$/.test(burnHash)) {
      setError("Enter a valid 32-byte CCTP burn transaction hash");
      return;
    }

    try {
      setPhase("waiting");
      const nextAttestation = await waitForAttestation(sourceKey, burnHash as Hash);
      setAttestation(nextAttestation);
      setPhase("ready");
    } catch (cause) {
      setError(readError(cause));
      setPhase("idle");
    }
  }

  async function mintOnDestination() {
    setError("");
    if (!attestation || !destinationClient) {
      setError("The Circle attestation is not ready");
      return;
    }

    try {
      const request = prepareCctpReceive(
        destinationKey,
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Testnet only — test USDC and test gas have no monetary value.</p>
        <p className="mt-1">Review every wallet prompt. This page never requests or stores a private key.</p>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Circle CCTP V2</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Move test USDC between Arbitrum and XDC</h1>
          <p className="mt-2 text-sm text-neutral-600">
            USDC is burned on the source testnet and minted on the destination testnet after Circle attests the burn.
          </p>

          <div className="mt-8 grid gap-5">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Direction</span>
              <select
                className="rounded-md border border-black/10 bg-white px-4 py-3"
                value={sourceKey}
                onChange={(event) => changeDirection(event.target.value as CctpTestnetKey)}
                disabled={working}
              >
                <option value="arbitrumSepolia">Arbitrum Sepolia → XDC Apothem</option>
                <option value="xdcApothem">XDC Apothem → Arbitrum Sepolia</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Amount</span>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-4 py-3"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="1.00"
                  disabled={working}
                />
                <span className="grid min-w-20 place-items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white">USDC</span>
              </div>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Destination wallet</span>
              <input
                className="rounded-md border border-black/10 bg-white px-4 py-3 font-mono text-sm"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder={address || "0x..."}
                disabled={working}
              />
              <span className="text-xs text-neutral-500">Leave blank to use the connected wallet on both testnets.</span>
            </label>

            <button
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              onClick={startTransfer}
              disabled={!isConnected || working || phase === "ready" || phase === "complete"}
            >
              Approve and burn test USDC
            </button>
          </div>

          <div className="mt-8 rounded-md border border-black/10 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Transfer status</p>
            <p className="mt-2 font-semibold text-slate-950">{phaseLabels[phase]}</p>
            {burnHash ? (
              <p className="mt-3 break-all text-xs text-neutral-600">
                Burn: <a className="text-teal-700 underline" href={source.explorerUrl + "/tx/" + burnHash} target="_blank" rel="noreferrer">{burnHash}</a>
              </p>
            ) : null}
            {receiveHash ? (
              <p className="mt-3 break-all text-xs text-neutral-600">
                Mint: <a className="text-teal-700 underline" href={destination.explorerUrl + "/tx/" + receiveHash} target="_blank" rel="noreferrer">{receiveHash}</a>
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {phase === "ready" ? (
              <button
                className="mt-4 w-full rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
                onClick={mintOnDestination}
              >
                Mint on {destination.name}
              </button>
            ) : null}
          </div>

          <div className="mt-6 rounded-md border border-black/10 bg-white p-4">
            <p className="font-semibold text-slate-950">Resume after a reload</p>
            <p className="mt-1 text-xs text-neutral-500">Select the original source network and paste its public burn transaction hash.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="min-w-0 flex-1 rounded-md border border-black/10 px-3 py-2 font-mono text-xs"
                value={burnHash}
                onChange={(event) => setBurnHash(event.target.value.trim())}
                placeholder="0x burn transaction hash"
                disabled={working}
              />
              <button
                className="rounded-md border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
                onClick={resumeAttestation}
                disabled={working}
              >
                Resume lookup
              </button>
            </div>
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Before testing</p>
          <ol className="mt-5 grid gap-4 text-sm text-slate-200">
            <li><span className="font-semibold text-white">1.</span> Fund {source.name} with native test gas.</li>
            <li><span className="font-semibold text-white">2.</span> Fund {source.name} with Circle test USDC.</li>
            <li><span className="font-semibold text-white">3.</span> Fund {destination.name} with native test gas for the mint transaction.</li>
          </ol>
          <div className="mt-6 grid gap-3 text-sm">
            <a className="rounded-md border border-white/20 px-4 py-3 text-center font-semibold hover:bg-white/10" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Circle USDC faucet</a>
            <a className="rounded-md border border-white/20 px-4 py-3 text-center font-semibold hover:bg-white/10" href="https://faucets.chain.link/arbitrum-sepolia" target="_blank" rel="noreferrer">Arbitrum Sepolia ETH faucet</a>
            <a className="rounded-md border border-white/20 px-4 py-3 text-center font-semibold hover:bg-white/10" href="https://faucet.apothem.network/" target="_blank" rel="noreferrer">XDC Apothem faucet</a>
          </div>
          <p className="mt-6 border-t border-white/10 pt-4 text-xs text-slate-400">
            No transfer history is stored by XDCID. The browser keeps only the current on-screen state.
          </p>
        </aside>
      </section>
    </main>
  );
}

async function waitForAttestation(source: CctpTestnetKey, transactionHash: Hash): Promise<Attestation> {
  const query = new URLSearchParams({ source, transactionHash });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch("/api/cctp/attestation?" + query.toString(), { cache: "no-store" });
    const body = (await response.json()) as {
      status?: string;
      message?: string;
      attestation?: string;
      error?: string;
    };

    if (response.ok && body.status === "complete" && isHexBytes(body.message) && isHexBytes(body.attestation)) {
      return { message: body.message as Hex, attestation: body.attestation as Hex };
    }
    if (response.status !== 202 && response.status < 500) {
      throw new Error(body.error || "Circle rejected the attestation lookup");
    }
    await delay(5_000);
  }
  throw new Error("Circle attestation was not ready within 20 minutes. Resume with the burn hash later.");
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
