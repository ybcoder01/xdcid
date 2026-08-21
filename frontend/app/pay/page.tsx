"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress, keccak256, stringToHex, toHex, zeroAddress } from "viem";
import { useAccount, useReadContract, useSignTypedData } from "wagmi";
import { activeRegistryAddress, activeXnsChainId, registryAbi } from "../../config/contracts";
import { PAYMENT_NETWORKS } from "../../config/paymentNetworks";
import { parseXnsName } from "../../lib/names";
import { useRegistryStatus } from "../../lib/useRegistryStatus";
import { normalizePayToken, validatePayAmount, type PayToken } from "../../lib/paylinks";
import {
  createPaymentRequestCancellation,
  paymentCancellationTypedData,
  paymentRequestId,
} from "../../lib/paymentCancellation";
import {
  buildSignedPaymentLink,
  decodePaymentRequest,
  MAX_PAYMENT_DESCRIPTION_LENGTH,
  MAX_PAYMENT_REFERENCE_LENGTH,
  PAYMENT_REQUEST_CHAIN_ID,
  PAYMENT_REQUEST_VERSION,
  paymentRequestTypedData,
  type PaymentRequest,
  type PaymentTransferMode,
} from "../../lib/paymentRequests";

export default function PayLinksPage() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<PayToken>("USDC");
  const [sourceChainId, setSourceChainId] = useState(activeXnsChainId);
  const [destinationChainId, setDestinationChainId] = useState(activeXnsChainId);
  const [transferMode, setTransferMode] =
    useState<PaymentTransferMode>("direct");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [payer, setPayer] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [origin, setOrigin] = useState("");
  const [payLink, setPayLink] = useState("");
  const [portablePayLink, setPortablePayLink] = useState("");
  const [shortId, setShortId] = useState("");
  const [shortLinkExpiresAt, setShortLinkExpiresAt] = useState("");
  const [shortLinkNotice, setShortLinkNotice] = useState("");
  const [cancellationLink, setCancellationLink] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState(false);

  const { address, isConnected, chainId } = useAccount();
  const signRequest = useSignTypedData();
  useEffect(() => setOrigin(window.location.origin), []);

  const crossChain = sourceChainId !== destinationChainId;
  useEffect(() => {
    if (sourceChainId === destinationChainId) {
      setTransferMode("direct");
      return;
    }
    setToken("USDC");
    if (transferMode === "direct") setTransferMode("payer-choice");
  }, [sourceChainId, destinationChainId, transferMode]);

  const parsedName = useMemo(() => parseXnsName(recipient), [recipient]);
  const expiry = useMemo(() => {
    if (!expiresAt) return 0;
    const milliseconds = new Date(expiresAt).getTime();
    return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : -1;
  }, [expiresAt]);

  const enabled = parsedName.isValid;
  const node = useMemo(
    () => (enabled ? keccak256(stringToHex(parsedName.name)) : undefined),
    [enabled, parsedName.name],
  );
  const owner = useReadContract({
    chainId: activeXnsChainId,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node },
  });
  const xdcidRegistered =
    owner.data === undefined ? undefined : owner.data !== zeroAddress;
  const registry = useRegistryStatus(parsedName.name, xdcidRegistered, !!node, activeXnsChainId);

  const nameExpiry = useReadContract({
    chainId: activeXnsChainId,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node },
  });

  const nameError = recipient && !parsedName.isValid ? parsedName.error : undefined;
  const amountError = amount ? validatePayAmount(amount, token) : undefined;
  const referenceError = reference.length > MAX_PAYMENT_REFERENCE_LENGTH
    ? "Reference must be " + MAX_PAYMENT_REFERENCE_LENGTH + " characters or fewer."
    : reference && !reference.trim()
      ? "Reference cannot contain only spaces."
      : undefined;
  const descriptionError = description.length > MAX_PAYMENT_DESCRIPTION_LENGTH
    ? "Description must be " + MAX_PAYMENT_DESCRIPTION_LENGTH + " characters or fewer."
    : undefined;
  const payerError = payer && !isAddress(payer) ? "Enter a valid designated payer address." : undefined;
  const expiryError = expiry < 0 || (expiry > 0 && expiry <= Math.floor(Date.now() / 1000))
    ? "Choose a future expiry."
    : undefined;
  const domainExpired = nameExpiry.data
    ? nameExpiry.data <= BigInt(Math.floor(Date.now() / 1000))
    : true;
  const ownerMatches = Boolean(
    address && owner.data && getAddress(address) === getAddress(owner.data),
  );
  const resolving =
    owner.isLoading || nameExpiry.isLoading || registry.isChecking;
  const registrySafe = registry.status?.state === "xdcid";
  const wrongNetwork = isConnected && chainId !== PAYMENT_REQUEST_CHAIN_ID;
  const canCreate = Boolean(
    origin && parsedName.isValid && amount && !amountError && reference.trim() && !referenceError &&
    !descriptionError && !payerError && !expiryError && isConnected && !wrongNetwork && ownerMatches &&
    registrySafe && !domainExpired && !resolving && !signRequest.isPending,
  );

  useEffect(() => {
    setPayLink("");
    setPortablePayLink("");
    setShortId("");
    setShortLinkExpiresAt("");
    setShortLinkNotice("");
    setRevoked(false);
    setCopied(false);
    setCreateError("");
  }, [
    recipient,
    amount,
    token,
    sourceChainId,
    destinationChainId,
    transferMode,
    reference,
    description,
    payer,
    expiresAt
  ]);

  async function createSignedLink() {
    if (!canCreate || !address) return;
    try {
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const request: PaymentRequest = {
        version: PAYMENT_REQUEST_VERSION,
        chainId: PAYMENT_REQUEST_CHAIN_ID,
        sourceChainId,
        destinationChainId,
        transferMode,
        name: parsedName.name,
        amount: amount.trim(),
        token: normalizePayToken(token),
        reference: reference.trim(),
        description,
        payer: payer ? getAddress(payer) : zeroAddress,
        issuedAt: Math.floor(Date.now() / 1000),
        expires: expiry,
        nonce: toHex(nonceBytes),
      };
      const signature = await signRequest.signTypedDataAsync(
        paymentRequestTypedData(request) as never
      );
      const portableLink = buildSignedPaymentLink(origin, request, signature);
      setPortablePayLink(portableLink);

      try {
        const response = await fetch("/api/pay-links", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request: portableLink
              ? new URL(portableLink).searchParams.get("request")
              : "",
            signature
          })
        });
        const body = await response.json() as {
          id?: string;
          path?: string;
          expiresAt?: string;
          revocationToken?: string;
          error?: string;
        };
        if (
          !response.ok ||
          !body.id ||
          !body.path ||
          !body.expiresAt
        ) {
          throw new Error(body.error || "Short Pay Link could not be created.");
        }
        const shortLink = new URL(body.path, origin).toString();
        setPayLink(shortLink);
        setCancellationLink(shortLink);
        setShortId(body.id);
        setShortLinkExpiresAt(body.expiresAt);
      } catch (shortLinkError) {
        setPayLink(portableLink);
        setCancellationLink(portableLink);
        setShortLinkNotice(
          (shortLinkError instanceof Error
            ? shortLinkError.message
            : "Short Pay Link could not be created.") +
            " The portable signed link is available instead.",
        );
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "The payment request could not be signed.");
    }
  }

  async function copyLink() {
    if (!payLink) return;
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
  }

  async function loadCancellationPayload(link: string): Promise<{
    request: string;
    signature: string;
  }> {
    const url = new URL(link, origin);
    const request = url.searchParams.get("request");
    const signature = url.searchParams.get("signature");
    if (request && signature) return { request, signature };

    const id = url.searchParams.get("id");
    if (!id) throw new Error("Enter a valid signed XDCID Pay Link.");
    const response = await fetch("/api/pay-links/" + encodeURIComponent(id), {
      cache: "no-store",
    });
    const body = await response.json() as {
      request?: string;
      signature?: string;
      error?: string;
    };
    if (!response.ok || !body.request || !body.signature) {
      throw new Error(body.error || "Pay Link could not be loaded.");
    }
    return { request: body.request, signature: body.signature };
  }

  async function cancelPaymentRequest() {
    if (!cancellationLink.trim() || revoking || revoked || !isConnected || wrongNetwork) return;
    setRevoking(true);
    setShortLinkNotice("");
    setCreateError("");
    try {
      const payload = await loadCancellationPayload(cancellationLink.trim());
      const request = decodePaymentRequest(payload.request);
      const cancellation = createPaymentRequestCancellation(request);
      const cancellationSignature = await signRequest.signTypedDataAsync(
        paymentCancellationTypedData(cancellation),
      );
      const requestId = paymentRequestId(request);
      const response = await fetch(
        "/api/pay-links/cancellations/" + encodeURIComponent(requestId),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request: payload.request,
            requestSignature: payload.signature,
            cancellation,
            cancellationSignature,
          }),
        },
      );
      const body = await response.json() as { error?: string; status?: string };
      if (!response.ok) {
        throw new Error(body.error || "Payment request could not be cancelled.");
      }
      setRevoked(true);
      setShortLinkNotice(
        "Payment request cancelled. Its short and portable links can no longer initiate payment.",
      );
    } catch (error) {
      setShortLinkNotice(
        error instanceof Error ? error.message : "Payment request could not be cancelled.",
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-700">XDCID Payment Requests</p>
      <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-950">Create a verifiable payment request</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Sign a route-aware USDC request with the current XNS owner account. Same-chain XDC remains available on XDC Network. Signing is gasless and XDCID never holds funds.
      </p>

      <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Receive with XNS ID</span>
            <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="alice.xdc" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
            {nameError && <span className="mt-2 block text-sm text-red-600">{nameError}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Amount</span>
            <input inputMode="decimal" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="25.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
            {amountError && <span className="mt-2 block text-sm text-red-600">{amountError}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Token</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              value={token}
              onChange={(event) => setToken(normalizePayToken(event.target.value))}
            >
              {!crossChain && sourceChainId === 50 ? (
                <option value="XDC">XDC</option>
              ) : null}
              <option value="USDC">USDC</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Payer sends from</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
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

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Recipient receives on</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
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

          {crossChain ? (
            <label className="block md:col-span-2">
              <span className="text-sm font-semibold text-slate-800">Transfer method</span>
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
                value={transferMode}
                onChange={(event) =>
                  setTransferMode(event.target.value as PaymentTransferMode)
                }
              >
                <option value="payer-choice">Let payer choose</option>
                <option value="automatic">Automatic forwarding</option>
                <option value="standard">Standard transfer</option>
              </select>
              <span className="mt-2 block text-xs text-slate-500">
                Automatic forwarding avoids destination gas. Standard transfer requires the payer to submit the destination mint.
              </span>
            </label>
          ) : null}

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Payment reference</span>
            <input maxLength={MAX_PAYMENT_REFERENCE_LENGTH} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="ORDER-104" value={reference} onChange={(event) => setReference(event.target.value)} />
            {referenceError && <span className="mt-2 block text-sm text-red-600">{referenceError}</span>}
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Description (optional)</span>
            <input maxLength={MAX_PAYMENT_DESCRIPTION_LENGTH} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Consulting services" value={description} onChange={(event) => setDescription(event.target.value)} />
            <span className="mt-2 block text-xs text-slate-500">Visible to anyone with the link. Do not include confidential information.</span>
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Designated payer wallet (optional)</span>
            <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="0x..." value={payer} onChange={(event) => setPayer(event.target.value)} />
            <span className="mt-2 block text-xs text-slate-500">When set, checkout is enabled only for this connected address.</span>
            {payerError && <span className="mt-2 block text-sm text-red-600">{payerError}</span>}
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Request expires (optional)</span>
            <input type="datetime-local" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            {expiryError && <span className="mt-2 block text-sm text-red-600">{expiryError}</span>}
          </label>
        </div>

        <div className="mt-8 rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-700">Owner verification</p>
          <p className="mt-2 text-sm text-slate-600">
            {!isConnected
              ? "Connect the wallet or smart account that currently owns this XNS ID."
              : wrongNetwork
                ? "Switch to XDC Network (chain ID 50)."
                : resolving
                  ? "Checking both name registries on-chain..."
                  : registry.isError
                    ? "Registry status could not be verified."
                    : registry.status?.state === "legacy"
                      ? "This name requires migration from XDCDomains before it can create XDCID Pay Links."
                      : registry.status?.state === "collision"
                        ? "This name exists in both registries and is blocked pending review."
                        : domainExpired
                          ? "This XNS ID is unregistered or expired."
                          : ownerMatches
                            ? "Connected account matches the current XNS owner."
                            : "Connected account is not the current XNS owner."}
          </p>
          <button type="button" disabled={!canCreate} onClick={createSignedLink} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {signRequest.isPending ? "Waiting for wallet signature..." : "Sign payment request"}
          </button>
          {(createError || signRequest.error) && <p className="mt-3 text-sm text-red-600">{createError || signRequest.error?.message}</p>}
        </div>

        {payLink && (
          <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <p className="text-sm font-semibold text-teal-900">
              {shortId ? "Short signed payment request" : "Portable signed payment request"}
            </p>
            <p className="mt-2 break-all text-sm text-teal-800">{payLink}</p>
            {shortLinkExpiresAt && (
              <p className="mt-2 text-xs text-teal-800">
                Short link retained until {new Date(shortLinkExpiresAt).toLocaleString()}.
              </p>
            )}
            {shortLinkNotice && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {shortLinkNotice}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={copyLink} className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white">{copied ? "Copied" : "Copy payment link"}</button>
              <a className="rounded-xl border border-teal-300 px-5 py-3 font-semibold text-teal-900" href={payLink}>Preview request</a>
              {!revoked && (
                <button type="button" disabled={revoking || wrongNetwork} onClick={cancelPaymentRequest} className="rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-700 disabled:opacity-50">
                  {revoking ? "Waiting for cancellation..." : "Cancel entire request"}
                </button>
              )}
            </div>
            {shortId && portablePayLink && (
              <details className="mt-5 text-sm text-teal-900">
                <summary className="cursor-pointer font-semibold">Portable no-storage fallback</summary>
                <p className="mt-2 break-all text-xs text-teal-800">{portablePayLink}</p>
                <p className="mt-2 text-xs text-teal-800">
                  This longer link is public, but the same creator-signed cancellation disables both formats.
                </p>
              </details>
            )}
          </div>
        )}
        <section className="mt-8 border-t border-slate-200 pt-8">
          <h2 className="text-2xl font-bold text-slate-950">Cancel an existing request</h2>
          <p className="mt-2 text-sm text-slate-600">
            Paste either the short or portable Pay Link. The current XNS owner must sign the cancellation on XDC Network. No gas is required.
          </p>
          <input
            className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3"
            placeholder="https://xdcid.xyz/pay/alice.xdc?..."
            value={cancellationLink}
            onChange={(event) => {
              setCancellationLink(event.target.value);
              setRevoked(false);
              setShortLinkNotice("");
            }}
          />
          <button
            type="button"
            disabled={!cancellationLink.trim() || revoking || revoked || !isConnected || wrongNetwork}
            onClick={cancelPaymentRequest}
            className="mt-4 rounded-xl border border-red-300 px-5 py-3 font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {revoking ? "Waiting for wallet signature..." : revoked ? "Request cancelled" : "Sign cancellation"}
          </button>
        </section>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        The signature proves who issued the request but cannot move funds. Requests remain public to anyone who receives their link.
      </p>
    </main>
  );
}
