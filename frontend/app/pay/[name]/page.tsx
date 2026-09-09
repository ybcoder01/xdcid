"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { isHex, keccak256, stringToHex, zeroAddress, type Hash, type Hex } from "viem";
import { useParams, useSearchParams } from "next/navigation";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  activeRegistryAddress,
  activeResolverSuiteAvailable,
  activeXnsChainId,
  addresses,
  multichainResolverAbi,
  registryAbi,
  resolverAbi
} from "../../../config/contracts";
import { getPaymentNetwork } from "../../../config/paymentNetworks";

const XDC_CHAIN_ID = activeXnsChainId;

const explorerUrls: Record<number, string> = {
  1: "https://etherscan.io",
  50: "https://xdcscan.com",
  51: "https://testnet.xdcscan.com",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io"
};
import {
  MultichainUsdcExecutor,
  type PaymentCompletionMetadata
} from "../../../components/MultichainUsdcExecutor";
import { TokenLogo, nativeTokenForChain } from "../../../components/TokenLogo";
import { WalletButton } from "../../../components/WalletButton";
import { parseXnsName } from "../../../lib/names";
import { paymentRequestId } from "../../../lib/paymentCancellation";
import { selectPaymentDestination } from "../../../lib/paymentPreparation";
import {
  installPaymentCompletionRetry,
  submitPaymentCompletion
} from "../../../lib/paymentCompletionQueue";
import { useRegistryStatus } from "../../../lib/useRegistryStatus";
import {
  inspectAccountDeployment,
  type AccountDeploymentState,
} from "../../../lib/accountAbstraction";
import {
  verifyPaymentRequestSignature,
  type PaymentRequestSignatureVerification,
} from "../../../lib/accountSignatures";
import {
  normalizePayToken,
  parsePayAmount,
  validatePayAmount,
  validatePayExpiry,
  validatePayMemo,
} from "../../../lib/paylinks";
import {
  decodePaymentRequest,
  isDesignatedPayer,
  paymentRequestRoute,
  type PaymentRequest,
} from "../../../lib/paymentRequests";

