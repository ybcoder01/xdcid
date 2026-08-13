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
import { apothemRegistrarV2DeploymentArtifacts as artifacts } from "../../../generated/apothemRegistrarV2Deployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const LEGACY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const POLICY = getAddress("0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81");
const AUTHORIZATION = getAddress("0x37A013d55393f0824eFD40C648111f39D18C5F46");
const REGISTRAR = getAddress("0x506B82DaD0cf55d909D9C6F0edD5A7939339256d");
const CHAIN_ID = 51;

const chain = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: { default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" } },
} as const;

const registryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setRegistrar", stateMutability: "nonpayable", inputs: [{ name: "newRegistrar", type: "address" }], outputs: [] },
] as const;

type Status = {
  activeRegistrar: Address;
  consumer: Address;
  pendingConsumer: Address;
  pendingSigner: Address;
  activationTime: bigint;
  hasPending: boolean;
  delayElapsed: boolean;
};

export default function ApothemRegistrarV2ActivationClient() {
  const [account, setAccount] = useState<Address>();
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Connect the designated test wallet to run the read-only preflight.");
  const [hashes, setHashes] = useState<{ configuration?: Hex; registry?: Hex }>({});

  async function connectAndCheck() {
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error("Select the designated Apothem owner wallet");
      await ensureApothem(provider);
      const next = await preflight(provider, selected);
      setAccount(selected);
      setStatus(next);
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
  }

  async function activateConfiguration() {
    if (!account || !status?.hasPending || !status.delayElapsed || busy) return;
    setBusy(true);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      await preflight(provider, account);
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const publicClient = createPublicClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: AUTHORIZATION,
        abi: artifacts.discountAuthorization.abi,
        functionName: "activatePendingConfiguration",
      });
      setHashes((current) => ({ ...current, configuration: hash }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("Discount configuration activation failed");
      const next = await preflight(provider, account);
      setStatus(next);
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activateRegistrar() {
    if (!account || !status || status.consumer !== REGISTRAR || status.activeRegistrar === REGISTRAR || busy) return;
    setBusy(true);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const checked = await preflight(provider, account);
      if (checked.consumer !== REGISTRAR) throw new Error("Registrar is not the active discount consumer");
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const publicClient = createPublicClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setRegistrar",
        args: [REGISTRAR],
      });
      setHashes((current) => ({ ...current, registry: hash }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("Registry activation failed");
      const next = await preflight(provider, account);
      setStatus(next);
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-7">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">Apothem only</p>
          <h1 className="mt-3 text-4xl font-semibold">Activate Registrar V2 safely</h1>
          <p className="mt-3 text-slate-700">
            This page performs read-only dependency checks, then exposes two separate wallet transactions in the required order. It cannot deploy contracts or access a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Registry" value={REGISTRY} />
            <Detail label="Pricing policy" value={POLICY} />
            <Detail label="Discount authorization" value={AUTHORIZATION} />
            <Detail label="Registrar V2" value={REGISTRAR} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={connectAndCheck} disabled={busy}>
              {account ? "Refresh preflight" : "Connect and run preflight"}
            </button>
            <button className="rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={activateConfiguration} disabled={!status?.hasPending || !status?.delayElapsed || busy}>
              Activate discount configuration
            </button>
            <button className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50" onClick={activateRegistrar} disabled={!status || status.consumer !== REGISTRAR || status.activeRegistrar === REGISTRAR || busy}>
              Activate Registrar V2
            </button>
          </div>
        </section>

        {status ? (
          <section className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Preflight result</h2>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <Detail label="Current registry registrar" value={status.activeRegistrar} />
              <Detail label="Active discount consumer" value={status.consumer} />
              <Detail label="Pending consumer" value={status.pendingConsumer} />
              <Detail label="Pending signer" value={status.pendingSigner} />
              <Detail label="Pending configuration" value={status.hasPending ? "Yes" : "No"} />
              <Detail label="Activation time" value={status.activationTime === 0n ? "None" : new Date(Number(status.activationTime) * 1000).toLocaleString()} />
            </dl>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Confirmed transactions</h2>
          {hashes.configuration ? <Tx label="Discount configuration" hash={hashes.configuration} /> : null}
          {hashes.registry ? <Tx label="Registry activation" hash={hashes.registry} /> : null}
          {!hashes.configuration && !hashes.registry ? <p className="mt-3 text-slate-600">No activation transaction has been submitted.</p> : null}
        </section>
      </div>
    </main>
  );
}

async function preflight(provider: EIP1193Provider, account: Address): Promise<Status> {
  const client = createPublicClient({ chain, transport: custom(provider) });
  for (const [label, address] of [["registry", REGISTRY], ["legacy registry", LEGACY], ["pricing policy", POLICY], ["discount authorization", AUTHORIZATION], ["registrar", REGISTRAR]] as const) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw new Error(label + " has no contract code");
  }

  const [registryOwner, activeRegistrar, registrarRegistry, registrarLegacy, registrarPolicy, registrarAuthorization, registrarOwner, policyOwner, authorizationOwner, signer, consumer, pendingSigner, pendingConsumer, activationTime, hasPending, block] = await Promise.all([
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: POLICY, abi: artifacts.pricingPolicy.abi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "authorizationSigner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingActivationTime" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
    client.getBlock(),
  ]);

  const owned = [registryOwner, registrarOwner, policyOwner, authorizationOwner].every((value) => getAddress(value as Address) === account && account === OWNER);
  const linked = getAddress(registrarRegistry as Address) === REGISTRY && getAddress(registrarLegacy as Address) === LEGACY && getAddress(registrarPolicy as Address) === POLICY && getAddress(registrarAuthorization as Address) === AUTHORIZATION;
  if (!owned || !linked) throw new Error("Owner or Registrar V2 dependency validation failed");

  const result = {
    activeRegistrar: getAddress(activeRegistrar as Address),
    consumer: getAddress(consumer as Address),
    pendingConsumer: getAddress(pendingConsumer as Address),
    pendingSigner: getAddress(pendingSigner as Address),
    activationTime: BigInt(activationTime as bigint),
    hasPending: Boolean(hasPending),
    delayElapsed: BigInt(block.timestamp) >= BigInt(activationTime as bigint),
  };
  if (result.hasPending && (result.pendingConsumer !== REGISTRAR || result.pendingSigner !== getAddress(signer as Address))) {
    throw new Error("Pending discount configuration does not match Registrar V2");
  }
  return result;
}

function messageFor(status: Status) {
  if (status.activeRegistrar === REGISTRAR) return "Registrar V2 is active and the preflight passed.";
  if (status.consumer === REGISTRAR) return "Discount configuration is active. Registrar V2 is ready for registry activation.";
  if (status.hasPending && !status.delayElapsed) return "Preflight passed. The 48-hour discount-configuration delay is still active.";
  if (status.hasPending) return "Preflight passed. The discount configuration is ready to activate.";
  return "Preflight passed, but Registrar V2 is not the active or pending discount consumer.";
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function Tx({ label, hash }: { label: string; hash: Hex }) {
  return <p className="mt-3"><span className="font-semibold">{label}: </span><a className="break-all font-mono text-blue-700 underline" href={"https://testnet.xdcscan.com/tx/" + hash} target="_blank" rel="noreferrer">{hash}</a></p>;
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected browser wallet was detected");
  return provider;
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] });
  } catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x33", chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
  }
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 280 ? text.slice(0, 277) + "..." : text;
  }
  return "The wallet operation failed";
}
