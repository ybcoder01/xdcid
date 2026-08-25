"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  formatUnits,
  type Address,
  type Hash,
  type Hex,
  type PublicClient
} from "viem";
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
  calculateCctpProtocolFee,
  calculateXdcidConvenienceFee,
  isCctpTransactionHash,
  mainnetUsdcAbi,
  parseMainnetUsdcAmount,
  prepareMainnetCctpBurn,
  prepareMainnetCctpForwardedBurn,
  prepareMainnetCctpReceive,
  prepareMainnetUsdcTransfer,
  prepareXdcidConvenienceFeeTransfer
} from "../lib/cctpMainnet";
import {
  automaticForwardingMessage,
  getPaymentRouteCapability
} from "../lib/paymentRouteCapabilities";
import {
  estimateAdaptiveGasFees,
  isBaseFeeTooLowError
} from "../lib/gasFeePolicy";

type Phase =
  | "idle"
  | "checking"
  | "approving"
  | "payingFee"
  | "registeringRecovery"
  | "transferring"
  | "burning"
  | "waiting"
  | "ready"
  | "minting"
  | "complete";

type Attestation = { message: Hex; attestation: Hex };
type ForwardingQuote = {
  forwardFee: bigint;
  minimumFeeBps: number;
  quotedAt: number;
};

export type PaymentCompletionMetadata = {
  completionMethod: "standard" | "automatic" | "recovered";
  xdcidFeeAtomic?: string;
  circleFeeAtomic?: string;
};

type MultichainUsdcExecutorProps = {
  sourceChainId: number;
  destinationChainId: number;
  amount: string;
  recipient: Address;
  ready: boolean;
  paymentReference?: string;
  onCompleted?: (
    sourceHash: Hash,
    destinationHash?: Hash,
    metadata?: PaymentCompletionMetadata
  ) => void | Promise<void>;
  requestedTransferMode?: "standard" | "automatic" | "payer-choice";
};

const phaseLabels: Record<Phase, string> = {
  idle: "Ready for wallet review",
  checking: "Checking USDC balance and allowance",
  approving: "Confirm the exact USDC approval in your wallet",
  payingFee: "Confirm the XDCID convenience fee in your wallet",
  registeringRecovery: "Securing the forwarding recovery record",
  transferring: "Confirm the USDC transfer in your wallet",
  burning: "Confirm the CCTP burn in your wallet",
  waiting: "Waiting for Circle to complete the transfer",
  ready: "Attestation ready — mint on the destination network",
  minting: "Confirm the destination mint in your wallet",
  complete: "Transfer complete"
};

