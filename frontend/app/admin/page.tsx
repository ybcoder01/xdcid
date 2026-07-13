"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, formatEther, http, isAddress } from "viem";
import { addresses, registrarAbi, xdcMainnet } from "../../config/contracts";

type BrowserEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const publicClient = createPublicClient({
  chain: xdcMainnet,
  transport: http(xdcMainnet.rpcUrls.default.http[0])
});

function getEthereum() {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: BrowserEthereum }).ethereum;
}

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState("");
  const [owner, setOwner] = useState("");
  const [balance, setBalance] = useState<bigint | undefined>();
  const [recipient, setRecipient] = useState("");
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  const isOwner = useMemo(
    () => !!account && !!owner && owner.toLowerCase() === account.toLowerCase(),
    [account, owner]
  );
  const canWithdraw = isOwner && isAddress(recipient) && !!balance && balance > 0n && !withdrawing;

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const [contractOwner, contractBalance] = await Promise.all([
        publicClient.readContract({
          address: addresses.registrar,
          abi: registrarAbi,
          functionName: "owner"
        }),
        publicClient.getBalance({ address: addresses.registrar })
      ]);

      setOwner(contractOwner);
      setBalance(contractBalance);

      const ethereum = getEthereum();
      if (ethereum) {
        const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
        const connected = accounts[0] || "";
        setAccount(connected);
        if (connected && !recipient) setRecipient(connected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setError("No browser wallet found");
      return;
    }

    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const connected = accounts[0] || "";
      setAccount(connected);
      if (connected && !recipient) setRecipient(connected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed");
    }
  }

  async function withdraw() {
    const ethereum = getEthereum();
    if (!ethereum || !canWithdraw) return;

    setWithdrawing(true);
    setError("");
    setHash("");

    try {
      const walletClient = createWalletClient({
        chain: xdcMainnet,
        transport: custom(ethereum)
      });
      const [walletAccount] = await walletClient.requestAddresses();
      const txHash = await walletClient.writeContract({
        address: addresses.registrar,
        abi: registrarAbi,
        functionName: "withdraw",
        args: [recipient as `0x${string}`],
        account: walletAccount
      });

      setHash(txHash);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Withdraw transaction failed");
    } finally {
      setWithdrawing(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner only</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Owner access required</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Connect the registrar owner wallet to view withdrawal controls.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              disabled={!mounted || loading}
              onClick={connect}
            >
              {account ? "Wallet connected" : loading ? "Checking access..." : "Connect owner wallet"}
            </button>
          </div>

          {account && owner && account.toLowerCase() !== owner.toLowerCase() ? (
            <p className="mt-4 text-xs text-red-600">Connected wallet is not the registrar owner.</p>
          ) : null}
          {error ? <p className="mt-4 text-xs text-red-600">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Owner controls</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 md:text-4xl">Admin dashboard</h1>
          <p className="mt-2 text-sm text-neutral-600">Withdraw XDC registration and renewal revenue held by the registrar contract.</p>

          <div className="mt-8 grid gap-4">
            <div className="rounded-md border border-black/10 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Registrar balance</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {balance !== undefined ? `${formatEther(balance)} XDC` : loading ? "Loading..." : "Unavailable"}
              </p>
              <p className="mt-2 break-all text-xs text-neutral-500">{addresses.registrar}</p>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-950">Withdraw to</span>
              <input
                className="rounded-md border border-black/10 bg-white px-3 py-3"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x recipient address"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-md border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-neutral-50 disabled:opacity-50"
                disabled={!mounted}
                onClick={connect}
              >
                {account ? "Wallet connected" : "Connect owner wallet"}
              </button>
              <button
                className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={!canWithdraw}
                onClick={withdraw}
              >
                {withdrawing ? "Withdrawing..." : "Withdraw all funds"}
              </button>
            </div>

            {hash ? <p className="break-all text-xs text-neutral-500">Transaction sent: {hash}</p> : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
        </div>

        <aside className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Access check</p>
          <div className="mt-6 grid gap-4 text-sm">
            <div>
              <p className="text-slate-300">Connected wallet</p>
              <p className="mt-1 break-all">{account || "Not connected"}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Registrar owner</p>
              <p className="mt-1 break-all">{owner || (loading ? "Loading..." : "Unavailable")}</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-slate-300">Status</p>
              <p className="mt-1">{isOwner ? "Owner wallet connected" : "Connect owner wallet to withdraw"}</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
