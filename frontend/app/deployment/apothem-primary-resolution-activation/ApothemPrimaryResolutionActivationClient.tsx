"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient
} from "viem";
import { apothemPrimaryResolutionDeploymentArtifacts as artifacts } from "../../../generated/apothemPrimaryResolutionDeployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const LEGACY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const POLICY = getAddress("0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81");
const AUTHORIZATION = getAddress("0x37A013d55393f0824eFD40C648111f39D18C5F46");
const PREVIOUS_REGISTRAR = getAddress("0x506B82DaD0cf55d909D9C6F0edD5A7939339256d");
const REGISTRAR = getAddress("0xE35722cB7d04Ba36ed284910528A64B1dE855a20");
const REVERSE_RESOLVER = getAddress("0x1ff9B9c9463a2d85029bdD3AFC99a8cf51260Ee2");
const MULTICHAIN_RESOLVER = getAddress("0x2212Fc40Feda6e8DD7030E9B70B38c7EB79f6989");
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" }
  }
} as const;

const registryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setRegistrar", stateMutability: "nonpayable", inputs: [{ name: "newRegistrar", type: "address" }], outputs: [] }
] as const;

const ownableAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }
] as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};

type Status = {
  activeRegistrar: Address;
  consumer: Address;
  pendingConsumer: Address;
  pendingSigner: Address;
  activationTime: bigint;
  blockTimestamp: bigint;
  hasPending: boolean;
  delayElapsed: boolean;
};

type Hashes = {
  configuration?: Hex;
  registry?: Hex;
};

