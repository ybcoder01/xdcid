"use client";

import { useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  isAddress,
  parseAbi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { mainnetPricingDeploymentArtifacts as artifacts } from "../../../generated/mainnetPricingDeployment";

const OWNER = getAddress("0xe82a4267CC310FC6Db334601671A043DFc8Ce06A");
const REGISTRY = getAddress("0x05fa64a05bc205DeDF47e023d2D90c2d119cd097");
const LEGACY = getAddress("0x295a7aB79368187a6CD03c464cfaAb04d799784E");
const CHAIN_ID = 50;
const STORAGE_KEY = "xdcid:mainnet-v2-deployment";

const chain = {
  id: CHAIN_ID,
  name: "XDC Network",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xdcrpc.com"] } },
  blockExplorers: { default: { name: "XDCScan", url: "https://xdcscan.com" } },
} as const;

const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function registrar() view returns (address)",
  "function setRegistrar(address newRegistrar)",
]);

type Addresses = {
  pricingPolicy: string;
  discountAuthorization: string;
  registrar: string;
  subdomainRegistrar: string;
};

type Status = {
  activeRegistrar: Address;
  consumer: Address;
  pendingConsumer: Address;
  pendingSigner: Address;
  activationTime: bigint;
  hasPending: boolean;
  delayElapsed: boolean;
};

const emptyAddresses: Addresses = {
  pricingPolicy: "",
  discountAuthorization: "",
  registrar: "",
  subdomainRegistrar: "",
};

