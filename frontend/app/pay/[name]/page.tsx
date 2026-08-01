"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, isHex, zeroAddress, type Hex } from "viem";
import { useParams, useSearchParams } from "next/navigation";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { addresses, contractsConfigured, registrarAbi, registryAbi, resolverAbi } from "../../../config/contracts";
import { erc20TransferAbi, XDC_USDC_ADDRESS } from "../../../config/tokens";
import { parseXnsName } from "../../../lib/names";
import { useRegistryStatus } from "../../../lib/useRegistryStatus";
import {
  inspectAccountDeployment,
  paymentReceiptActors,
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
  type PaymentRequest,
} from "../../../lib/paymentRequests";

export default function PayRequestPage() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const parsedName = useMemo(() => parseXnsName(params.name ?? ""), [params.name]);
  const encodedRequest = searchParams.get("request");
  const encodedSignature = searchParams.get("signature");

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
  const legacyRequest = !encodedRequest && !encodedSignature;
  const amount = signedRequest?.amount ?? searchParams.get("amount") ?? "";
  const token = signedRequest?.token ?? normalizePayToken(searchParams.get("token"));
  const memo = signedRequest?.description ?? searchParams.get("memo") ?? "";
  const reference = signedRequest?.reference ?? "";
  const expires = signedRequest ? (signedRequest.expires ? String(signedRequest.expires) : undefined) : searchParams.get("expires");
  const amountError = validatePayAmount(amount, token);
  const memoError = validatePayMemo(memo);
  const expiryError = validatePayExpiry(expires);
  const pathError = signedRequest && parsedName.isValid && signedRequest.name !== parsedName.name
    ? "The signed XNS ID does not match this checkout URL."
    : undefined;
  const requestError = !parsedName.isValid
    ? parsedName.error
    : signedPayload.error || pathError || amountError || memoError || expiryError;
  const value = useMemo(() => {
    try {
      return parsePayAmount(amount, token);
    } catch {
      return 0n;
    }
  }, [amount, token]);

  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [signatureVerification, setSignatureVerification] = useState<PaymentRequestSignatureVerification>();
  const [signatureChecking, setSignatureChecking] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [accountDeployment, setAccountDeployment] = useState<AccountDeploymentState>("unknown");
  const nativePayment = useSendTransaction();
  const tokenPayment = useWriteContract();
  const transactionHash = token === "USDC" ? tokenPayment.data : nativePayment.data;
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  const enabled = contractsConfigured && parsedName.isValid;
  const node = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [parsedName.name],
    query: { enabled },
  });
  const owner = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
  });
  const xdcidRegistered =
    owner.data === undefined ? undefined : owner.data !== zeroAddress;
  const registry = useRegistryStatus(node.data, xdcidRegistered, !!node.data);

  const expiry = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
  });
  const resolvedAddress = useReadContract({
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
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
      !publicClient ||
      registry.status?.state !== "xdcid"
    ) return;

    setSignatureChecking(true);
    verifyPaymentRequestSignature(publicClient, signedRequest, signedPayload.signature, owner.data)
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
  }, [owner.data, publicClient, registry.status?.state, signedRequest, signedPayload.signature]);


  useEffect(() => {
    let current = true;
    setAccountDeployment("unknown");
    if (!address || !publicClient) return;
    inspectAccountDeployment(publicClient, address).then((deployment) => {
      if (current) setAccountDeployment(deployment);
    });
    return () => {
      current = false;
    };
  }, [address, publicClient]);

  const domainExpired = expiry.data ? expiry.data <= BigInt(Math.floor(Date.now() / 1000)) : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !domainExpired;
  const registrySafe = registry.status?.state === "xdcid";
  const paymentAddress =
    resolvedAddress.data && resolvedAddress.data !== zeroAddress && isAddress(resolvedAddress.data)
      ? resolvedAddress.data
      : undefined;
  const resolving =
    node.isLoading || owner.isLoading || expiry.isLoading || resolvedAddress.isLoading || registry.isChecking;
  const resolutionFailed =
    node.isError || owner.isError || expiry.isError || resolvedAddress.isError || registry.isError;
  const signaturePending = Boolean(
    signedRequest && signedPayload.signature && !signatureError &&
    (!owner.data || !publicClient || signatureChecking || !signatureVerification),
  );
  const payerAllowed = signedRequest ? isDesignatedPayer(signedRequest, address) : true;
  const pending = nativePayment.isPending || tokenPayment.isPending || receipt.isLoading;
  const wrongNetwork = isConnected && chainId !== 50;
  const signedRequestValid = legacyRequest || Boolean(
    signedRequest && signatureVerification?.valid && !signatureError && payerAllowed,
  );
  const canPay = Boolean(
    isConnected && !wrongNetwork && !requestError && registrySafe && hasOwner && paymentAddress && value > 0n &&
    !pending && !signaturePending && signedRequestValid,
  );
  const paymentError = token === "USDC" ? tokenPayment.error : nativePayment.error;
  const receiptActors = paymentReceiptActors(address, receipt.data?.from);

  function pay() {
    if (!paymentAddress || !canPay) return;
    if (token === "USDC") {
      tokenPayment.writeContract({
        address: XDC_USDC_ADDRESS,
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [paymentAddress, value],
      });
    } else {
      nativePayment.sendTransaction({ to: paymentAddress, value });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-700">XDCID Pay Link</p>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <p className="text-sm text-slate-500">Payment requested by</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-950">{parsedName.name}</h1>
        <div className="mt-8 rounded-2xl bg-slate-950 p-7 text-white print:border print:border-slate-300 print:bg-white print:text-slate-950">
          <p className="text-sm text-slate-300 print:text-slate-500">Amount due</p>
          <p className="mt-2 text-4xl font-semibold">{amount || "—"} {token}</p>
          {reference && <p className="mt-5 border-t border-white/15 pt-5 print:border-slate-200">Reference: {reference}</p>}
          {memo && <p className="mt-2 text-slate-200 print:text-slate-700">{memo}</p>}
        </div>

        {legacyRequest && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 print:hidden">
            Unsigned legacy request: verify the amount and recipient independently before paying.
          </p>
        )}
        {requestError && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{requestError}</p>
        )}
        {wrongNetwork && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Switch your wallet to XDC Network (chain ID 50).
          </p>
        )}
        {signatureError && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{signatureError}</p>}
        {signedRequest && signedRequest.payer !== zeroAddress && isConnected && !payerAllowed && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This request is designated for a different payer wallet.
          </p>
        )}

        {signedRequest && !requestError && !signatureError && (
          <div className="mt-7 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <p className="text-sm font-semibold text-teal-900">Signed request verification</p>
            <p className="mt-2 break-all text-sm text-teal-800">
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

        {isConnected && (
          <div className="mt-7 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 print:hidden">
            <p className="text-sm font-semibold text-indigo-900">Wallet execution</p>
            <p className="mt-2 text-sm leading-6 text-indigo-800">
              {accountDeployment === "deployed-contract"
                ? "A deployed contract account is connected. Its wallet may submit this payment through ERC-4337."
                : "XDCID sends this payment request to your connected wallet. If it uses ERC-4337, the wallet handles its UserOperation and bundler."}
              {" "}Gas sponsorship depends on the wallet and its paymaster; XDCID does not control or store either service.
            </p>
          </div>
        )}

        <div className="mt-7 rounded-2xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700">Resolved recipient</p>
          <p className="mt-2 break-all text-sm text-slate-600">
            {!contractsConfigured
              ? "Contracts are not configured."
              : resolving
                ? "Resolving the XNS ID on-chain..."
                : resolutionFailed
                  ? "The registry status could not be verified."
                  : registry.status?.state === "legacy"
                    ? "Payment blocked: this name requires migration from XDCDomains."
                    : registry.status?.state === "collision"
                      ? "Payment blocked: this name exists in both registries and requires review."
                      : !hasOwner
                        ? "The XNS ID is unregistered or expired."
                        : paymentAddress || "No payment address is set for this XNS ID."}
          </p>
          {paymentAddress && (
            <a className="mt-3 inline-block text-sm font-semibold text-teal-700 underline print:hidden" href={"https://xdcscan.com/address/" + paymentAddress} target="_blank" rel="noreferrer">
              Verify recipient on XDCScan
            </a>
          )}
        </div>

        <button type="button" disabled={!canPay} onClick={pay} className="mt-7 w-full rounded-xl bg-slate-950 px-5 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 print:hidden">
          {pending ? "Waiting for confirmation..." : isConnected ? "Review " + (amount || "") + " " + token + " in wallet" : "Connect wallet to pay"}
        </button>

        {transactionHash && !receipt.isSuccess && (
          <a className="mt-4 block break-all text-sm font-semibold text-teal-700 underline" href={"https://xdcscan.com/tx/" + transactionHash} target="_blank" rel="noreferrer">
            View transaction on XDCScan
          </a>
        )}
        {paymentError && <p className="mt-4 text-sm text-red-600">{paymentError.message}</p>}

        {receipt.isSuccess && transactionHash && (
          <section className="mt-8 border-t border-slate-200 pt-8" aria-label="Payment confirmation receipt">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Payment confirmation</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">Confirmed on XDC Network</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-500">XNS ID</dt><dd className="mt-1 break-all text-slate-900">{parsedName.name}</dd></div>
              <div><dt className="font-semibold text-slate-500">Amount</dt><dd className="mt-1 text-slate-900">{amount} {token}</dd></div>
              {reference && <div><dt className="font-semibold text-slate-500">Reference</dt><dd className="mt-1 break-all text-slate-900">{reference}</dd></div>}
              <div><dt className="font-semibold text-slate-500">Recipient</dt><dd className="mt-1 break-all text-slate-900">{paymentAddress}</dd></div>
              <div><dt className="font-semibold text-slate-500">Payer</dt><dd className="mt-1 break-all text-slate-900">{receiptActors.payer || address}</dd></div>
              {receiptActors.networkSubmitter && <div><dt className="font-semibold text-slate-500">Network submitter</dt><dd className="mt-1 break-all text-slate-900">{receiptActors.networkSubmitter}</dd></div>}
              <div><dt className="font-semibold text-slate-500">Block</dt><dd className="mt-1 text-slate-900">{receipt.data?.blockNumber?.toString()}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Transaction hash</dt><dd className="mt-1 break-all text-slate-900">{transactionHash}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white">Print or save receipt</button>
              <a className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800" href={"https://xdcscan.com/tx/" + transactionHash} target="_blank" rel="noreferrer">Verify on XDCScan</a>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              This is evidence of blockchain confirmation shown with the signed request. It is not a tax invoice or accounting document.
            </p>
          </section>
        )}

        <p className="mt-7 text-xs leading-5 text-slate-500 print:hidden">
          Check the amount, token, and resolved address before signing. The reference and description are not written into the payment transaction.
        </p>
      </section>
    </main>
  );
}"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, isHex, zeroAddress, type Hex } from "viem";
import { useParams, useSearchParams } from "next/navigation";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { addresses, contractsConfigured, registrarAbi, registryAbi, resolverAbi } from "../../../config/contracts";
import { erc20TransferAbi, XDC_USDC_ADDRESS } from "../../../config/tokens";
import { parseXnsName } from "../../../lib/names";
import {
  inspectAccountDeployment,
  paymentReceiptActors,
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
  type PaymentRequest,
} from "../../../lib/paymentRequests";

