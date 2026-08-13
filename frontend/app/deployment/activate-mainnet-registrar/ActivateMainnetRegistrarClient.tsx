"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";

const OWNER = getAddress("0xe82a4267CC310FC6Db334601671A043DFc8Ce06A");
const REGISTRY = getAddress("0x05fa64a05bc205DeDF47e023d2D90c2d119cd097");
const CURRENT_REGISTRAR = getAddress("0x6955Be33d0B414784F9d3a6E71BAc1bb9B376cD7");
const NEW_REGISTRAR = getAddress("0xa1584cb17523CEb991155328EdFAD2293b66bd94");
const CHAIN_ID = 50;

const xdcMainnet = {
  id: CHAIN_ID,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xdcrpc.com"] } },
  blockExplorers: { default: { name: "XDCScan", url: "https://xdcscan.com" } },
} as const;

const registryAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "registrar",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setRegistrar",
    stateMutability: "nonpayable",
    inputs: [{ name: "registrar_", type: "address" }],
    outputs: [],
  },
] as const;

type Status = "idle" | "ready" | "wallet" | "confirming" | "complete" | "failed";

export default function ActivateMainnetRegistrarClient() {
  const [account, setAccount] = useState<Address>();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Connect the owner wallet to repeat the read-only checks.");
  const [hash, setHash] = useState<Hex>();

  async function connect() {
    try {
      setStatus("idle");
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error("Select the current XDCID owner wallet");
      await ensureXdcMainnet(provider);
      const publicClient = createPublicClient({ chain: xdcMainnet, transport: custom(provider) });
      await validate(publicClient, selected, false);
      setAccount(selected);
      setStatus("ready");
      setMessage("Preflight passed. Activation will replace only the registry registrar pointer.");
    } catch (cause) {
      setStatus("failed");
      setMessage(errorMessage(cause));
    }
  }

  async function activate() {
    if (!account || status !== "ready") return;
    try {
      setStatus("wallet");
      setMessage("Review the transaction in Rabby. It must call setRegistrar on the XDCID registry with zero XDC value.");
      const provider = injectedProvider();
      await ensureXdcMainnet(provider);
      const publicClient = createPublicClient({ chain: xdcMainnet, transport: custom(provider) });
      const walletClient = createWalletClient({ chain: xdcMainnet, transport: custom(provider) });
      await validate(publicClient, account, false);

      const transactionHash = await walletClient.writeContract({
        account,
        chain: xdcMainnet,
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setRegistrar",
        args: [NEW_REGISTRAR],
      });
      setHash(transactionHash);
      setStatus("confirming");
      setMessage("Transaction submitted. Waiting for two confirmations.");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 2,
        timeout: 180_000,
      });
      if (receipt.status !== "success") throw new Error("Activation transaction reverted");
      await validate(publicClient, account, true);
      setStatus("complete");
      setMessage("Activation confirmed. The registry now uses the signed-quote registrar.");
    } catch (cause) {
      setStatus("failed");
      setMessage(errorMessage(cause));
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            XDC mainnet — one-time activation
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Activate the signed-quote registrar</h1>
          <p className="mt-3 text-slate-700">
            This temporary page can perform exactly one registry update. It never reads,
            transmits, or stores a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Registry" value={REGISTRY} />
            <Detail label="Owner wallet" value={OWNER} />
            <Detail label="Current / rollback registrar" value={CURRENT_REGISTRAR} />
            <Detail label="New signed-quote registrar" value={NEW_REGISTRAR} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={connect}
              disabled={status === "wallet" || status === "confirming" || status === "complete"}
            >
              {account ? "Owner wallet verified" : "Connect owner wallet"}
            </button>
            <button
              className="rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={activate}
              disabled={!account || status !== "ready"}
            >
              Activate registrar in Rabby
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Expected transaction: to {REGISTRY}, value 0 XDC, new registrar {NEW_REGISTRAR}.
          </p>
          {hash ? (
            <a
              className="mt-4 block break-all font-mono text-sm text-blue-700 underline"
              href={"https://xdcscan.com/tx/" + hash}
              target="_blank"
              rel="noreferrer"
            >
              {hash}
            </a>
          ) : null}
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Recovery</h2>
          <p className="mt-3 text-slate-700">
            If post-activation testing finds a problem, the owner can restore the previous
            registrar at {CURRENT_REGISTRAR}. No contract redeployment is required.
          </p>
        </section>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}

async function validate(
  publicClient: ReturnType<typeof createPublicClient>,
  account: Address,
  expectActivated: boolean,
) {
  const [registryCode, newRegistrarCode, owner, activeRegistrar] = await Promise.all([
    publicClient.getCode({ address: REGISTRY }),
    publicClient.getCode({ address: NEW_REGISTRAR }),
    publicClient.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
    publicClient.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
  ]);
  if (!registryCode || registryCode === "0x") throw new Error("Registry has no contract code");
  if (!newRegistrarCode || newRegistrarCode === "0x") throw new Error("New registrar has no contract code");
  if (getAddress(owner) !== OWNER || account !== OWNER) throw new Error("Connected wallet is not the registry owner");
  const expected = expectActivated ? NEW_REGISTRAR : CURRENT_REGISTRAR;
  if (getAddress(activeRegistrar) !== expected) {
    throw new Error(expectActivated ? "Registry did not retain the new registrar" : "Current registrar changed since preflight");
  }
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected browser wallet was detected");
  return provider;
}

async function ensureXdcMainnet(provider: EIP1193Provider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(chainId, 16) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x32" }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x32",
        chainName: xdcMainnet.name,
        nativeCurrency: xdcMainnet.nativeCurrency,
        rpcUrls: xdcMainnet.rpcUrls.default.http,
        blockExplorerUrls: [xdcMainnet.blockExplorers.default.url],
      }],
    });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 320 ? text.slice(0, 317) + "..." : text;
  }
  return "The wallet operation failed";
}