export default function MainnetV2ActivationClient() {
  const [account, setAccount] = useState<Address>();
  const [addresses, setAddresses] = useState<Addresses>(emptyAddresses);
  useEffect(() => {
    try {
      setAddresses({ ...emptyAddresses, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") });
    } catch {
      setAddresses(emptyAddresses);
    }
  }, []);
  const [status, setStatus] = useState<Status>();
  const [message, setMessage] = useState(
    "Enter the four deployed addresses and connect the registry-owner hardware wallet.",
  );
  const [busy, setBusy] = useState(false);
  const [hashes, setHashes] = useState<{ discount?: Hex; registry?: Hex }>({});

  function update(key: keyof Addresses, value: string) {
    setAddresses((current) => ({ ...current, [key]: value }));
    setStatus(undefined);
  }

  async function connectAndCheck() {
    await run(async () => {
      const resolved = resolveAddresses(addresses);
      const provider = injectedProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) throw new Error("Select the current registry-owner wallet");
      await ensureMainnet(provider);
      const next = await preflight(provider, selected, resolved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
      setAccount(selected);
      setStatus(next);
      setMessage(messageFor(next, resolved.registrar));
    });
  }

  async function activateDiscountConfiguration() {
    if (!account || !status?.hasPending || !status.delayElapsed) return;
    await run(async () => {
      const resolved = resolveAddresses(addresses);
      const provider = injectedProvider();
      await ensureMainnet(provider);
      const checked = await preflight(provider, account, resolved);
      if (!checked.hasPending || !checked.delayElapsed) {
        throw new Error("The delayed discount configuration is not eligible yet");
      }
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const client = createPublicClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: resolved.discountAuthorization,
        abi: artifacts.discountAuthorization.abi,
        functionName: "activatePendingConfiguration",
      });
      setHashes((current) => ({ ...current, discount: hash }));
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("Discount activation failed");
      const next = await preflight(provider, account, resolved);
      setStatus(next);
      setMessage(messageFor(next, resolved.registrar));
    });
  }

  async function activateRegistrar() {
    if (!account || !status) return;
    await run(async () => {
      const resolved = resolveAddresses(addresses);
      const provider = injectedProvider();
      await ensureMainnet(provider);
      const checked = await preflight(provider, account, resolved);
      if (checked.consumer !== resolved.registrar) {
        throw new Error("Registrar V2 is not the active discount consumer");
      }
      const wallet = createWalletClient({ chain, transport: custom(provider) });
      const client = createPublicClient({ chain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain,
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setRegistrar",
        args: [resolved.registrar],
      });
      setHashes((current) => ({ ...current, registry: hash }));
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error("Registrar activation failed");
      const next = await preflight(provider, account, resolved);
      setStatus(next);
      setMessage(messageFor(next, resolved.registrar));
    });
  }

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const resolvedRegistrar = isAddress(addresses.registrar)
    ? getAddress(addresses.registrar)
    : undefined;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl space-y-7">
        <section className="rounded-3xl border border-rose-300 bg-rose-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-rose-800">XDC mainnet activation</p>
          <h1 className="mt-3 text-4xl font-semibold">Activate Registrar V2 safely</h1>
          <p className="mt-3 text-slate-700">
            Read-only preflight runs first. The discount configuration and registry activation remain two separate hardware-wallet transactions. The Subdomain Registrar requires no registry activation.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(addresses) as Array<keyof Addresses>).map((key) => (
              <label className="text-sm font-medium" key={key}>
                {labelFor(key)}
                <input className="mt-2 w-full rounded-xl border p-3 font-mono text-xs" value={addresses[key]} onChange={(event) => update(key, event.target.value)} placeholder="0x…" />
              </label>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Action label={account ? "Refresh preflight" : "Connect and run preflight"} onClick={connectAndCheck} disabled={busy} />
            <Action label="Activate discount configuration" onClick={activateDiscountConfiguration} disabled={!status?.hasPending || !status.delayElapsed || busy} warning />
            <Action label="Activate Registrar V2" onClick={activateRegistrar} disabled={!status || !resolvedRegistrar || status.consumer !== resolvedRegistrar || status.activeRegistrar === resolvedRegistrar || busy} />
          </div>
        </section>

        {status ? (
          <section className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold">Preflight result</h2>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <Detail label="Current registry registrar" value={status.activeRegistrar} />
              <Detail label="Active discount consumer" value={status.consumer} />
              <Detail label="Pending discount consumer" value={status.pendingConsumer} />
              <Detail label="Pending discount signer" value={status.pendingSigner} />
              <Detail label="Pending configuration" value={status.hasPending ? "Yes" : "No"} />
              <Detail label="Earliest activation" value={status.activationTime === 0n ? "None" : new Date(Number(status.activationTime) * 1000).toLocaleString()} />
            </dl>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Confirmed activation transactions</h2>
          {hashes.discount ? <Tx label="Discount configuration" hash={hashes.discount} /> : null}
          {hashes.registry ? <Tx label="Registry registrar" hash={hashes.registry} /> : null}
          {!hashes.discount && !hashes.registry ? <p className="mt-3 text-slate-600">No activation transaction submitted from this browser session.</p> : null}
        </section>
      </div>
    </main>
  );
}

async function preflight(
  provider: EIP1193Provider,
  account: Address,
  addresses: Record<keyof Addresses, Address>,
): Promise<Status> {
  const client = createPublicClient({ chain, transport: custom(provider) });
  for (const [label, address] of Object.entries(addresses)) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw new Error(`${label} has no contract code`);
  }
  const [
    registryOwner,
    activeRegistrar,
    registrarRegistry,
    registrarLegacy,
    registrarPolicy,
    registrarDiscount,
    registrarOwner,
    policyOwner,
    discountOwner,
    consumer,
    pendingConsumer,
    pendingSigner,
    activationTime,
    hasPending,
    subdomainOwner,
    subdomainRegistry,
    subdomainPolicy,
    block,
  ] = await Promise.all([
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
    client.readContract({ address: addresses.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: addresses.registrar, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: addresses.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: addresses.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: addresses.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: addresses.pricingPolicy, abi: artifacts.pricingPolicy.abi, functionName: "owner" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "pendingActivationTime" }),
    client.readContract({ address: addresses.discountAuthorization, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
    client.readContract({ address: addresses.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "owner" }),
    client.readContract({ address: addresses.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "registry" }),
    client.readContract({ address: addresses.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "pricingPolicy" }),
    client.getBlock(),
  ]);
  if (
    [registryOwner, registrarOwner, policyOwner, discountOwner, subdomainOwner]
      .some((owner) => getAddress(owner as Address) !== account) ||
    account !== OWNER
  ) throw new Error("The connected wallet does not own every required mainnet contract");
  if (
    getAddress(registrarRegistry as Address) !== REGISTRY ||
    getAddress(registrarLegacy as Address) !== LEGACY ||
    getAddress(registrarPolicy as Address) !== addresses.pricingPolicy ||
    getAddress(registrarDiscount as Address) !== addresses.discountAuthorization ||
    getAddress(subdomainRegistry as Address) !== REGISTRY ||
    getAddress(subdomainPolicy as Address) !== addresses.pricingPolicy
  ) throw new Error("A deployed contract points to an unexpected dependency");

  return {
    activeRegistrar: getAddress(activeRegistrar as Address),
    consumer: getAddress(consumer as Address),
    pendingConsumer: getAddress(pendingConsumer as Address),
    pendingSigner: getAddress(pendingSigner as Address),
    activationTime: BigInt(activationTime as bigint),
    hasPending: Boolean(hasPending),
    delayElapsed: Boolean(hasPending) && BigInt(block.timestamp) >= BigInt(activationTime as bigint),
  };
}

function resolveAddresses(values: Addresses): Record<keyof Addresses, Address> {
  for (const value of Object.values(values)) {
    if (!isAddress(value)) throw new Error("Enter all four valid deployment addresses");
  }
  return {
    pricingPolicy: getAddress(values.pricingPolicy),
    discountAuthorization: getAddress(values.discountAuthorization),
    registrar: getAddress(values.registrar),
    subdomainRegistrar: getAddress(values.subdomainRegistrar),
  };
}

function messageFor(status: Status, registrar: Address) {
  if (status.activeRegistrar === registrar) return "Registrar V2 is active. Keep the previous registrar address as the rollback target.";
  if (status.consumer === registrar) return "Preflight passed. Registrar V2 is eligible for the separate registry activation transaction.";
  if (status.hasPending && !status.delayElapsed) return `Preflight passed. Wait until ${new Date(Number(status.activationTime) * 1000).toLocaleString()} before activating the discount configuration.`;
  if (status.hasPending) return "Preflight passed. Activate the eligible discount configuration first.";
  return "Preflight passed, but Registrar V2 is not the active or pending discount consumer.";
}

function labelFor(key: keyof Addresses) {
  return ({ pricingPolicy: "Pricing Policy V2", discountAuthorization: "Discount Authorization", registrar: "Registrar V2", subdomainRegistrar: "Subdomain Registrar" })[key];
}

function Action(props: { label: string; onClick: () => void; disabled: boolean; warning?: boolean }) {
  return <button className={`${props.warning ? "bg-amber-600" : "bg-slate-950"} rounded-xl px-5 py-3 font-semibold text-white disabled:opacity-50`} onClick={props.onClick} disabled={props.disabled}>{props.label}</button>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function Tx({ label, hash }: { label: string; hash: Hex }) {
  return <p className="mt-3"><span className="font-semibold">{label}: </span><a className="break-all font-mono text-blue-700 underline" href={`https://xdcscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{hash}</a></p>;
}

function injectedProvider(): EIP1193Provider {
  const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No injected hardware-wallet provider was detected");
  return provider;
}

async function ensureMainnet(provider: EIP1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x32" }] });
  } catch {
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x32", chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http, blockExplorerUrls: [chain.blockExplorers.default.url] }] });
  }
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) {
    const first = cause.message.split("\n")[0];
    return first.length > 320 ? `${first.slice(0, 317)}…` : first;
  }
  return "The wallet operation failed";
}
