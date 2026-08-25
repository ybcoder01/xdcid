"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, isAddress, keccak256, parseEther, parseUnits, stringToHex, zeroAddress, type Hash } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt
} from "wagmi";
import { MultichainUsdcExecutor } from "../../components/MultichainUsdcExecutor";
import {
  activeRegistryAddress,
  activeResolverSuiteAvailable,
  addresses,
  multichainResolverAbi,
  registryAbi,
  resolverAbi
} from "../../config/contracts";
import {
  getPaymentNetwork,
  PAYMENT_NETWORK_ENV,
  PAYMENT_NETWORKS,
  USDC_DECIMALS
} from "../../config/paymentNetworks";
import { parseXnsName } from "../../lib/names";
import { selectPaymentDestination } from "../../lib/paymentPreparation";
import {
  installPaymentCompletionRetry,
  submitPaymentCompletion
} from "../../lib/paymentCompletionQueue";
import {
  planPaymentRoute,
  swapPaymentNetworks,
  type PaymentRoute,
  type PaymentToken
} from "../../lib/paymentRouting";
import { useRegistryStatus } from "../../lib/useRegistryStatus";
import {
  estimateAdaptiveGasFees,
  isBaseFeeTooLowError
} from "../../lib/gasFeePolicy";

const XDC_CHAIN_ID = PAYMENT_NETWORK_ENV === "testnet" ? 51 : 50;
const DEFAULT_SOURCE_CHAIN_ID =
  PAYMENT_NETWORKS.find((network) =>
    network.key === (PAYMENT_NETWORK_ENV === "testnet" ? "base-sepolia" : "base")
  )?.chainId || PAYMENT_NETWORKS[0].chainId;

function paymentUnits(amount: string, token: PaymentToken): bigint {
  try {
    return amount
      ? parseUnits(amount, token === "USDC" ? USDC_DECIMALS : 18)
      : 0n;
  } catch {
    return 0n;
  }
}

function routeLabel(route: PaymentRoute): string {
  return route.kind === "direct" ? "Direct transfer" : "CCTP Standard transfer";
}

