"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { isAddress, zeroAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { addresses, contractsConfigured, registrarAbi, registryAbi, resolverAbi } from "../../../config/contracts";
import { erc20TransferAbi, XDC_USDC_ADDRESS } from "../../../config/tokens";
import { parseXnsName } from "../../../lib/names";
import {
  normalizePayToken,
  parsePayAmount,
  validatePayAmount,
  validatePayExpiry,
  validatePayMemo,
} from "../../../lib/paylinks";

export default function PayRequestPage() {
  const params = useParams<{ name: string }>();
  const searchParams = useSearchParams();
  const parsedName = useMemo(() => parseXnsName(params.name ?? ""), [params.name]);
  const amount = searchParams.get("amount") ?? "";
  const token = normalizePayToken(searchParams.get("token"));
  const memo = searchParams.get("memo") ?? "";
  const expires = searchParams.get("expires");
  const amountError = validatePayAmount(amount, token);
  const memoError = validatePayMemo(memo);
  const expiryError = validatePayExpiry(expires);
  const requestError = !parsedName.isValid ? parsedName.error : amountError || memoError || expiryError;
  const value = useMemo(() => {
    try {
      return parsePayAmount(amount, token);
    } catch {
      return 0n;
    }
  }, [amount, token]);

  const { isConnected, chainId } = useAccount();
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

  const domainExpired = expiry.data ? expiry.data < BigInt(Math.floor(Date.now() / 1000)) : true;
  const hasOwner = !!owner.data && owner.data !== zeroAddress && !domainExpired;
  const paymentAddress =
    resolvedAddress.data && resolvedAddress.data !== zeroAddress && isAddress(resolvedAddress.data)
      ? resolvedAddress.data
      : undefined;
  const resolving = node.isLoading || owner.isLoading || expiry.isLoading || resolvedAddress.isLoading;
  const resolutionFailed = node.isError || owner.isError || expiry.isError || resolvedAddress.isError;
  const pending = nativePayment.isPending || tokenPayment.isPending || receipt.isLoading;
  const wrongNetwork = isConnected && chainId !== 50;
  const canPay = Boolean(
    isConnected && !wrongNetwork && !requestError && hasOwner && paymentAddress && value > 0n && !pending,
  );
  const paymentError = token === "USDC" ? tokenPayment.error : nativePayment.error;

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
      <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">Payment requested by</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-950">{parsedName.name}</h1>
        <div className="mt-8 rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-sm text-slate-300">Amount due</p>
          <p className="mt-2 text-4xl font-semibold">{amount || "—"} {token}</p>
          {memo && <p className="mt-5 border-t border-white/15 pt-5 text-slate-200">{memo}</p>}
        </div>

        {requestError && (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{requestError}</p>
        )}
        {wrongNetwork && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Switch your wallet to XDC Network (chain ID 50).
          </p>
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
            <a
              className="mt-3 inline-block text-sm font-semibold text-teal-700 underline"
              href={`https://xdcscan.com/address/${paymentAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              Verify recipient on XDCScan
            </a>
          )}
        </div>

        <button
          type="button"
          disabled={!canPay}
          onClick={pay}
          className="mt-7 w-full rounded-xl bg-slate-950 px-5 py-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Waiting for confirmation..." : isConnected ? `Review ${amount || ""} ${token} in wallet` : "Connect wallet to pay"}
        </button>

        {transactionHash && (
          <a
            className="mt-4 block break-all text-sm font-semibold text-teal-700 underline"
            href={`https://xdcscan.com/tx/${transactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction on XDCScan
          </a>
        )}
        {receipt.isSuccess && <p className="mt-4 text-sm font-semibold text-teal-700">Payment confirmed on XDC.</p>}
        {paymentError && <p className="mt-4 text-sm text-red-600">{paymentError.message}</p>}

        <p className="mt-7 text-xs leading-5 text-slate-500">
          Check the amount, token, and resolved address before signing. The memo is descriptive only and is not written on-chain.
        </p>
      </section>
    </main>
  );
}