export default function ApothemPrimaryResolutionActivationClient() {
  const [account, setAccount] = useState<Address>();
  const [status, setStatus] = useState<Status>();
  const [hashes, setHashes] = useState<Hashes>({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState(
    "Connect the designated Apothem owner wallet to run the read-only activation preflight."
  );

  useEffect(() => {
    if (!status?.hasPending || status.delayElapsed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.delayElapsed, status?.hasPending]);

  const remainingSeconds = status
    ? Math.max(0, Number(status.activationTime) - Math.floor(now / 1_000))
    : 0;
  const delayElapsed = Boolean(
    status && (status.delayElapsed || (status.hasPending && remainingSeconds === 0))
  );

  async function connectAndCheck() {
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({
        method: "eth_requestAccounts"
      })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) {
        throw new Error("Select the designated Apothem owner wallet");
      }
      await ensureApothem(provider);
      const next = await preflight(provider, selected);
      setAccount(selected);
      setStatus(next);
      setNow(Date.now());
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    }
  }

  async function activateConfiguration() {
    if (!account || !status?.hasPending || !delayElapsed || busy) return;
    setBusy(true);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const checked = await preflight(provider, account);
      if (!checked.hasPending || !checked.delayElapsed) {
        throw new Error("The 48-hour discount configuration delay has not elapsed");
      }

      const wallet = createWalletClient({ chain: apothem, transport: custom(provider) });
      const client = createPublicClient({ chain: apothem, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain: apothem,
        address: AUTHORIZATION,
        abi: artifacts.discountAuthorization.abi,
        functionName: "activatePendingConfiguration"
      });
      setHashes((current) => ({ ...current, configuration: hash }));
      await successfulReceipt(client, hash, "Discount configuration activation failed");

      const next = await preflight(provider, account);
      setStatus(next);
      setNow(Date.now());
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function activateRegistrar() {
    if (
      !account ||
      !status ||
      status.consumer !== REGISTRAR ||
      status.activeRegistrar === REGISTRAR ||
      busy
    ) {
      return;
    }
    setBusy(true);
    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const checked = await preflight(provider, account);
      if (checked.consumer !== REGISTRAR) {
        throw new Error("The new Registrar is not the active discount consumer");
      }
      if (checked.activeRegistrar !== PREVIOUS_REGISTRAR) {
        throw new Error("The Registry registrar changed after the preflight");
      }

      const wallet = createWalletClient({ chain: apothem, transport: custom(provider) });
      const client = createPublicClient({ chain: apothem, transport: custom(provider) });
      const hash = await wallet.writeContract({
        account,
        chain: apothem,
        address: REGISTRY,
        abi: registryAbi,
        functionName: "setRegistrar",
        args: [REGISTRAR]
      });
      setHashes((current) => ({ ...current, registry: hash }));
      await successfulReceipt(client, hash, "Registry activation failed");

      const next = await preflight(provider, account);
      setStatus(next);
      setNow(Date.now());
      setMessage(messageFor(next));
    } catch (cause) {
      setMessage(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Apothem only · activation stage
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Activate primary owner resolution
          </h1>
          <p className="mt-3 max-w-3xl text-slate-700">
            This guarded page validates the complete deployed stack and exposes
            two separate wallet transactions in the required order. It cannot
            deploy contracts, bypass the 48-hour delay, or access a private key.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Activation controls</h2>
          <p className="mt-3 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700" role="status">
            {message}
          </p>

          {status?.hasPending ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">48-hour safety delay</p>
              <p className="mt-1 text-sm text-amber-800">
                {delayElapsed
                  ? "Elapsed — the discount configuration can be activated."
                  : formatCountdown(remainingSeconds) + " remaining"}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Earliest activation: {formatTimestamp(status.activationTime)}
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ActionButton onClick={connectAndCheck} disabled={busy}>
              {account ? "Refresh preflight" : "Connect and run preflight"}
            </ActionButton>
            <ActionButton
              onClick={activateConfiguration}
              disabled={!status?.hasPending || !delayElapsed || busy}
              tone="warning"
            >
              Activate discount configuration
            </ActionButton>
            <ActionButton
              onClick={activateRegistrar}
              disabled={
                !status ||
                status.consumer !== REGISTRAR ||
                status.activeRegistrar === REGISTRAR ||
                busy
              }
              tone="success"
            >
              Activate new Registrar
            </ActionButton>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Verified deployment</h2>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Registry" value={REGISTRY} />
            <Detail label="Previous Registrar" value={PREVIOUS_REGISTRAR} />
            <Detail label="New primary-aware Registrar" value={REGISTRAR} />
            <Detail label="Reverse Resolver V3" value={REVERSE_RESOLVER} />
            <Detail label="Multichain Resolver V2" value={MULTICHAIN_RESOLVER} />
            <Detail label="Discount Authorization" value={AUTHORIZATION} />
          </dl>
        </section>

        {status ? (
          <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-semibold">On-chain preflight</h2>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
              <Detail label="Current Registry Registrar" value={status.activeRegistrar} />
              <Detail label="Active discount consumer" value={status.consumer} />
              <Detail label="Pending consumer" value={status.pendingConsumer} />
              <Detail label="Pending signer" value={status.pendingSigner} />
              <Detail label="Pending configuration" value={status.hasPending ? "Yes" : "No"} />
              <Detail label="Delay elapsed" value={delayElapsed ? "Yes" : "No"} />
            </dl>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold">Confirmed transactions</h2>
          {hashes.configuration ? (
            <Transaction label="Discount configuration" hash={hashes.configuration} />
          ) : null}
          {hashes.registry ? (
            <Transaction label="Registry activation" hash={hashes.registry} />
          ) : null}
          {!hashes.configuration && !hashes.registry ? (
            <p className="mt-3 text-sm text-slate-600">No activation transaction has been submitted.</p>
          ) : null}
        </section>

        {status?.activeRegistrar === REGISTRAR ? (
          <section className="rounded-3xl border border-teal-300 bg-teal-50 p-6 sm:p-7">
            <h2 className="text-xl font-semibold text-teal-950">Activation complete</h2>
            <p className="mt-2 text-sm text-teal-900">
              Update the Preview quote service to use the new Registrar, redeploy
              dev, and then run registration, primary-ID, resolution, transfer,
              renewal, and rejected-transaction smoke tests.
            </p>
            <code className="mt-4 block break-all rounded-xl bg-white p-4 text-sm text-teal-950">
              XNS_SIGNED_QUOTE_REGISTRAR={REGISTRAR}
            </code>
          </section>
        ) : null}
      </div>
    </main>
  );
}

async function preflight(
  provider: EIP1193Provider,
  account: Address
): Promise<Status> {
  const client = createPublicClient({ chain: apothem, transport: custom(provider) });
  await validateCode(client);

  const [
    registryOwner,
    activeRegistrar,
    registrarRegistry,
    registrarLegacy,
    registrarPolicy,
    registrarAuthorization,
    registrarReverseResolver,
    registrarOwner,
    reverseRegistry,
    multichainRegistry,
    multichainReverseResolver,
    policyOwner,
    authorizationOwner,
    signer,
    consumer,
    pendingSigner,
    pendingConsumer,
    activationTime,
    hasPending,
    block
  ] = await Promise.all([
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner" }),
    client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "registrar" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "primaryNameResolver" }),
    client.readContract({ address: REGISTRAR, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: REVERSE_RESOLVER, abi: artifacts.reverseResolver.abi, functionName: "registry" }),
    client.readContract({ address: MULTICHAIN_RESOLVER, abi: artifacts.multichainResolver.abi, functionName: "registry" }),
    client.readContract({ address: MULTICHAIN_RESOLVER, abi: artifacts.multichainResolver.abi, functionName: "reverseResolver" }),
    client.readContract({ address: POLICY, abi: ownableAbi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "authorizationSigner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingActivationTime" }),
    client.readContract({ address: AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
    client.getBlock()
  ]);

  const owned = [registryOwner, registrarOwner, policyOwner, authorizationOwner].every(
    (value) => getAddress(value as Address) === account && account === OWNER
  );
  if (!owned) throw new Error("An owner address does not match the designated wallet");

  const linked =
    getAddress(registrarRegistry as Address) === REGISTRY &&
    getAddress(registrarLegacy as Address) === LEGACY &&
    getAddress(registrarPolicy as Address) === POLICY &&
    getAddress(registrarAuthorization as Address) === AUTHORIZATION &&
    getAddress(registrarReverseResolver as Address) === REVERSE_RESOLVER &&
    getAddress(reverseRegistry as Address) === REGISTRY &&
    getAddress(multichainRegistry as Address) === REGISTRY &&
    getAddress(multichainReverseResolver as Address) === REVERSE_RESOLVER;
  if (!linked) throw new Error("A deployed contract has an unexpected immutable dependency");

  const normalizedActiveRegistrar = getAddress(activeRegistrar as Address);
  const normalizedConsumer = getAddress(consumer as Address);
  if (
    normalizedActiveRegistrar !== PREVIOUS_REGISTRAR &&
    normalizedActiveRegistrar !== REGISTRAR
  ) {
    throw new Error("The Registry registrar changed unexpectedly");
  }
  if (
    normalizedConsumer !== PREVIOUS_REGISTRAR &&
    normalizedConsumer !== REGISTRAR
  ) {
    throw new Error("The active discount consumer changed unexpectedly");
  }
  if (normalizedActiveRegistrar === REGISTRAR && normalizedConsumer !== REGISTRAR) {
    throw new Error("Unsafe state: the Registry changed before the discount consumer");
  }

  const result: Status = {
    activeRegistrar: normalizedActiveRegistrar,
    consumer: normalizedConsumer,
    pendingConsumer: getAddress(pendingConsumer as Address),
    pendingSigner: getAddress(pendingSigner as Address),
    activationTime: BigInt(activationTime as bigint),
    blockTimestamp: BigInt(block.timestamp),
    hasPending: Boolean(hasPending),
    delayElapsed: BigInt(block.timestamp) >= BigInt(activationTime as bigint)
  };
  if (
    result.hasPending &&
    (result.pendingConsumer !== REGISTRAR ||
      result.pendingSigner !== getAddress(signer as Address))
  ) {
    throw new Error("The pending discount configuration does not match this rollout");
  }
  return result;
}

async function validateCode(client: PublicClient) {
  const deployments = [
    ["Registry", REGISTRY],
    ["legacy Registry", LEGACY],
    ["Pricing Policy", POLICY],
    ["Discount Authorization", AUTHORIZATION],
    ["new Registrar", REGISTRAR],
    ["Reverse Resolver V3", REVERSE_RESOLVER],
    ["Multichain Resolver V2", MULTICHAIN_RESOLVER]
  ] as const;
  const code = await Promise.all(
    deployments.map(([, address]) => client.getCode({ address }))
  );
  const missing = code.findIndex((value) => !value || value === "0x");
  if (missing >= 0) throw new Error(deployments[missing][0] + " has no contract code");
}

async function successfulReceipt(
  client: PublicClient,
  hash: Hex,
  failureMessage: string
) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
    timeout: 180_000
  });
  if (receipt.status !== "success") throw new Error(failureMessage);
}

function messageFor(status: Status) {
  if (status.activeRegistrar === REGISTRAR) {
    return "Primary owner resolution is active and every dependency passed verification.";
  }
  if (status.consumer === REGISTRAR) {
    return "The discount configuration is active. The new Registrar is ready for Registry activation.";
  }
  if (status.hasPending && !status.delayElapsed) {
    return "Preflight passed. The 48-hour discount-configuration delay is still active.";
  }
  if (status.hasPending) {
    return "Preflight passed. Activate the discount configuration before changing the Registry Registrar.";
  }
  return "Preflight passed, but the new Registrar is not the active or pending discount consumer.";
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "default"
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  tone?: "default" | "warning" | "success";
}) {
  const color =
    tone === "warning"
      ? "bg-amber-600"
      : tone === "success"
        ? "bg-teal-700"
        : "bg-slate-950";
  return (
    <button
      type="button"
      className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 ${color}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 break-all font-mono text-slate-900">{value}</dd>
    </div>
  );
}

function Transaction({ label, hash }: { label: string; hash: Hex }) {
  return (
    <p className="mt-3 text-sm">
      <span className="font-semibold">{label}: </span>
      <a
        className="break-all font-mono text-blue-700 underline"
        href={`https://testnet.xdcscan.com/tx/${hash}`}
        target="_blank"
        rel="noreferrer"
      >
        {hash}
      </a>
    </p>
  );
}

function formatTimestamp(value: bigint) {
  if (value === 0n) return "None";
  return new Date(Number(value) * 1_000).toLocaleString();
}

function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [days ? `${days}d` : "", `${hours}h`, `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(" ");
}

function injectedProvider(): EIP1193Provider {
  const root = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!root) throw new Error("No injected browser wallet was detected");
  if (!root.providers?.length) return root;
  return root.providers.find((provider: MetaMaskProvider) => provider.isRabby)
    ?? root.providers.find((provider: MetaMaskProvider) => provider.isMetaMask)
    ?? root.providers[0];
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x33" }]
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x33",
        chainName: apothem.name,
        nativeCurrency: apothem.nativeCurrency,
        rpcUrls: apothem.rpcUrls.default.http,
        blockExplorerUrls: [apothem.blockExplorers.default.url]
      }]
    });
  }
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 300 ? text.slice(0, 297) + "..." : text;
  }
  return "The wallet operation failed";
}