export default function PayRequestPage() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const parsedName = useMemo(() => parseXnsName(params.name ?? ""), [params.name]);
  const encodedRequest = searchParams.get("request");
  const encodedSignature = searchParams.get("signature");

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
  const legacyRequest = !encodedRequest && !encodedSignature;
  const amount = signedRequest?.amount ?? searchParams.get("amount") ?? "";
  const token = signedRequest?.token ?? normalizePayToken(searchParams.get("token"));
  const memo = signedRequest?.description ?? searchParams.get("memo") ?? "";
  const reference = signedRequest?.reference ?? "";
  const expires = signedRequest ? (signedRequest.expires ? String(signedRequest.expires) : undefined) : searchParams.get("expires");
  const amountError = validatePayAmount(amount, token);
  const memoError = validatePayMemo(memo);
  const expiryError = validatePayExpiry(expires);
  const pathError = signedRequest && parsedName.isValid && signedRequest.name !== parsedName.name
    ? "The signed XNS ID does not match this checkout URL."
    : undefined;
  const requestError = !parsedName.isValid
    ? parsedName.error
    : signedPayload.error || pathError || amountError || memoError || expiryError;
  const value = useMemo(() => {
    try {
      return parsePayAmount(amount, token);
    } catch {
      return 0n;
    }
  }, [amount, token]);

  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [signatureVerification, setSignatureVerification] = useState<PaymentRequestSignatureVerification>();
  const [signatureChecking, setSignatureChecking] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [accountDeployment, setAccountDeployment] = useState<AccountDeploymentState>("unknown");
  const nativePayment = useSendTransaction();
  const tokenPayment = useWriteContract();
  const transactionHash = token === "USDC" ? tokenPayment.data : nativePayment.data;
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });

  const enabled = contractsConfigured && parsedName.isValid;
  const node = useReadContract({
    address: addresses.registrar,
    abi: registrarAbi,
    functionName: "nodeFor",
    args: [parsedName.name],
    query: { enabled },
  });
  const owner = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
  });
  const expiry = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "expiryOf",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
  });
  const resolvedAddress = useReadContract({
    address: addresses.resolver,
    abi: resolverAbi,
    functionName: "addresses",
    args: node.data ? [node.data] : undefined,
    query: { enabled: !!node.data },
  });

  useEffect(() => {
    let current = true;
    setSignatureVerification(undefined);
    setSignatureError("");
    setSignatureChecking(false);
    if (!signedRequest || !signedPayload.signature || !owner.data || !publicClient) return;

    setSignatureChecking(true);
    verifyPaymentRequestSignature(publicClient, signedRequest, signedPayload.signature, owner.data)
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
  }, [owner.data, publicClient, signedRequest, signedPayload.signature]);


  useEffect(() => {
    let current = true;
    setAccountDeployment("unknown");
    if (!address || !publicClient) return;
    inspectAccountDeployment(publicClient, address).then((deployment) => {
      if (current) setAccountDeployment(deployment);
    });
    return () => {
      current = false;
    };
  }, [address, publicClient]);

  const domainExpired = expiry.data ? expiry.data <= BigInt(Math.floor(Date.now() / 1000)) : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !domainExpired;
  const paymentAddress =
    resolvedAddress.data && resolvedAddress.data !== zeroAddress && isAddress(resolvedAddress.data)
      ? resolvedAddress.data
      : undefined;
  const resolving = node.isLoading || owner.isLoading || expiry.isLoading || resolvedAddress.isLoading;
  const resolutionFailed = node.isError || owner.isError || expiry.isError || resolvedAddress.isError;
  const signaturePending = Boolean(
    signedRequest && signedPayload.signature && !signatureError &&
    (!owner.data || !publicClient || signatureChecking || !signatureVerification),
  );
  const payerAllowed = signedRequest ? isDesignatedPayer(signedRequest, address) : true;
  const pending = nativePayment.isPending || tokenPayment.isPending || receipt.isLoading;
  const wrongNetwork = isConnected && chainId !== 50;
  const signedRequestValid = legacyRequest || Boolean(
    signedRequest && signatureVerification?.valid && !signatureError && payerAllowed,
  );
  const canPay = Boolean(
    isConnected && !wrongNetwork && !requestError && hasOwner && paymentAddress && value > 0n &&
    !pending && !signaturePending && signedRequestValid,
  );
  const paymentError = token === "USDC" ? tokenPayment.error : nativePayment.error;
  const receiptActors = paymentReceiptActors(address, receipt.data?.from);

  function pay() {
    if (!paymentAddress || !canPay) return;
    if (token === "USDC") {
      tokenPayment.writeContract({
        address: XDC_USDC_ADDRESS,
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [paymentAddress, value],
      });
    } else {
      nativePayment.sendTransaction({ to: paymentAddress, value });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-teal-700">XDCID Pay Link</p>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <p className="text-sm text-slate-500">Payment requested by</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-950">{parsedName.name}</h1>
        <div className="mt-8 rounded-2xl bg-slate-950 p-7 text-white print:border print:border-slate-300 print:bg-white print:text-slate-950">
          <p className="text-sm text-slate-300 print:text-slate-500">Amount due</p>
          <p className="mt-2 text-4xl font-semibold">{amount || "—"} {token}</p>
          {reference && <p className="mt-5 border-t border-white/15 pt-5 print:border-slate-200">Reference: {reference}</p>}
          {memo && <p className="mt-2 text-slate-200 print:text-slate-700">{memo}</p>}
        </div>

        {legacyRequest && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 print:hidden">
            Unsigned legacy request: verify the amount and recipient independently before paying.
          </p>
        )}
        {requestError && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{requestError}</p>
        )}
        {wrongNetwork && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Switch your wallet to XDC Network (chain ID 50).
          </p>
        )}
        {signatureError && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{signatureError}</p>}
        {signedRequest && signedRequest.payer !== zeroAddress && isConnected && !payerAllowed && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This request is designated for a different payer wallet.
          </p>
        )}

        {signedRequest && !requestError && !signatureError && (
          <div className="mt-7 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <p className="text-sm font-semibold text-teal-900">Signed request verification</p>
            <p className="mt-2 break-all text-sm text-teal-800">
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

        {isConnected && (
          <div className="mt-7 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 print:hidden">
            <p className="text-sm font-semibold text-indigo-900">Wallet execution</p>
            <p className="mt-2 text-sm leading-6 text-indigo-800">
              {accountDeployment === "deployed-contract"
                ? "A deployed contract account is connected. Its wallet may submit this payment through ERC-4337."
                : "XDCID sends this payment request to your connected wallet. If it uses ERC-4337, the wallet handles its UserOperation and bundler."}
              {" "}Gas sponsorship depends on the wallet and its paymaster; XDCID does not control or store either service.
            </p>
          </div>
        )}

        <div className="mt-7 rounded-2xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700">Resolved recipient</p>
          <p className="mt-2 break-all text-sm text-slate-600">
            {!contractsConfigured
              ? "Contracts are not configured."
              : resolving
                ? "Resolving the XNS ID on-chain..."
                : resolutionFailed
                  ? "The XNS ID could not be resolved."
                  : !hasOwner
                    ? "The XNS ID is unregistered or expired."
                    : paymentAddress || "No payment address is set for this XNS ID."}
          </p>
          {paymentAddress && (
            <a className="mt-3 inline-block text-sm font-semibold text-teal-700 underline print:hidden" href={"https://xdcscan.com/address/" + paymentAddress} target="_blank" rel="noreferrer">
              Verify recipient on XDCScan
            </a>
          )}
        </div>

        <button type="button" disabled={!canPay} onClick={pay} className="mt-7 w-full rounded-xl bg-slate-950 px-5 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 print:hidden">
          {pending ? "Waiting for confirmation..." : isConnected ? "Review " + (amount || "") + " " + token + " in wallet" : "Connect wallet to pay"}
        </button>

        {transactionHash && !receipt.isSuccess && (
          <a className="mt-4 block break-all text-sm font-semibold text-teal-700 underline" href={"https://xdcscan.com/tx/" + transactionHash} target="_blank" rel="noreferrer">
            View transaction on XDCScan
          </a>
        )}
        {paymentError && <p className="mt-4 text-sm text-red-600">{paymentError.message}</p>}

        {receipt.isSuccess && transactionHash && (
          <section className="mt-8 border-t border-slate-200 pt-8" aria-label="Payment confirmation receipt">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Payment confirmation</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">Confirmed on XDC Network</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-500">XNS ID</dt><dd className="mt-1 break-all text-slate-900">{parsedName.name}</dd></div>
              <div><dt className="font-semibold text-slate-500">Amount</dt><dd className="mt-1 text-slate-900">{amount} {token}</dd></div>
              {reference && <div><dt className="font-semibold text-slate-500">Reference</dt><dd className="mt-1 break-all text-slate-900">{reference}</dd></div>}
              <div><dt className="font-semibold text-slate-500">Recipient</dt><dd className="mt-1 break-all text-slate-900">{paymentAddress}</dd></div>
              <div><dt className="font-semibold text-slate-500">Payer</dt><dd className="mt-1 break-all text-slate-900">{receiptActors.payer || address}</dd></div>
              {receiptActors.networkSubmitter && <div><dt className="font-semibold text-slate-500">Network submitter</dt><dd className="mt-1 break-all text-slate-900">{receiptActors.networkSubmitter}</dd></div>}
              <div><dt className="font-semibold text-slate-500">Block</dt><dd className="mt-1 text-slate-900">{receipt.data?.blockNumber?.toString()}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Transaction hash</dt><dd className="mt-1 break-all text-slate-900">{transactionHash}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3 print:hidden">
              <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white">Print or save receipt</button>
              <a className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800" href={"https://xdcscan.com/tx/" + transactionHash} target="_blank" rel="noreferrer">Verify on XDCScan</a>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              This is evidence of blockchain confirmation shown with the signed request. It is not a tax invoice or accounting document.
            </p>
          </section>
        )}

        <p className="mt-7 text-xs leading-5 text-slate-500 print:hidden">
          Check the amount, token, and resolved address before signing. The reference and description are not written into the payment transaction.
        </p>
      </section>
    </main>
  );
}