export default function SendPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sourceChainId, setSourceChainId] = useState(DEFAULT_SOURCE_CHAIN_ID);
  const [destinationChainId, setDestinationChainId] = useState(XDC_CHAIN_ID);
  const [token, setToken] = useState<PaymentToken>("USDC");
  const [paymentReference, setPaymentReference] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const recordingHashes = useRef(new Set<string>());

  useEffect(() => installPaymentCompletionRetry(), []);
  const { chainId: connectedChainId, isConnected } = useAccount();
  const {
    sendTransactionAsync,
    isPending,
    data: hash,
    error,
    reset: resetNativeTransaction
  } = useSendTransaction();
  const sourceClient = usePublicClient({ chainId: sourceChainId });
  const nativeReceipt = useWaitForTransactionReceipt({
    chainId: sourceChainId,
    hash
  });

  useEffect(() => {
    resetNativeTransaction();
  }, [
    amount,
    destinationChainId,
    recipient,
    paymentReference,
    resetNativeTransaction,
    sourceChainId,
    token
  ]);

  const directRecipient = useMemo(() => {
    const value = recipient.trim();
    return isAddress(value) ? getAddress(value) : null;
  }, [recipient]);
  const parsedName = useMemo(
    () => parseXnsName(directRecipient ? "" : recipient),
    [directRecipient, recipient]
  );
  const { label, name, isValid, error: validationError } = parsedName;
  const enabled = !directRecipient && isValid;
  const units = useMemo(() => paymentUnits(amount, token), [amount, token]);
  const sourceNetwork = getPaymentNetwork(sourceChainId);

  const routeState = useMemo(() => {
    try {
      return {
        route: planPaymentRoute({ sourceChainId, destinationChainId, token }),
        error: ""
      };
    } catch (routeError) {
      return {
        route: null,
        error:
          routeError instanceof Error
            ? routeError.message
            : "This payment route is not supported."
      };
    }
  }, [sourceChainId, destinationChainId, token]);

  const node = useMemo(
    () => (enabled ? keccak256(stringToHex(name)) : undefined),
    [enabled, name]
  );

  const owner = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node }
  });

  const xdcidRegistered =
    owner.data === undefined ? undefined : owner.data !== zeroAddress;
  const registry = useRegistryStatus(name, xdcidRegistered, !!node, XDC_CHAIN_ID);

  const expiry = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node }
  });

  const xdcDefaultAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node ? [node] : undefined,
    query: { enabled: !!node && activeResolverSuiteAvailable }
  });

  const multichainAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.multichainResolver,
    abi: multichainResolverAbi,
    functionName: "addressFor",
    args: node ? [node, BigInt(destinationChainId)] : undefined,
    query: { enabled: !!node && activeResolverSuiteAvailable }
  });

  const expired = expiry.data
    ? expiry.data < BigInt(Math.floor(Date.now() / 1000))
    : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !expired;
  const registrySafe = registry.status?.state === "xdcid";

  const destination = useMemo(
    () =>
      directRecipient
        ? { address: directRecipient, source: "direct-wallet" as const }
        : selectPaymentDestination({
            destinationChainId,
            multichainAddress:
              typeof multichainAddress.data === "string"
                ? multichainAddress.data
                : undefined,
            defaultEvmAddress:
              activeResolverSuiteAvailable && typeof xdcDefaultAddress.data === "string"
                ? xdcDefaultAddress.data
                : typeof owner.data === "string"
                  ? owner.data
                  : undefined
          }),
    [
      destinationChainId,
      directRecipient,
      multichainAddress.data,
      xdcDefaultAddress.data,
      owner.data
    ]
  );

  const readsLoading =
    owner.isLoading ||
    expiry.isLoading ||
    xdcDefaultAddress.isLoading ||
    multichainAddress.isLoading ||
    registry.isChecking;
  const readsFailed =
    owner.isError ||
    expiry.isError ||
    xdcDefaultAddress.isError ||
    multichainAddress.isError ||
    registry.isError;

  const recipientReady = directRecipient
    ? true
    : isValid && registrySafe && hasOwner && !readsLoading && !readsFailed;
  const routeReady =
    recipientReady &&
    !!destination &&
    !!routeState.route &&
    units > 0n;

  const canSendNative =
    routeReady &&
    isConnected &&
    connectedChainId === sourceChainId &&
    token === "NATIVE" &&
    sourceChainId === destinationChainId &&
    !isPending;

  const recordSettlement = useCallback(async (
    sourceTransactionHash: Hash,
    destinationTransactionHash?: Hash
  ) => {
    if (!destination || units <= 0n) return;
    const key = sourceTransactionHash + ":" + (destinationTransactionHash || "");
    if (recordingHashes.current.has(key)) return;
    recordingHashes.current.add(key);
    setHistoryStatus("Verifying payment for private history...");
    try {
      await submitPaymentCompletion({
          name: directRecipient || name,
          sourceChainId,
          destinationChainId,
          token,
          amountAtomic: units.toString(),
          recipient: destination.address,
          sourceTransactionHash,
          destinationTransactionHash,
          reference: paymentReference.trim()
      });
      setHistoryStatus("Payment added to private history.");
    } catch (cause) {
      recordingHashes.current.delete(key);
      setHistoryStatus(
        cause instanceof Error
          ? "Payment succeeded, but private history needs retry: " + cause.message
          : "Payment succeeded, but private history could not be recorded."
      );
    }
  }, [destination, destinationChainId, directRecipient, name, paymentReference, sourceChainId, token, units]);

  useEffect(() => {
    if (nativeReceipt.isSuccess && hash) void recordSettlement(hash);
  }, [hash, nativeReceipt.isSuccess, recordSettlement]);

  async function sendNative() {
    if (!canSendNative || !destination || !sourceClient) return;
    const request = {
      to: destination.address,
      value: parseEther(amount)
    };
    const initialFees = await estimateAdaptiveGasFees(
      sourceClient,
      sourceChainId
    );
    try {
      await sendTransactionAsync({ ...request, ...initialFees });
    } catch (cause) {
      if (!isBaseFeeTooLowError(cause)) return;
      const refreshedFees = await estimateAdaptiveGasFees(
        sourceClient,
        sourceChainId
      );
      if (refreshedFees.maxFeePerGas === undefined) return;
      await sendTransactionAsync({ ...request, ...refreshedFees });
    }
  }

  function swapNetworks() {
    const swapped = swapPaymentNetworks({
      sourceChainId,
      destinationChainId
    });
    setSourceChainId(swapped.sourceChainId);
    setDestinationChainId(swapped.destinationChainId);
  }

  const resolutionMessage = directRecipient
    ? "Direct wallet address. XNS resolution is not required."
    : !isValid
      ? validationError
      : readsLoading
        ? "Resolving the name and destination-chain address..."
        : readsFailed
          ? "Could not verify the name or destination address"
          : registry.status?.state === "legacy"
            ? "Payment blocked: this name requires migration from XDCDomains"
            : registry.status?.state === "collision"
              ? "Payment blocked: this name exists in both registries and requires review"
              : !hasOwner
                ? "Name is unregistered or expired"
                : !destination
                  ? "No receiving address is configured for the destination network"
                  : routeState.error || destination.address;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              XDCID multichain payments
            </p>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
              {PAYMENT_NETWORK_ENV}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">
            Send to an XNS ID or wallet
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Resolve an XNS ID or pay a verified EVM wallet address directly.
          </p>

          <div className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Recipient</span>
              <div className="flex gap-2 rounded-md border border-black/10 bg-slate-950 p-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white px-4 py-4 text-lg"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="name.xdc or 0x wallet address"
                  aria-invalid={recipient.trim().length > 0 && !directRecipient && !isValid}
                />
                <span className="grid min-w-20 place-items-center rounded-md bg-teal-500 px-4 py-4 text-sm font-semibold text-slate-950">
                  {directRecipient ? "Wallet" : ".XDC"}
                </span>
              </div>
              {recipient.trim().length > 0 && !directRecipient && !isValid ? (
                <span className="text-red-600">{validationError}</span>
              ) : null}
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-950">From network</span>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3"
                  value={sourceChainId}
                  onChange={(event) => setSourceChainId(Number(event.target.value))}
                >
                  {PAYMENT_NETWORKS.map((network) => (
                    <option key={network.chainId} value={network.chainId}>
                      {network.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-teal-700 bg-white text-xl font-semibold text-teal-800 transition hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Swap source and destination networks"
                title="Swap networks"
                onClick={swapNetworks}
              >
                <span aria-hidden="true">⇄</span>
              </button>

              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-950">To network</span>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3"
                  value={destinationChainId}
                  onChange={(event) => setDestinationChainId(Number(event.target.value))}
                >
                  {PAYMENT_NETWORKS.map((network) => (
                    <option key={network.chainId} value={network.chainId}>
                      {network.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-950">Amount</span>
                <input
                  className="rounded-md border border-black/10 bg-white px-4 py-4 text-lg"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-950">Asset</span>
                <select
                  className="rounded-md border border-black/10 bg-white px-4 py-3"
                  value={token}
                  onChange={(event) => setToken(event.target.value as PaymentToken)}
                >
                  <option value="USDC">USDC</option>
                  <option value="NATIVE">{sourceNetwork?.nativeSymbol || "Native asset"}</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Private payment reference (optional)</span>
              <input
                className="rounded-md border border-black/10 bg-white px-4 py-3"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                maxLength={48}
                placeholder="Invoice, order or internal reference"
              />
              <span className="text-xs text-neutral-500">
                Stored only in encrypted XDCID history. It is not included in transaction calldata.
              </span>
            </label>

            {routeState.error ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {routeState.error}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-white/90 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Resolution and route
          </p>
          {recipient.trim().length > 0 ? (
            <div className="mt-5">
              <p className="text-2xl font-semibold text-slate-950">
                {directRecipient ? directRecipient : isValid ? name : recipient.trim()}
              </p>
              <p className="mt-3 break-all text-sm text-neutral-600">
                {resolutionMessage}
              </p>

              {hasOwner && expiry.data ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Expires: {new Date(Number(expiry.data) * 1000).toLocaleDateString()}
                </p>
              ) : null}

              {routeState.route ? (
                <div className="mt-5 rounded-md border border-black/10 bg-neutral-50 p-4 text-sm">
                  <p className="font-semibold text-slate-950">
                    {routeLabel(routeState.route)}
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {routeState.route.source.name} → {routeState.route.destination.name}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Steps
                  </p>
                  <p className="mt-1 text-neutral-700">
                    {routeState.route.steps.join(" → ")}
                  </p>
                  {destination ? (
                    <p className="mt-3 break-all text-xs text-neutral-600">
                      Receiving address: {destination.address}
                      <br />
                      Record: {destination.source === "direct-wallet" ? "direct wallet address" : destination.source === "multichain" ? "destination-chain record" : "default EVM record"}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canSendNative ? (
                <button
                  className="mt-5 w-full rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  disabled={isPending}
                  onClick={sendNative}
                >
                  {isPending ? "Confirm in wallet..." : `Send ${sourceNetwork?.nativeSymbol || "native asset"}`}
                </button>
              ) : token === "USDC" && destination ? (
                <MultichainUsdcExecutor
                  key={[
                    sourceChainId,
                    destinationChainId,
                    amount,
                    destination.address,
                    paymentReference
                  ].join(":")}
                  sourceChainId={sourceChainId}
                  destinationChainId={destinationChainId}
                  amount={amount}
                  recipient={destination.address}
                  ready={routeReady}
                  paymentReference={paymentReference.trim()}
                  onCompleted={recordSettlement}
                />
              ) : null}

              {token === "NATIVE" &&
              sourceChainId === destinationChainId &&
              isConnected &&
              connectedChainId !== sourceChainId ? (
                <p className="mt-3 text-xs text-amber-700">
                  Switch the connected wallet to {sourceNetwork?.name || "the source network"} to send {sourceNetwork?.nativeSymbol || "its native asset"}.
                </p>
              ) : null}

              {token === "NATIVE" && hash ? (
                <p className="mt-3 break-all text-xs text-neutral-500">
                  Native transfer:{" "}
                  {sourceNetwork?.explorerUrl ? (
                    <a
                      className="text-teal-700 underline"
                      href={sourceNetwork.explorerUrl + "/tx/" + hash}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {hash}
                    </a>
                  ) : (
                    hash
                  )}
                </p>
              ) : null}
              {historyStatus ? <p className="mt-3 text-xs text-neutral-600">{historyStatus}</p> : null}
              {error ? <p className="mt-3 text-xs text-red-600">{error.message}</p> : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-neutral-600">
              Enter an XNS ID or wallet address to preview the destination and payment route.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}