export default function PayRequestPage() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const parsedName = useMemo(() => parseXnsName(params.name ?? ""), [params.name]);
  const shortId = searchParams.get("id");
  const directEncodedRequest = searchParams.get("request");
  const directEncodedSignature = searchParams.get("signature");
  const [shortPayload, setShortPayload] = useState<{ request: string; signature: string }>();
  const [shortLinkLoading, setShortLinkLoading] = useState(false);
  const [shortLinkError, setShortLinkError] = useState("");

  useEffect(() => {
    let current = true;
    setShortPayload(undefined);
    setShortLinkError("");
    setShortLinkLoading(false);
    if (!shortId) return;

    setShortLinkLoading(true);
    fetch("/api/pay-links/" + encodeURIComponent(shortId), { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as {
          request?: string;
          signature?: string;
          error?: string;
        };
        if (!response.ok || !body.request || !body.signature) {
          throw new Error(body.error || "Short Pay Link could not be loaded.");
        }
        if (current) setShortPayload({ request: body.request, signature: body.signature });
      })
      .catch((error) => {
        if (current) {
          setShortLinkError(
            error instanceof Error ? error.message : "Short Pay Link could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (current) setShortLinkLoading(false);
      });

    return () => {
      current = false;
    };
  }, [shortId]);

  const encodedRequest = shortId ? shortPayload?.request ?? null : directEncodedRequest;
  const encodedSignature = shortId ? shortPayload?.signature ?? null : directEncodedSignature;

  const signedPayload = useMemo((): {
    request?: PaymentRequest;
    signature?: Hex;
    error?: string;
  } => {
    if (!encodedRequest && !encodedSignature) return {};
    if (!encodedRequest || !encodedSignature) return { error: "Signed payment request is incomplete." };
    if (!isHex(encodedSignature)) return { error: "Payment request signature is invalid." };
    try {
      return { request: decodePaymentRequest(encodedRequest), signature: encodedSignature };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Payment request is invalid." };
    }
  }, [encodedRequest, encodedSignature]);

  const signedRequest = signedPayload.request;
  const signedRequestId = useMemo(
    () => signedRequest ? paymentRequestId(signedRequest) : undefined,
    [signedRequest],
  );
  const [cancellationStatus, setCancellationStatus] = useState<
    "not-applicable" | "checking" | "active" | "cancelled" | "paid" | "unavailable"
  >("not-applicable");
  const legacyRequest = !encodedRequest && !encodedSignature;
  const awaitingShortLink = Boolean(shortId && !shortPayload && !shortLinkError);
  const amount = signedRequest?.amount ?? searchParams.get("amount") ?? "";
  const token = signedRequest?.token ?? normalizePayToken(searchParams.get("token"));
  const memo = signedRequest?.description ?? searchParams.get("memo") ?? "";
  const reference = signedRequest?.reference ?? "";
  const expires = signedRequest ? (signedRequest.expires ? String(signedRequest.expires) : undefined) : searchParams.get("expires");
  const amountError = awaitingShortLink ? undefined : validatePayAmount(amount, token);
  const memoError = awaitingShortLink ? undefined : validatePayMemo(memo);
  const expiryError = awaitingShortLink ? undefined : validatePayExpiry(expires);
  const pathError = signedRequest && parsedName.isValid && signedRequest.name !== parsedName.name
    ? "The signed XNS ID does not match this checkout URL."
    : undefined;
  const requestError = !parsedName.isValid
    ? parsedName.error
    : shortLinkError || signedPayload.error || pathError || amountError || memoError || expiryError;
  const value = useMemo(() => {
    try {
      return parsePayAmount(amount, token);
    } catch {
      return 0n;
    }
  }, [amount, token]);

  useEffect(() => {
    let current = true;
    if (!signedRequestId) {
      setCancellationStatus("not-applicable");
      return;
    }

    setCancellationStatus("checking");
    const checkStatus = () => fetch(
        "/api/pay-links/cancellations/" + encodeURIComponent(signedRequestId),
        { cache: "no-store" },
      )
      .then(async (response) => {
        const body = await response.json() as {
          cancelled?: boolean;
          paid?: boolean;
          error?: string;
        };
        if (
          !response.ok ||
          typeof body.cancelled !== "boolean" ||
          typeof body.paid !== "boolean"
        ) {
          throw new Error(body.error || "Cancellation status could not be verified.");
        }
        if (current) {
          setCancellationStatus(body.paid ? "paid" : body.cancelled ? "cancelled" : "active");
        }
      })
      .catch(() => {
        if (current) setCancellationStatus("unavailable");
      });
    void checkStatus();
    const interval = window.setInterval(checkStatus, 3_000);

    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [signedRequestId]);

  const route = signedRequest
    ? paymentRequestRoute(signedRequest)
    : {
        sourceChainId: 50,
        destinationChainId: 50,
        transferMode: "direct" as const
      };
  const sourceNetwork = getPaymentNetwork(route.sourceChainId);
  const destinationNetwork = getPaymentNetwork(route.destinationChainId);
  const crossChain = route.sourceChainId !== route.destinationChainId;

  const { address, isConnected, chainId } = useAccount();
  const verificationClient = usePublicClient({ chainId: XDC_CHAIN_ID });
  const accountClient = usePublicClient({ chainId: route.sourceChainId });
  const [signatureVerification, setSignatureVerification] = useState<PaymentRequestSignatureVerification>();
  const [signatureChecking, setSignatureChecking] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [accountDeployment, setAccountDeployment] = useState<AccountDeploymentState>("unknown");
  const [historyStatus, setHistoryStatus] = useState("");
  const [networkSwitchError, setNetworkSwitchError] = useState("");
  const recordingHashes = useRef(new Set<string>());

  useEffect(() => installPaymentCompletionRetry(), []);
  const nativePayment = useSendTransaction();
  const resetNativePayment = nativePayment.reset;
  const { switchChainAsync } = useSwitchChain();
  const transactionHash = nativePayment.data;
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  const previousPayer = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previousPayer.current && previousPayer.current !== address) {
      resetNativePayment();
      setHistoryStatus("");
      recordingHashes.current.clear();
    }
    previousPayer.current = address;
  }, [address, resetNativePayment]);

  const enabled = parsedName.isValid;
  const node = useMemo(
    () => (enabled ? keccak256(stringToHex(parsedName.name)) : undefined),
    [enabled, parsedName.name],
  );
  const owner = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node },
  });
  const xdcidRegistered =
    owner.data === undefined ? undefined : owner.data !== zeroAddress;
  const registry = useRegistryStatus(parsedName.name, xdcidRegistered, !!node, XDC_CHAIN_ID);

  const expiry = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: activeRegistryAddress,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node ? [node] : undefined,
    query: { enabled: !!node },
  });
  const resolvedAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node ? [node] : undefined,
    query: { enabled: !!node && activeResolverSuiteAvailable },
  });
  const multichainAddress = useReadContract({
    chainId: XDC_CHAIN_ID,
    address: addresses.multichainResolver,
    abi: multichainResolverAbi,
    functionName: "addressFor",
    args: node ? [node, BigInt(route.destinationChainId)] : undefined,
    query: { enabled: !!node && activeResolverSuiteAvailable },
  });

  useEffect(() => {
    let current = true;
    setSignatureVerification(undefined);
    setSignatureError("");
    setSignatureChecking(false);
    if (
      !signedRequest ||
      !signedPayload.signature ||
      !owner.data ||
      !verificationClient ||
      registry.status?.state !== "xdcid"
    ) return;

    setSignatureChecking(true);
    verifyPaymentRequestSignature(verificationClient, signedRequest, signedPayload.signature, owner.data)
      .then((verification) => {
        if (!current) return;
        setSignatureVerification(verification);
        if (!verification.valid) {
          setSignatureError(verification.error || "Payment request signature is not authorized by the current XNS owner.");
        }
      })
      .catch(() => {
        if (current) setSignatureError("Payment request signature could not be verified.");
      })
      .finally(() => {
        if (current) setSignatureChecking(false);
      });

    return () => {
      current = false;
    };
  }, [owner.data, verificationClient, registry.status?.state, signedRequest, signedPayload.signature]);


  useEffect(() => {
    let current = true;
    setAccountDeployment("unknown");
    if (!address || !accountClient) return;
    inspectAccountDeployment(accountClient, address).then((deployment) => {
      if (current) setAccountDeployment(deployment);
    });
    return () => {
      current = false;
    };
  }, [address, accountClient]);

  const domainExpired = expiry.data ? expiry.data <= BigInt(Math.floor(Date.now() / 1000)) : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !domainExpired;
  const registrySafe = registry.status?.state === "xdcid";
  const paymentDestination = useMemo(() => selectPaymentDestination({
    destinationChainId: route.destinationChainId,
    multichainAddress: typeof multichainAddress.data === "string" ? multichainAddress.data : undefined,
    defaultEvmAddress:
      activeResolverSuiteAvailable && typeof resolvedAddress.data === "string"
        ? resolvedAddress.data
        : typeof owner.data === "string"
          ? owner.data
          : undefined,
  }), [route.destinationChainId, multichainAddress.data, owner.data, resolvedAddress.data]);
  const paymentAddress = paymentDestination?.address;
  const resolving =
    owner.isLoading || expiry.isLoading || resolvedAddress.isLoading ||
    multichainAddress.isLoading || registry.isChecking;
  const resolutionFailed =
    owner.isError || expiry.isError || resolvedAddress.isError ||
    multichainAddress.isError || registry.isError;
  const signaturePending = Boolean(
    signedRequest && signedPayload.signature && !signatureError &&
    (!owner.data || !verificationClient || signatureChecking || !signatureVerification),
  );
  const payerAllowed = signedRequest ? isDesignatedPayer(signedRequest, address) : true;
  const nativeXdcPayment = token === "XDC" && route.sourceChainId === XDC_CHAIN_ID && route.destinationChainId === XDC_CHAIN_ID;
  const pending = nativePayment.isPending || receipt.isLoading;
  const wrongNetwork = isConnected && chainId !== route.sourceChainId;
  const cancellationAllowsPayment = legacyRequest || cancellationStatus === "active";
  const signedRequestValid = legacyRequest || Boolean(
    signedRequest && signatureVerification?.valid && !signatureError && payerAllowed &&
    cancellationAllowsPayment,
  );
  const routeReady = Boolean(
    !requestError && registrySafe && hasOwner && paymentAddress && value > 0n &&
    !shortLinkLoading && !signaturePending && signedRequestValid && sourceNetwork && destinationNetwork,
  );
  const canPay = Boolean(
    nativeXdcPayment && isConnected && !wrongNetwork && routeReady && !pending,
  );
  const paymentError = nativePayment.error;

  const recordSettlement = useCallback(async (
    sourceTransactionHash: Hash,
    destinationTransactionHash?: Hash,
    metadata?: PaymentCompletionMetadata
  ) => {
    if (!paymentAddress || value <= 0n) return;
    const key = sourceTransactionHash + ":" + (destinationTransactionHash || "");
    if (recordingHashes.current.has(key)) return;
    recordingHashes.current.add(key);
    setHistoryStatus("Verifying payment for private history...");
    try {
      await submitPaymentCompletion({
          name: parsedName.name,
          sourceChainId: route.sourceChainId,
          destinationChainId: route.destinationChainId,
          token: token === "USDC" ? "USDC" : "NATIVE",
          amountAtomic: value.toString(),
          recipient: paymentAddress,
          sourceTransactionHash,
          destinationTransactionHash,
          reference: reference.trim(),
          description: memo.trim(),
          paymentChannel: "pay_link",
          payLinkId: shortId || undefined,
          payLinkRequestId: signedRequestId,
          completionMethod: metadata?.completionMethod ||
            (route.sourceChainId === route.destinationChainId ? "direct" : "standard"),
          xdcidFeeAtomic: metadata?.xdcidFeeAtomic,
          circleFeeAtomic: metadata?.circleFeeAtomic
      });
      setCancellationStatus("paid");
      setHistoryStatus("Payment added to private history.");
    } catch (cause) {
      recordingHashes.current.delete(key);
      setHistoryStatus(
        cause instanceof Error
          ? "Payment succeeded, but private history needs retry: " + cause.message
          : "Payment succeeded, but private history could not be recorded."
      );
    }
  }, [
    memo,
    parsedName.name,
    paymentAddress,
    reference,
    route.destinationChainId,
    route.sourceChainId,
    shortId,
    signedRequestId,
    token,
    value
  ]);

  useEffect(() => {
    if (receipt.isSuccess && transactionHash) void recordSettlement(transactionHash);
  }, [receipt.isSuccess, recordSettlement, transactionHash]);

  function pay() {
    if (!paymentAddress || !canPay || !nativeXdcPayment) return;
    nativePayment.sendTransaction({ to: paymentAddress, value });
  }

  async function switchToPaymentNetwork() {
    setNetworkSwitchError("");
    try {
      await switchChainAsync({ chainId: route.sourceChainId });
    } catch (cause) {
      setNetworkSwitchError(friendlyPaymentError(cause));
    }
  }

  return (
    <main className="relative mx-auto flex min-h-[100svh] w-full max-w-[520px] items-start px-3 py-3 sm:items-center sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute inset-x-0 top-12 -z-10 h-56 rounded-full bg-gradient-to-br from-teal-200/70 via-white to-cyan-100/70 blur-3xl print:hidden" />
      <section className="pay-receipt relative w-full overflow-hidden rounded-[1.75rem] border border-teal-100 shadow-2xl shadow-teal-950/10 print:shadow-none">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0b6670] via-[#19a6a6] to-[#65d4e1] print:hidden" />
        <div className="p-4 pb-4 pt-5 sm:p-6 sm:pb-5 sm:pt-7">
        <header>
          <div className="flex flex-nowrap items-center justify-between gap-2">
            <XdcidMark />
            <div className="shrink-0 print:hidden"><WalletButton compact /></div>
          </div>
          <div className="mt-4 border-t border-dashed border-slate-300 pt-4 text-center sm:mt-5 sm:pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Pay</p>
            <div className="mt-2 flex items-center justify-center gap-2.5 sm:gap-3">
              <TokenLogo symbol={token} size={40} />
              <h1 className="text-[2.35rem] font-bold leading-none tracking-tight text-slate-950 tabular-nums sm:text-5xl">
                <AmountValue amount={amount} /> <span className="text-xl font-medium text-slate-500 sm:text-2xl">{token}</span>
              </h1>
            </div>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">to <strong className="font-semibold text-teal-800">{parsedName.name}</strong></p>
          </div>
        </header>

        {sourceNetwork && destinationNetwork ? (
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-slate-200 bg-white/75 px-3 py-2.5 shadow-sm sm:px-4">
            <div className="flex min-w-0 items-center justify-center gap-2">
              <TokenLogo symbol={nativeTokenForChain(route.sourceChainId)} size={24} />
              <p className="truncate text-[11px] font-semibold text-slate-700">{sourceNetwork.name}</p>
            </div>
            <span className="text-base font-light text-teal-700" aria-hidden="true">→</span>
            <div className="flex min-w-0 items-center justify-center gap-2">
              <TokenLogo symbol={nativeTokenForChain(route.destinationChainId)} size={24} />
              <p className="truncate text-[11px] font-semibold text-slate-700">{destinationNetwork.name}</p>
            </div>
          </div>
        ) : null}

        {reference || memo ? (
          <dl className="mt-2.5 divide-y divide-dashed divide-slate-200 border-y border-slate-200 text-xs">
            {reference ? (
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="flex items-center gap-2 text-slate-500"><span aria-hidden="true">▤</span> Reference</dt>
                <dd className="max-w-[62%] truncate text-right font-semibold text-slate-900" title={reference}>{reference}</dd>
              </div>
            ) : null}
            {memo ? (
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="flex items-center gap-2 text-slate-500"><span aria-hidden="true">◇</span> Note</dt>
                <dd className="max-w-[62%] truncate text-right text-slate-700" title={memo}>{memo}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {shortLinkLoading && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Loading and verifying the short Pay Link...
          </p>
        )}
        {legacyRequest && !shortId && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 print:hidden">
            Unsigned legacy request: verify the amount and recipient independently before paying.
          </p>
        )}
        {requestError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestError}</p>
        )}
        {wrongNetwork && sourceNetwork && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <span>Wrong network. Switch to <strong>{sourceNetwork.name}</strong>.</span>
            <button type="button" className="shrink-0 rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white" onClick={switchToPaymentNetwork}>
              Switch network
            </button>
          </div>
        )}
        {networkSwitchError && <p className="mt-1.5 text-center text-xs text-red-600">{networkSwitchError}</p>}
        {signatureError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{signatureError}</p>}
        {signedRequest && cancellationStatus === "checking" && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Checking whether this payment request is still active...
          </p>
        )}
        {signedRequest && cancellationStatus === "cancelled" && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            This payment request was cancelled by its creator. Payment is disabled.
          </p>
        )}
        {signedRequest && cancellationStatus === "paid" && (
          <p className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800">
            This Pay Link has been paid and is no longer available for another payment.
          </p>
        )}
        {signedRequest && cancellationStatus === "unavailable" && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Cancellation status cannot be verified right now. Payment is temporarily disabled for safety.
          </p>
        )}
        {signedRequest && signedRequest.payer !== zeroAddress && isConnected && !payerAllowed && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            This request is designated for a different payer wallet.
          </p>
        )}

        {!isConnected && !requestError && (
          <p className="mt-3 text-center text-xs font-medium text-slate-500">
            Connect your wallet above to enable payment.
          </p>
        )}

        {token === "USDC" && isConnected && paymentAddress && !wrongNetwork && (
          <div className="print:hidden">
            <MultichainUsdcExecutor
              key={address + ":" + route.sourceChainId + ":" + route.destinationChainId}
              sourceChainId={route.sourceChainId}
              destinationChainId={route.destinationChainId}
              amount={amount}
              recipient={paymentAddress}
              ready={routeReady && !wrongNetwork}
              paymentReference={reference.trim()}
              onCompleted={recordSettlement}
              requestedTransferMode={
                route.transferMode === "automatic"
                  ? "automatic"
                  : route.transferMode === "standard"
                    ? "standard"
                    : "payer-choice"
              }
              presentation="checkout"
            />
          </div>
        )}

        {token === "XDC" && isConnected && !wrongNetwork && (
          <div className="mt-3 print:hidden">
            <button type="button" disabled={!canPay || Boolean(transactionHash) || receipt.isSuccess} onClick={pay} className="h-12 w-full rounded-xl bg-slate-950 px-5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {nativePayment.isPending
                ? "Approve or reject in your wallet"
                : transactionHash && !receipt.isSuccess
                  ? "Payment submitted · Confirming"
                  : receipt.isSuccess
                    ? "✓ Payment confirmed"
                    : "Pay"}
            </button>
            <p className={"min-h-5 pt-1.5 text-center text-xs " + (paymentError ? "text-red-600" : receipt.isSuccess ? "text-teal-700" : "text-slate-500")} aria-live="polite">
              {paymentError
                ? friendlyPaymentError(paymentError)
                : receipt.isSuccess
                  ? "Confirmed on XDC Network"
                  : transactionHash
                    ? "Your wallet approved the payment. Waiting for network confirmation."
                    : " "}
            </p>
          </div>
        )}

        {!requestError && (
          <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 print:hidden">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">
              Payment details
            </summary>
            <div className="space-y-4 border-t border-slate-200 px-4 py-4 text-sm">
              {signedRequest && sourceNetwork && destinationNetwork && (
                <div>
                  <p className="font-semibold text-slate-900">Route</p>
                  <p className="mt-1 text-slate-600">
                    {sourceNetwork.name} → {destinationNetwork.name} · {crossChain
                      ? route.transferMode === "payer-choice" ? "Payer chooses Standard or Automatic" : route.transferMode
                      : "Direct"}
                  </p>
                </div>
              )}
              {signedRequest && !signatureError && (
                <div>
                  <p className="font-semibold text-slate-900">Signed request</p>
                  <p className="mt-1 break-all text-slate-600">
                    {signaturePending
                      ? "Checking the current XNS owner signature..."
                      : signatureVerification?.valid
                        ? (signatureVerification.accountType === "contract"
                            ? "Verified smart account (ERC-1271): "
                            : "Verified ordinary wallet: ") + signatureVerification.signer
                        : "Signature verification unavailable."}
                  </p>
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-900">Recipient</p>
                <p className="mt-1 break-all text-slate-600">
                  {resolving
                    ? "Resolving the XNS ID on-chain..."
                      : resolutionFailed
                        ? "The registry status could not be verified."
                        : registry.status?.state === "legacy"
                          ? "Payment blocked: this name requires migration from XDCDomains."
                          : registry.status?.state === "collision"
                            ? "Payment blocked: this name exists in both registries and requires review."
                            : !hasOwner
                              ? "The XNS ID is unregistered or expired."
                              : paymentAddress
                                ? paymentAddress + (paymentDestination?.source === "evm-default" ? " (default EVM address)" : "")
                                : "No payment address is set for the destination network."}
                </p>
                {paymentAddress && (
                  <a className="mt-2 inline-block font-semibold text-teal-700 underline" href={(explorerUrls[route.destinationChainId] || "https://xdcscan.com") + "/address/" + paymentAddress} target="_blank" rel="noreferrer">
                    Verify on {destinationNetwork?.name || "destination explorer"}
                  </a>
                )}
              </div>
              {isConnected && (
                <div>
                  <p className="font-semibold text-slate-900">Connected wallet</p>
                  <p className="mt-1 text-slate-600">
                    {accountDeployment === "deployed-contract"
                      ? "Smart-account execution is handled by the connected wallet."
                      : "Transaction execution and gas approval are handled by the connected wallet."}
                  </p>
                </div>
              )}
              {transactionHash && (
                <div>
                  <p className="font-semibold text-slate-900">Transaction</p>
                  <a className="mt-1 block break-all font-semibold text-teal-700 underline" href={"https://xdcscan.com/tx/" + transactionHash} target="_blank" rel="noreferrer">
                    {transactionHash}
                  </a>
                </div>
              )}
            </div>
          </details>
        )}

        {historyStatus && <p className="mt-1.5 text-center text-[11px] text-slate-500">{historyStatus}</p>}

        <footer className="mt-2.5 border-t border-dashed border-slate-300 pt-2 text-center print:hidden">
          <div className="inline-flex items-center gap-2 text-left">
            <span className="grid h-6 w-6 place-items-center rounded-full border border-teal-700 text-xs font-bold text-teal-700" aria-hidden="true">✓</span>
            <span className="text-xs">
              <strong className="text-slate-800">
                {signedRequest && signatureVerification?.valid && cancellationStatus === "active"
                  ? "Verified Pay Link"
                  : "On-chain checkout"}
              </strong>
              <span className="text-slate-400"> · Secured by XDCID</span>
            </span>
          </div>
        </footer>
        </div>
      </section>
    </main>
  );
}

function XdcidMark({ className = "" }: { className?: string }) {
  return (
    <span className={"relative block h-9 w-28 shrink-0 overflow-hidden sm:w-32 " + className} aria-label="XDCID">
      <Image
        alt=""
        className="absolute left-[-19px] top-[-22px] h-[76px] w-[142px] max-w-none"
        height={914}
        priority
        src="/XDCID.png"
        width={1714}
      />
    </span>
  );
}

function AmountValue({ amount }: { amount: string }) {
  if (!amount) return <>—</>;
  const [whole, fraction] = amount.trim().split(".");
  return (
    <span aria-label={amount}>
      <span aria-hidden="true">{whole || "0"}</span>
      {fraction !== undefined ? (
        <>
          <span aria-hidden="true" className="inline-block min-w-[0.25em] text-center">.</span>
          <span aria-hidden="true">{fraction}</span>
        </>
      ) : null}
    </span>
  );
}

function friendlyPaymentError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("rejected") || message.includes("denied") || message.includes("user cancelled")) {
    return "Payment rejected in your wallet. No funds were sent.";
  }
  return "Payment could not be submitted. You can try again.";
}
