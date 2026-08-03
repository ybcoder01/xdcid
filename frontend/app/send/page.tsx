"use client";

import { useMemo, useState } from "react";
import { parseEther, parseUnits, zeroAddress } from "viem";
import { useAccount, useReadContract, useSendTransaction } from "wagmi";
import { MultichainUsdcExecutor } from "../../components/MultichainUsdcExecutor";
import {
  addresses,
  contractsConfigured,
  multichainResolverAbi,
  registrarAbi,
  registryAbi,
  resolverAbi
} from "../../config/contracts";
import { PAYMENT_NETWORKS, USDC_DECIMALS } from "../../config/paymentNetworks";
import { parseXnsName } from "../../lib/names";
import { selectPaymentDestination } from "../../lib/paymentPreparation";
import {
  planPaymentRoute,
  swapPaymentNetworks,
  type PaymentRoute,
  type PaymentToken
} from "../../lib/paymentRouting";
import { useRegistryStatus } from "../../lib/useRegistryStatus";

const XDC_CHAIN_ID = 50;

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
  const [sourceChainId, setSourceChainId] = useState(8453);
  const [destinationChainId, setDestinationChainId] = useState(XDC_CHAIN_ID);
  const [token, setToken] = useState<PaymentToken>("USDC");
  const { chainId: connectedChainId, isConnected } = useAccount();
  const { sendTransaction, isPending, data: hash, error } = useSendTransaction();

  const parsedName = useMemo(() => parseXnsName(recipient), [recipient]);
  const { label, name, isValid, error: validationError } = parsedName;
  const enabled = contractsConfigured && isValid;
  const units = useMemo(() => paymentUnits(amount, token), [amount, token]);

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

  const node = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [name],
    query: { enabled }
  });

  const owner = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const xdcidRegistered =
    owner.data === undefined ? undefined : owner.data !== zeroAddress;
  const registry = useRegistryStatus(name, xdcidRegistered, !!node.data);

  const expiry = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.registry,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const xdcDefaultAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data }
  });

  const multichainAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.multichainResolver,
    abi: multichainResolverAbi,
    functionName: "addressFor",
    args: node.data ? [node.data, BigInt(destinationChainId)] : undefined,
    query: { enabled: !!node.data }
  });

  const expired = expiry.data
    ? expiry.data < BigInt(Math.floor(Date.now() / 1000))
    : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !expired;
  const registrySafe = registry.status?.state === "xdcid";

  const destination = useMemo(
    () =>
      selectPaymentDestination({
        destinationChainId,
        multichainAddress:
          typeof multichainAddress.data === "string"
            ? multichainAddress.data
            : undefined,
        defaultEvmAddress:
          typeof xdcDefaultAddress.data === "string"
            ? xdcDefaultAddress.data
            : undefined
      }),
    [destinationChainId, multichainAddress.data, xdcDefaultAddress.data]
  );

  const readsLoading =
    node.isLoading ||
    owner.isLoading ||
    expiry.isLoading ||
    xdcDefaultAddress.isLoading ||
    multichainAddress.isLoading ||
    registry.isChecking;
  const readsFailed =
    node.isError ||
    owner.isError ||
    expiry.isError ||
    xdcDefaultAddress.isError ||
    multichainAddress.isError ||
    registry.isError;

  const routeReady =
    isValid &&
    registrySafe &&
    hasOwner &&
    !!destination &&
    !!routeState.route &&
    units > 0n &&
    !readsLoading &&
    !readsFailed;

  const canSendNativeXdc =
    routeReady &&
    isConnected &&
    connectedChainId === XDC_CHAIN_ID &&
    token === "NATIVE" &&
    sourceChainId === XDC_CHAIN_ID &&
    destinationChainId === XDC_CHAIN_ID &&
    !isPending;

  function sendNativeXdc() {
    if (!canSendNativeXdc || !destination) return;
    sendTransaction({
      to: destination.address,
      value: parseEther(amount)
    });
  }

  function swapNetworks() {
    const swapped = swapPaymentNetworks({
      sourceChainId,
      destinationChainId
    });
    setSourceChainId(swapped.sourceChainId);
    setDestinationChainId(swapped.destinationChainId);
  }

  const resolutionMessage = !isValid
    ? validationError
    : !contractsConfigured
      ? "Contracts not configured"
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            XDCID multichain payments
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">
            Send to a .XDC name
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Resolve one XNS ID to the receiving address configured for the destination network.
          </p>

          <div className="mt-8 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Recipient</span>
              <div className="flex gap-2 rounded-md border border-black/10 bg-slate-950 p-2">
                <input
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white px-4 py-4 text-lg"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="name or name.xdc"
                  aria-invalid={recipient.trim().length > 0 && !isValid}
                />
                <span className="grid min-w-20 place-items-center rounded-md bg-teal-500 px-4 py-4 text-sm font-semibold text-slate-950">
                  .XDC
                </span>
              </div>
              {recipient.trim().length > 0 && !isValid ? (
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
                  <option value="NATIVE">Native token</option>
                </select>
              </label>
            </div>

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
          {label.length > 0 ? (
            <div className="mt-5">
              <p className="text-2xl font-semibold text-slate-950">
                {isValid ? name : recipient.trim()}
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
                      Record: {destination.source === "multichain" ? "destination-chain record" : "default EVM record"}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {canSendNativeXdc ? (
                <button
                  className="mt-5 w-full rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  disabled={isPending}
                  onClick={sendNativeXdc}
                >
                  {isPending ? "Confirm in wallet..." : "Send XDC"}
                </button>
              ) : token === "USDC" && destination ? (
                <MultichainUsdcExecutor
                  key={[
                    sourceChainId,
                    destinationChainId,
                    amount,
                    destination.address
                  ].join(":")}
                  sourceChainId={sourceChainId}
                  destinationChainId={destinationChainId}
                  amount={amount}
                  recipient={destination.address}
                  ready={routeReady}
                />
              ) : null}

              {token === "NATIVE" &&
              sourceChainId === XDC_CHAIN_ID &&
              destinationChainId === XDC_CHAIN_ID &&
              isConnected &&
              connectedChainId !== XDC_CHAIN_ID ? (
                <p className="mt-3 text-xs text-amber-700">
                  Switch the connected wallet to XDC Network to send XDC.
                </p>
              ) : null}

              {hash ? (
                <p className="mt-3 break-all text-xs text-neutral-500">
                  Transaction sent: {hash}
                </p>
              ) : null}
              {error ? <p className="mt-3 text-xs text-red-600">{error.message}</p> : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-neutral-600">
              Enter a recipient name to preview its destination address and payment route.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}