export function MultichainUsdcExecutor({
  sourceChainId,
  destinationChainId,
  amount,
  recipient,
  ready,
  paymentReference = "",
  onCompleted,
  requestedTransferMode = "payer-choice"
}: MultichainUsdcExecutorProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const reportedSettlement = useRef("");
  const [burnHash, setBurnHash] = useState("");
  const [receiveHash, setReceiveHash] = useState<Hash | "">("");
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [error, setError] = useState("");
  const [transferMode, setTransferMode] = useState<"standard" | "forwarded">(
    requestedTransferMode === "automatic" ? "forwarded" : "standard"
  );
  const [forwardingQuote, setForwardingQuote] =
    useState<ForwardingQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [feeHash, setFeeHash] = useState<Hash | "">("");
  const [recoveryFeeHash, setRecoveryFeeHash] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");

  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const sourceClient = usePublicClient({ chainId: sourceChainId });
  const destinationClient = usePublicClient({ chainId: destinationChainId });
  const source = getPaymentNetwork(sourceChainId);
  const destination = getPaymentNetwork(destinationChainId);
  const crossChain = sourceChainId !== destinationChainId;

  useEffect(() => {
    if (phase !== "complete" || !onCompleted || !receiveHash) return;
    const sourceHash = crossChain ? burnHash : receiveHash;
    if (!isCctpTransactionHash(sourceHash)) return;
    const key = sourceHash + ":" + receiveHash;
    if (reportedSettlement.current === key) return;
    reportedSettlement.current = key;
    let metadata: PaymentCompletionMetadata = {
      completionMethod: recoveryFeeHash ? "recovered" : "standard"
    };
    if (automaticForwarding && forwardingQuote) {
      const recipientAmount = parseMainnetUsdcAmount(amount);
      metadata = {
        completionMethod: recoveryFeeHash ? "recovered" : "automatic",
        xdcidFeeAtomic: calculateXdcidConvenienceFee(recipientAmount).toString(),
        circleFeeAtomic: (
          forwardingQuote.forwardFee +
          calculateCctpProtocolFee(recipientAmount, forwardingQuote.minimumFeeBps)
        ).toString()
      };
    }
    void onCompleted(
      sourceHash as Hash,
      crossChain ? receiveHash as Hash : undefined,
      metadata
    );
  }, [
    amount,
    automaticForwarding,
    burnHash,
    crossChain,
    forwardingQuote,
    onCompleted,
    phase,
    receiveHash,
    recoveryFeeHash
  ]);
  const routeCapability = getPaymentRouteCapability(
    sourceChainId,
    destinationChainId,
    process.env.NEXT_PUBLIC_XDCID_PREVIEW_FORWARDING_ROUTES
  );
  const forwardingAvailable =
    routeCapability.automaticForwarding === "mainnet-enabled" ||
    routeCapability.automaticForwarding === "mainnet-preview" ||
    routeCapability.automaticForwarding === "testnet-enabled";
  const automaticForwarding =
    forwardingAvailable && transferMode === "forwarded";
  const transferModeLocked = requestedTransferMode !== "payer-choice";

  async function writeWithAdaptiveFees(
    request: Record<string, unknown>,
    client: PublicClient,
    chainId: number
  ): Promise<Hash> {
    const initialFees = await estimateAdaptiveGasFees(client, chainId);
    try {
      return await writeContractAsync({ ...request, ...initialFees } as never);
    } catch (cause) {
      if (!isBaseFeeTooLowError(cause)) throw cause;
      const refreshedFees = await estimateAdaptiveGasFees(client, chainId);
      if (refreshedFees.maxFeePerGas === undefined) throw cause;
      return writeContractAsync({ ...request, ...refreshedFees } as never);
    }
  }

  useEffect(() => {
    setTransferMode(
      requestedTransferMode === "automatic" ? "forwarded" : "standard"
    );
  }, [requestedTransferMode, sourceChainId, destinationChainId]);

  useEffect(() => {
    setRecoveryReady(false);
    setRecoveryMessage("");
    setRecoveryStatus("idle");
    setFeeHash("");
  }, [amount, sourceChainId, destinationChainId, recipient]);

  useEffect(() => {
    let cancelled = false;
    setForwardingQuote(null);
    setQuoteStatus("idle");
    if (!automaticForwarding) return () => { cancelled = true; };

    try {
      parseMainnetUsdcAmount(amount);
    } catch {
      return () => { cancelled = true; };
    }

    setQuoteStatus("loading");
    void fetchForwardingQuote(sourceChainId, destinationChainId)
      .then((quote) => {
        if (cancelled) return;
        setForwardingQuote(quote);
        setQuoteStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setQuoteStatus("error");
      });
    return () => { cancelled = true; };
  }, [automaticForwarding, amount, sourceChainId, destinationChainId]);

  const working = useMemo(
    () =>
      [
        "checking",
        "approving",
        "payingFee",
        "registeringRecovery",
        "transferring",
        "burning",
        "waiting",
        "minting"
      ].includes(
        phase
      ),
    [phase]
  );

  async function startTransfer() {
    setError("");
    setReceiveHash("");
    if (!recoveryReady) setFeeHash("");
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
      if (automaticForwarding && !forwardingQuote) {
        throw new Error("Wait for the live Circle forwarding quote");
      }
      if (automaticForwarding && !recoveryReady) {
        await ensureForwardingRecoveryAvailable(sourceChainId);
      }
      if (
        automaticForwarding &&
        forwardingQuote &&
        Date.now() - forwardingQuote.quotedAt > 300_000
      ) {
        throw new Error("The forwarding quote expired. Re-select automatic forwarding to refresh it.");
      }
      const forwardedPlan =
        automaticForwarding && forwardingQuote
          ? prepareMainnetCctpForwardedBurn({
              sourceChainId,
              destinationChainId,
              amount: units,
              recipient,
              forwardFee: forwardingQuote.forwardFee,
              minimumFeeBps: forwardingQuote.minimumFeeBps
            })
          : null;
      const convenienceFee = forwardedPlan
        ? calculateXdcidConvenienceFee(units)
        : 0n;
      const requiredBalance = forwardedPlan
        ? forwardedPlan.totalBurnAmount +
          (recoveryReady ? 0n : convenienceFee)
        : units;
      setPhase("checking");

      const balance = await sourceClient.readContract({
        address: source.usdcAddress,
        abi: mainnetUsdcAbi,
        functionName: "balanceOf",
        args: [address]
      });
      if (balance < requiredBalance) {
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
        const transferHash = await writeWithAdaptiveFees(
          request,
          sourceClient,
          source.chainId
        );
        setReceiveHash(transferHash);
        await sourceClient.waitForTransactionReceipt({ hash: transferHash });
        setPhase("complete");
        return;
      }

      const plan =
        forwardedPlan ||
        prepareMainnetCctpBurn({
          sourceChainId,
          destinationChainId,
          amount: units,
          recipient
        });
      const approvalAmount = forwardedPlan
        ? forwardedPlan.totalBurnAmount
        : units;
      const allowance = await sourceClient.readContract({
        address: source.usdcAddress,
        abi: mainnetUsdcAbi,
        functionName: "allowance",
        args: [address, CCTP_TOKEN_MESSENGER_V2]
      });

      if (allowance < approvalAmount) {
        setPhase("approving");
        const approvalHash = await writeWithAdaptiveFees(
          plan.approvalRequest,
          sourceClient,
          source.chainId
        );
        await sourceClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      if (forwardedPlan) {
        let activeFeeHash = feeHash;
        if (!recoveryReady) {
          setPhase("payingFee");
          const feeRequest = prepareXdcidConvenienceFeeTransfer(
            sourceChainId,
            units
          );
          const nextFeeHash = await writeWithAdaptiveFees(
            feeRequest,
            sourceClient,
            source.chainId
          );
          setFeeHash(nextFeeHash);
          setRecoveryFeeHash(nextFeeHash);
          await sourceClient.waitForTransactionReceipt({ hash: nextFeeHash });

          setPhase("registeringRecovery");
          await registerForwardingRecovery({
            feeTransactionHash: nextFeeHash,
            sourceChainId,
            recipientAmount: units,
            recipient,
            destinationChainId
          });
          setRecoveryReady(true);
          setRecoveryStatus("ready");
          activeFeeHash = nextFeeHash;
        }
        if (!activeFeeHash) {
          throw new Error("Verify the paid fee transaction before retrying");
        }

        setPhase("burning");
        const nextBurnHash = await writeWithAdaptiveFees(
          forwardedPlan.burnRequest,
          sourceClient,
          source.chainId
        );
        setBurnHash(nextBurnHash);
        await sourceClient.waitForTransactionReceipt({ hash: nextBurnHash });

        setPhase("registeringRecovery");
        try {
          await consumeForwardingRecovery({
            feeTransactionHash: activeFeeHash,
            burnTransactionHash: nextBurnHash,
            sourceChainId,
            recipientAmount: units,
            recipient,
            destinationChainId
          });
          setRecoveryReady(false);
          setRecoveryStatus("ready");
          setRecoveryMessage(
            "Burn hash saved. It can be restored later using the XDCID fee hash."
          );
        } catch {
          setError(
            "The burn succeeded, but recovery cleanup is pending. Do not reuse the fee transaction hash."
          );
        }

        setPhase("waiting");
        const forwardedMintHash = await waitForForwardedMint(
          sourceChainId,
          nextBurnHash
        );
        setReceiveHash(forwardedMintHash);
        setPhase("complete");
        return;
      }

      setPhase("burning");
      const nextBurnHash = await writeWithAdaptiveFees(
        plan.burnRequest,
        sourceClient,
        source.chainId
      );
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
      if (automaticForwarding) {
        const forwardedMintHash = await waitForForwardedMint(
          sourceChainId,
          burnHash
        );
        setReceiveHash(forwardedMintHash);
        setPhase("complete");
        return;
      }
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

  async function recoverPaidForwardingFee() {
    setError("");
    setRecoveryMessage("");
    setRecoveryStatus("checking");
    if (!isConnected || !address) {
      setRecoveryStatus("error");
      setError("Connect the wallet that paid the XDCID fee");
      return;
    }
    if (!isCctpTransactionHash(recoveryFeeHash)) {
      setRecoveryStatus("error");
      setError("Enter a valid 32-byte XDCID fee transaction hash");
      return;
    }

    try {
      const recipientAmount = parseMainnetUsdcAmount(amount);
      const response = await registerForwardingRecovery({
        feeTransactionHash: recoveryFeeHash,
        sourceChainId,
        recipientAmount,
        recipient,
        destinationChainId
      });
      if (
        !response.record?.payer ||
        response.record.payer.toLowerCase() !== address.toLowerCase()
      ) {
        throw new Error("Connect the wallet that submitted the fee transaction");
      }
      if (response.status === "used") {
        const restoredBurnHash = response.burnTransactionHash;
        if (
          typeof restoredBurnHash !== "string" ||
          !isCctpTransactionHash(restoredBurnHash)
        ) {
          throw new Error(
            "The fee was used, but its burn hash could not be restored"
          );
        }
        setFeeHash(recoveryFeeHash);
        setBurnHash(restoredBurnHash);
        setRecoveryReady(false);
        setRecoveryStatus("ready");
        setRecoveryMessage(
          "Burn hash restored from the fee record. Continue with attestation lookup."
        );
        return;
      }
      setFeeHash(recoveryFeeHash);
      setRecoveryReady(true);
      setRecoveryStatus("ready");
      setRecoveryMessage(
        "Fee verified. The retry will not charge it again."
      );
    } catch (cause) {
      setRecoveryReady(false);
      setRecoveryStatus("error");
      setError(readError(cause));
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
      const nextReceiveHash = await writeWithAdaptiveFees(
        request,
        destinationClient,
        destination.chainId
      );
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

      {crossChain ? (
        <p className="mt-3 rounded-md border border-black/10 bg-white p-3 text-xs text-neutral-600">
          {automaticForwardingMessage(routeCapability.automaticForwarding)}
        </p>
      ) : null}

      {forwardingAvailable && !transferModeLocked ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={
              "rounded-md border p-3 text-left text-sm " +
              (transferMode === "standard"
                ? "border-teal-700 bg-white text-slate-950"
                : "border-black/10 bg-white/60 text-neutral-600")
            }
            onClick={() => setTransferMode("standard")}
            disabled={working}
          >
            <span className="block font-semibold">Standard transfer</span>
            <span className="mt-1 block text-xs">
              No XDCID fee. You switch networks and submit the destination mint.
            </span>
          </button>
          <button
            type="button"
            className={
              "rounded-md border p-3 text-left text-sm " +
              (transferMode === "forwarded"
                ? "border-teal-700 bg-white text-slate-950"
                : "border-black/10 bg-white/60 text-neutral-600")
            }
            onClick={() => setTransferMode("forwarded")}
            disabled={working}
          >
            <span className="block font-semibold">Automatic forwarding</span>
            <span className="mt-1 block text-xs">
              Circle submits the destination mint; no destination gas is needed.
            </span>
          </button>
        </div>
      ) : transferModeLocked && crossChain ? (
        <p className="mt-3 text-xs font-semibold text-slate-700">
          Request mode: {automaticForwarding ? "Automatic forwarding" : "Standard transfer"}
        </p>
      ) : null}

      {automaticForwarding ? (
        <ForwardingCostBreakdown
          amount={amount}
          quote={forwardingQuote}
          status={quoteStatus}
        />
      ) : null}

      {automaticForwarding ? (
        <div className="mt-3 rounded-md border border-teal-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-950">
            Fee paid but the burn did not complete?
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Verify the public XDCID fee transaction and retry without paying
            the convenience fee again. Recovery records expire after 30 days.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className="rounded-md border border-black/10 bg-white px-3 py-2 font-mono text-xs"
              value={recoveryFeeHash}
              onChange={(event) => {
                setRecoveryFeeHash(event.target.value.trim());
                setRecoveryReady(false);
                setRecoveryMessage("");
                setRecoveryStatus("idle");
              }}
              placeholder="0x XDCID fee transaction hash"
              disabled={working}
            />
            <button
              className="rounded-md border border-teal-700 px-4 py-2 text-xs font-semibold text-teal-800 disabled:opacity-50"
              onClick={recoverPaidForwardingFee}
              disabled={working || recoveryStatus === "checking"}
            >
              {recoveryStatus === "checking" ? "Verifying..." : "Verify paid fee"}
            </button>
          </div>
          {recoveryStatus === "ready" && recoveryMessage ? (
            <p className="mt-2 text-xs font-semibold text-teal-700">
              {recoveryMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "idle" ? (
        <button
          className="mt-4 w-full rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          disabled={
            !ready ||
            !isConnected ||
            (automaticForwarding && quoteStatus !== "ready")
          }
          onClick={startTransfer}
        >
          {isConnected
            ? automaticForwarding
              ? recoveryReady
                ? "Resume automatic forwarding"
                : "Pay fee and forward USDC"
              : "Review and send USDC"
            : "Connect wallet to continue"}
        </button>
      ) : null}

      {working ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-white p-3 text-xs text-neutral-600">
          {automaticForwarding
            ? "Keep this tab open. The XDCID fee and Circle burn use separate wallet confirmations."
            : "Keep this tab open. Each on-chain action requires confirmation in your wallet."}
        </div>
      ) : null}

      {phase === "ready" && !automaticForwarding ? (
        <button
          className="mt-4 w-full rounded-md bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
          onClick={mintOnDestination}
        >
          Mint USDC on {destination?.name || "destination"}
        </button>
      ) : null}

      {feeHash ? (
        <TransactionLink
          label="XDCID fee"
          hash={feeHash}
          explorerUrl={source?.explorerUrl}
        />
      ) : null}
      {burnHash ? (
        <TransactionLink
          label="Burn"
          hash={burnHash}
          explorerUrl={source?.explorerUrl}
        />
      ) : null}
      {receiveHash ? (
        <TransactionLink
          label={crossChain ? "Mint" : "Transfer"}
          hash={receiveHash}
          explorerUrl={destination?.explorerUrl}
        />
      ) : null}

      {phase === "complete" && paymentReference ? (
        <p className="mt-3 rounded-md border border-teal-200 bg-white p-3 text-xs text-neutral-700">
          Private reference: <strong>{paymentReference}</strong>
        </p>
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

type RecoveryApiResponse = {
  status?: "available" | "used";
  record?: { payer?: string };
  burnTransactionHash?: string | null;
  error?: string;
};

async function ensureForwardingRecoveryAvailable(
  sourceChainId: number
): Promise<void> {
  const query = new URLSearchParams({
    sourceChainId: String(sourceChainId)
  });
  const response = await fetch(
    "/api/cctp/forwarding-recovery?" + query.toString(),
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error(
      "Automatic forwarding recovery is unavailable. Select Standard transfer or try again."
    );
  }
}

async function registerForwardingRecovery(input: {
  feeTransactionHash: string;
  sourceChainId: number;
  recipientAmount: bigint;
  recipient: Address;
  destinationChainId: number;
}): Promise<RecoveryApiResponse> {
  const response = await fetch("/api/cctp/forwarding-recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "register",
      feeTransactionHash: input.feeTransactionHash,
      sourceChainId: input.sourceChainId,
      recipientAmount: input.recipientAmount.toString(),
      recipient: input.recipient,
      destinationChainId: input.destinationChainId
    })
  });
  const body = (await response.json()) as RecoveryApiResponse;
  if (!response.ok) {
    throw new Error(body.error || "Could not verify the forwarding fee");
  }
  return body;
}

async function consumeForwardingRecovery(input: {
  feeTransactionHash: string;
  burnTransactionHash: string;
  sourceChainId: number;
  recipientAmount: bigint;
  recipient: Address;
  destinationChainId: number;
}): Promise<void> {
  const response = await fetch("/api/cctp/forwarding-recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "consume",
      feeTransactionHash: input.feeTransactionHash,
      burnTransactionHash: input.burnTransactionHash,
      sourceChainId: input.sourceChainId,
      recipientAmount: input.recipientAmount.toString(),
      recipient: input.recipient,
      destinationChainId: input.destinationChainId
    })
  });
  if (!response.ok) {
    const body = (await response.json()) as RecoveryApiResponse;
    throw new Error(body.error || "Could not close the recovery record");
  }
}

async function fetchForwardingQuote(
  sourceChainId: number,
  destinationChainId: number
): Promise<ForwardingQuote> {
  const query = new URLSearchParams({
    sourceChainId: String(sourceChainId),
    destinationChainId: String(destinationChainId)
  });
  const response = await fetch(
    "/api/cctp/mainnet-forwarding-fee?" + query.toString(),
    { cache: "no-store" }
  );
  const body = (await response.json()) as {
    forwardFee?: string;
    minimumFeeBps?: number;
    error?: string;
  };
  if (
    !response.ok ||
    typeof body.forwardFee !== "string" ||
    !/^\d+$/.test(body.forwardFee) ||
    typeof body.minimumFeeBps !== "number"
  ) {
    throw new Error(body.error || "Circle forwarding quote is unavailable");
  }
  return {
    forwardFee: BigInt(body.forwardFee),
    minimumFeeBps: body.minimumFeeBps,
    quotedAt: Date.now()
  };
}

async function waitForForwardedMint(
  sourceChainId: number,
  transactionHash: Hash
): Promise<Hash> {
  const query = new URLSearchParams({
    sourceChainId: String(sourceChainId),
    transactionHash,
    forwarded: "true"
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch(
      "/api/cctp/mainnet-attestation?" + query.toString(),
      { cache: "no-store" }
    );
    const body = (await response.json()) as {
      status?: string;
      forwardTxHash?: string;
      error?: string;
    };
    if (
      response.ok &&
      body.status === "complete" &&
      typeof body.forwardTxHash === "string" &&
      isCctpTransactionHash(body.forwardTxHash)
    ) {
      return body.forwardTxHash;
    }
    if (response.status !== 202 && response.status < 500) {
      throw new Error(body.error || "Circle rejected the forwarding lookup");
    }
    await delay(5_000);
  }
  throw new Error(
    "Circle has not completed the forwarded mint yet. Resume with the burn hash later."
  );
}

function ForwardingCostBreakdown({
  amount,
  quote,
  status
}: {
  amount: string;
  quote: ForwardingQuote | null;
  status: "idle" | "loading" | "ready" | "error";
}) {
  if (status === "loading") {
    return <p className="mt-3 text-xs text-neutral-600">Loading Circle's live forwarding quote...</p>;
  }
  if (status === "error") {
    return <p className="mt-3 text-xs text-red-700">Circle's forwarding quote is unavailable. Select Standard transfer or try again.</p>;
  }
  if (!quote) return null;

  try {
    const recipientAmount = parseMainnetUsdcAmount(amount);
    const protocolFee = calculateCctpProtocolFee(
      recipientAmount,
      quote.minimumFeeBps
    );
    const circleFee = quote.forwardFee + protocolFee;
    const xdcidFee = calculateXdcidConvenienceFee(recipientAmount);
    const total = recipientAmount + circleFee + xdcidFee;
    return (
      <div className="mt-3 rounded-md border border-teal-200 bg-white p-3 text-xs">
        <div className="flex justify-between gap-3"><span>Recipient receives</span><strong>{formatUsdc(recipientAmount)} USDC</strong></div>
        <div className="mt-1 flex justify-between gap-3"><span>Circle forwarding</span><span>{formatUsdc(circleFee)} USDC</span></div>
        <div className="mt-1 flex justify-between gap-3"><span>XDCID convenience fee</span><span>{formatUsdc(xdcidFee)} USDC</span></div>
        <div className="mt-2 flex justify-between gap-3 border-t border-black/10 pt-2"><strong>Total USDC deducted</strong><strong>{formatUsdc(total)} USDC</strong></div>
        <p className="mt-2 text-neutral-500">The Circle quote is live and can change before confirmation. The XDCID fee is 0.10%, with a 0.10 USDC minimum and 5 USDC maximum.</p>
      </div>
    );
  } catch {
    return null;
  }
}

function formatUsdc(value: bigint): string {
  const formatted = formatUnits(value, 6);
  return formatted.includes(".")
    ? formatted.replace(/0+$/, "").replace(/\.$/, "")
    : formatted;
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
