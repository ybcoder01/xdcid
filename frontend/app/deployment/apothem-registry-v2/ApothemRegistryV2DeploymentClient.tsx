"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  getAddress,
  getContractAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
} from "viem";
import { apothemRegistryV2DeploymentArtifacts as artifacts } from "../../../generated/apothemRegistryV2Deployment";

const OWNER = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const CURRENT_REGISTRY = getAddress("0x2BeD8EB404e1BD8D690e3dD2Fd06F287e5A92Eb1");
const ORIGINAL_LEGACY_REGISTRY = getAddress("0xe7CfeC8729686CcB2FB25B8275D6bd6Bc68A4bf0");
const PRICING_POLICY = getAddress("0x90a719bCAD35EB1048b30e43CA3fC804A35e5c81");
const DISCOUNT_AUTHORIZATION = getAddress("0x37A013d55393f0824eFD40C648111f39D18C5F46");
const CURRENT_REGISTRAR = getAddress("0x506B82DaD0cf55d909D9C6F0edD5A7939339256d");
const CREATE2_DEPLOYER = getAddress("0x4e59b44847b379578588920ca78fbf26c0b4956c");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};
type Artifact = { abi: readonly unknown[]; bytecode: string };
type StepState = "pending" | "wallet" | "confirming" | "complete" | "failed";
type Step = {
  label: string;
  state: StepState;
  hash?: Hex;
  address?: Address;
  error?: string;
};
type Deployment = {
  registry: Address;
  forwardResolver: Address;
  reverseResolver: Address;
  registrar: Address;
  multichainResolver: Address;
  subdomainRegistrar: Address;
};

const initialSteps: Step[] = [
  { label: "Validate the existing Apothem control stack", state: "pending" },
  { label: "Deploy Registry V2 ownership anchor", state: "pending" },
  { label: "Deploy owner-bound Forward Resolver V2", state: "pending" },
  { label: "Deploy owner-verified Reverse Resolver V3", state: "pending" },
  { label: "Deploy primary-aware Registrar", state: "pending" },
  { label: "Deploy Multichain Resolver V2", state: "pending" },
  { label: "Deploy Registry V2-bound Subdomain Registrar", state: "pending" },
  { label: "Validate every immutable binding", state: "pending" },
  { label: "Initialize Registry V2 with its first Registrar", state: "pending" },
  { label: "Propose the Registrar as discount consumer", state: "pending" },
  { label: "Confirm resumable deployment state and delay", state: "pending" },
];

export default function ApothemRegistryV2DeploymentClient() {
  const [account, setAccount] = useState<Address>();
  const [deployment, setDeployment] = useState<Deployment>();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [activationTime, setActivationTime] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Connect the designated owner wallet to calculate addresses and run read-only checks.",
  );

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      current.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  async function connect() {
    try {
      const provider = injectedProvider();
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts[0]) throw new Error("Wallet returned no account");
      const selected = getAddress(accounts[0]);
      if (selected !== OWNER) {
        throw new Error("Select the designated Apothem owner wallet");
      }
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider),
      });
      await validateDependencies(publicClient, selected);
      const predicted = predictDeployment();
      await validateExistingPredictions(publicClient, predicted);
      setAccount(selected);
      setDeployment(predicted);
      updateStep(0, { state: "complete", error: undefined });
      setMessage(
        "Preflight passed. Review all six deterministic addresses below before starting the wallet sequence.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      updateStep(0, { state: "failed", error });
      setMessage(error);
    }
  }

  async function deploy() {
    if (!account || !deployment || busy) return;
    setBusy(true);
    setActivationTime(0n);
    setSteps((current) => [
      { ...current[0], state: "complete", error: undefined },
      ...initialSteps.slice(1),
    ]);

    try {
      const provider = injectedProvider();
      await ensureApothem(provider);
      const publicClient = createPublicClient({
        chain: apothem,
        transport: custom(provider),
      });
      const walletClient = createWalletClient({
        chain: apothem,
        transport: custom(provider),
      });
      const signer = await validateDependencies(publicClient, account);
      const send = (data: Hex) =>
        walletClient.sendTransaction({
          account,
          chain: apothem,
          to: CREATE2_DEPLOYER,
          data,
          value: 0n,
        });

      await deployOne({
        artifact: artifacts.registry,
        args: [OWNER, CURRENT_REGISTRY],
        saltValue: salt(24001),
        expected: deployment.registry,
        stepIndex: 1,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.forwardResolver,
        args: [deployment.registry],
        saltValue: salt(24002),
        expected: deployment.forwardResolver,
        stepIndex: 2,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.reverseResolver,
        args: [deployment.registry],
        saltValue: salt(24003),
        expected: deployment.reverseResolver,
        stepIndex: 3,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.registrar,
        args: [
          deployment.registry,
          ORIGINAL_LEGACY_REGISTRY,
          PRICING_POLICY,
          DISCOUNT_AUTHORIZATION,
          deployment.reverseResolver,
          OWNER,
        ],
        saltValue: salt(24004),
        expected: deployment.registrar,
        stepIndex: 4,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.multichainResolver,
        args: [deployment.registry, deployment.reverseResolver],
        saltValue: salt(24005),
        expected: deployment.multichainResolver,
        stepIndex: 5,
        publicClient,
        send,
        updateStep,
      });
      await deployOne({
        artifact: artifacts.subdomainRegistrar,
        args: [deployment.registry, PRICING_POLICY, OWNER],
        saltValue: salt(24006),
        expected: deployment.subdomainRegistrar,
        stepIndex: 6,
        publicClient,
        send,
        updateStep,
      });

      updateStep(7, { state: "confirming" });
      await validateDeployment(publicClient, deployment);
      updateStep(7, { state: "complete" });

      updateStep(8, { state: "wallet", address: deployment.registrar });
      const registrarHash = await initializeRegistrar({
        publicClient,
        deployment,
        send: () =>
          walletClient.writeContract({
            account,
            chain: apothem,
            address: deployment.registry,
            abi: artifacts.registry.abi,
            functionName: "setRegistrar",
            args: [deployment.registrar],
          }),
      });
      if (registrarHash) {
        updateStep(8, {
          state: "confirming",
          hash: registrarHash,
          address: deployment.registrar,
        });
        await successfulReceipt(publicClient, registrarHash, "Registrar initialization");
      }
      updateStep(8, {
        state: "complete",
        address: deployment.registrar,
        ...(registrarHash ? { hash: registrarHash } : {}),
      });

      updateStep(9, { state: "wallet", address: deployment.registrar });
      const proposalHash = await ensureConsumerProposal({
        publicClient,
        registrar: deployment.registrar,
        authorizationSigner: signer,
        send: () =>
          walletClient.writeContract({
            account,
            chain: apothem,
            address: DISCOUNT_AUTHORIZATION,
            abi: artifacts.discountAuthorization.abi,
            functionName: "proposeConfiguration",
            args: [signer, deployment.registrar],
          }),
      });
      if (proposalHash) {
        updateStep(9, {
          state: "confirming",
          hash: proposalHash,
          address: deployment.registrar,
        });
        await successfulReceipt(publicClient, proposalHash, "Discount proposal");
      }
      updateStep(9, {
        state: "complete",
        address: deployment.registrar,
        ...(proposalHash ? { hash: proposalHash } : {}),
      });

      updateStep(10, { state: "confirming" });
      await validateDeployment(publicClient, deployment, true);
      const pendingTime = await validateProposal(
        publicClient,
        deployment.registrar,
        signer,
      );
      setActivationTime(pendingTime);
      updateStep(10, { state: "complete" });
      setMessage(
        "Registry V2 and its modules are deployed and internally initialized. The existing app remains on the old Registry. Wait for the discount delay, verify the contracts, and only then switch the dev environment.",
      );
    } catch (cause) {
      const error = errorMessage(cause);
      setMessage(error);
      setSteps((current) => {
        const failing = current.findIndex(
          (step) => step.state === "wallet" || step.state === "confirming",
        );
        return failing < 0
          ? current
          : current.map((step, index) =>
              index === failing ? { ...step, state: "failed", error } : step,
            );
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 sm:p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Apothem only · one-time ownership migration
          </p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
            Deploy the stable Registry V2 stack
          </h1>
          <p className="mt-3 text-slate-700">
            This protected preview deploys a long-lived Registry and six
            replaceable modules. It never changes production, reads a private
            key, activates the discount consumer, or switches the dev app.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Designated owner wallet" value={OWNER} />
            <Detail label="Current Registry (legacy source)" value={CURRENT_REGISTRY} />
            <Detail label="Original collision Registry" value={ORIGINAL_LEGACY_REGISTRY} />
            <Detail label="Reused Pricing Policy" value={PRICING_POLICY} />
            <Detail label="Reused Discount Authorization" value={DISCOUNT_AUTHORIZATION} />
            <Detail label="Current active Registrar" value={CURRENT_REGISTRAR} />
          </dl>
          <p className="mt-5 rounded-xl bg-slate-100 p-4">{message}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              className="rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={connect}
              disabled={busy}
            >
              {account ? "Owner wallet verified" : "Connect and run preflight"}
            </button>
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
              onClick={deploy}
              disabled={!account || !deployment || busy}
            >
              {busy ? "Transaction sequence in progress..." : "Deploy reviewed addresses"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Deterministic contract addresses</h2>
          <p className="mt-2 text-sm text-slate-600">
            These addresses are calculated before any transaction. Reopening
            the page produces the same addresses and safely resumes completed steps.
          </p>
          {deployment ? (
            <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
              <Detail label="Registry V2" value={deployment.registry} />
              <Detail label="Forward Resolver V2" value={deployment.forwardResolver} />
              <Detail label="Reverse Resolver V3" value={deployment.reverseResolver} />
              <Detail label="Primary Registrar" value={deployment.registrar} />
              <Detail label="Multichain Resolver V2" value={deployment.multichainResolver} />
              <Detail label="Subdomain Registrar" value={deployment.subdomainRegistrar} />
            </dl>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed p-4 text-slate-600">
              Run preflight to calculate and inspect the addresses.
            </p>
          )}
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Transaction sequence</h2>
          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.label} className="rounded-xl border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <span>{index + 1}. {step.label}</span>
                  <span className="font-semibold">{step.state}</span>
                </div>
                {step.hash ? <TransactionLink hash={step.hash} /> : null}
                {step.address ? (
                  <p className="mt-2 break-all font-mono text-sm">{step.address}</p>
                ) : null}
                {step.error ? (
                  <p className="mt-2 break-words text-sm text-red-700">{step.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm sm:p-7">
          <h2 className="text-2xl font-semibold">Dev configuration after activation</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-white">
            {JSON.stringify(environmentValues(deployment), null, 2)}
          </pre>
          <p className="mt-4 text-sm text-slate-600">
            Do not apply these values until every contract is verified and the
            delayed discount-consumer configuration has been activated.
          </p>
          {activationTime > 0n ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Earliest discount activation: {new Date(Number(activationTime) * 1000).toLocaleString()}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function predictDeployment(): Deployment {
  const registry = predictedAddress(artifacts.registry, [OWNER, CURRENT_REGISTRY], salt(24001));
  const forwardResolver = predictedAddress(artifacts.forwardResolver, [registry], salt(24002));
  const reverseResolver = predictedAddress(artifacts.reverseResolver, [registry], salt(24003));
  const registrar = predictedAddress(
    artifacts.registrar,
    [registry, ORIGINAL_LEGACY_REGISTRY, PRICING_POLICY, DISCOUNT_AUTHORIZATION, reverseResolver, OWNER],
    salt(24004),
  );
  const multichainResolver = predictedAddress(
    artifacts.multichainResolver,
    [registry, reverseResolver],
    salt(24005),
  );
  const subdomainRegistrar = predictedAddress(
    artifacts.subdomainRegistrar,
    [registry, PRICING_POLICY, OWNER],
    salt(24006),
  );
  return {
    registry,
    forwardResolver,
    reverseResolver,
    registrar,
    multichainResolver,
    subdomainRegistrar,
  };
}

function predictedAddress(
  artifact: Artifact,
  args: readonly unknown[],
  saltValue: Hex,
): Address {
  const data = encodeDeployData({
    abi: artifact.abi as Abi,
    bytecode: artifact.bytecode as Hex,
    args,
  });
  return getAddress(
    getContractAddress({
      bytecode: data,
      from: CREATE2_DEPLOYER,
      opcode: "CREATE2",
      salt: saltValue,
    }),
  );
}

async function deployOne(input: {
  artifact: Artifact;
  args: readonly unknown[];
  saltValue: Hex;
  expected: Address;
  stepIndex: number;
  publicClient: PublicClient;
  send: (data: Hex) => Promise<Hex>;
  updateStep: (index: number, patch: Partial<Step>) => void;
}) {
  const data = encodeDeployData({
    abi: input.artifact.abi as Abi,
    bytecode: input.artifact.bytecode as Hex,
    args: input.args,
  });
  const predicted = predictedAddress(input.artifact, input.args, input.saltValue);
  if (predicted !== input.expected) {
    throw new Error("Deterministic address changed unexpectedly");
  }
  input.updateStep(input.stepIndex, { state: "wallet", address: predicted });
  const existingCode = await input.publicClient.getCode({ address: predicted });
  let hash: Hex | undefined;
  if (!existingCode || existingCode === "0x") {
    hash = await input.send(`${input.saltValue}${data.slice(2)}` as Hex);
    input.updateStep(input.stepIndex, {
      state: "confirming",
      hash,
      address: predicted,
    });
    await successfulReceipt(input.publicClient, hash, "Contract deployment");
  }
  await requireCode(input.publicClient, predicted, "deployed contract");
  input.updateStep(input.stepIndex, {
    state: "complete",
    address: predicted,
    ...(hash ? { hash } : {}),
  });
}

async function validateDependencies(
  client: PublicClient,
  account: Address,
): Promise<Address> {
  for (const [label, address] of [
    ["current Registry", CURRENT_REGISTRY],
    ["original collision Registry", ORIGINAL_LEGACY_REGISTRY],
    ["Pricing Policy", PRICING_POLICY],
    ["Discount Authorization", DISCOUNT_AUTHORIZATION],
    ["current Registrar", CURRENT_REGISTRAR],
    ["CREATE2 deployer", CREATE2_DEPLOYER],
  ] as const) {
    await requireCode(client, address, label);
  }

  const registryAbi = artifacts.registry.abi;
  const [registryOwner, activeRegistrar, policyOwner, authorizationOwner, signer, consumer] =
    await Promise.all([
      client.readContract({ address: CURRENT_REGISTRY, abi: registryAbi, functionName: "owner" }),
      client.readContract({ address: CURRENT_REGISTRY, abi: registryAbi, functionName: "registrar" }),
      client.readContract({ address: PRICING_POLICY, abi: artifacts.registrar.abi, functionName: "owner" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "owner" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "authorizationSigner" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
    ]);
  if (
    account !== OWNER ||
    getAddress(registryOwner as Address) !== OWNER ||
    getAddress(policyOwner as Address) !== OWNER ||
    getAddress(authorizationOwner as Address) !== OWNER
  ) {
    throw new Error("The connected wallet does not own every reused Apothem control contract");
  }
  if (
    getAddress(activeRegistrar as Address) !== CURRENT_REGISTRAR ||
    getAddress(consumer as Address) !== CURRENT_REGISTRAR
  ) {
    throw new Error("The current Apothem Registrar or discount consumer changed unexpectedly");
  }
  return getAddress(signer as Address);
}

async function validateExistingPredictions(
  client: PublicClient,
  deployment: Deployment,
) {
  const codes = await Promise.all(
    Object.values(deployment).map((address) => client.getCode({ address })),
  );
  const deployedCount = codes.filter((code) => code && code !== "0x").length;
  if (deployedCount === Object.keys(deployment).length) {
    await validateDeployment(client, deployment);
  }
}

async function validateDeployment(
  client: PublicClient,
  deployment: Deployment,
  requireRegistrar = false,
) {
  for (const [label, address] of Object.entries(deployment)) {
    await requireCode(client, address, label);
  }
  const [
    registryOwner,
    legacyRegistry,
    activeRegistrar,
    forwardRegistry,
    reverseRegistry,
    registrarRegistry,
    registrarLegacy,
    registrarPolicy,
    registrarAuthorization,
    registrarReverse,
    registrarOwner,
    multichainRegistry,
    multichainReverse,
    subdomainRegistry,
    subdomainPolicy,
    subdomainOwner,
  ] = await Promise.all([
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "owner" }),
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: deployment.registry, abi: artifacts.registry.abi, functionName: "registrar" }),
    client.readContract({ address: deployment.forwardResolver, abi: artifacts.forwardResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.reverseResolver, abi: artifacts.reverseResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "registry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "legacyRegistry" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "discountAuthorization" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "primaryNameResolver" }),
    client.readContract({ address: deployment.registrar, abi: artifacts.registrar.abi, functionName: "owner" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "registry" }),
    client.readContract({ address: deployment.multichainResolver, abi: artifacts.multichainResolver.abi, functionName: "reverseResolver" }),
    client.readContract({ address: deployment.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "registry" }),
    client.readContract({ address: deployment.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "pricingPolicy" }),
    client.readContract({ address: deployment.subdomainRegistrar, abi: artifacts.subdomainRegistrar.abi, functionName: "owner" }),
  ]);
  const registrar = getAddress(activeRegistrar as Address);
  if (
    getAddress(registryOwner as Address) !== OWNER ||
    getAddress(legacyRegistry as Address) !== CURRENT_REGISTRY ||
    (registrar !== ZERO_ADDRESS && registrar !== deployment.registrar) ||
    (requireRegistrar && registrar !== deployment.registrar) ||
    getAddress(forwardRegistry as Address) !== deployment.registry ||
    getAddress(reverseRegistry as Address) !== deployment.registry ||
    getAddress(registrarRegistry as Address) !== deployment.registry ||
    getAddress(registrarLegacy as Address) !== ORIGINAL_LEGACY_REGISTRY ||
    getAddress(registrarPolicy as Address) !== PRICING_POLICY ||
    getAddress(registrarAuthorization as Address) !== DISCOUNT_AUTHORIZATION ||
    getAddress(registrarReverse as Address) !== deployment.reverseResolver ||
    getAddress(registrarOwner as Address) !== OWNER ||
    getAddress(multichainRegistry as Address) !== deployment.registry ||
    getAddress(multichainReverse as Address) !== deployment.reverseResolver ||
    getAddress(subdomainRegistry as Address) !== deployment.registry ||
    getAddress(subdomainPolicy as Address) !== PRICING_POLICY ||
    getAddress(subdomainOwner as Address) !== OWNER
  ) {
    throw new Error("A deployed contract has an unexpected owner or immutable binding");
  }
}

async function initializeRegistrar(input: {
  publicClient: PublicClient;
  deployment: Deployment;
  send: () => Promise<Hex>;
}): Promise<Hex | undefined> {
  const current = getAddress(
    (await input.publicClient.readContract({
      address: input.deployment.registry,
      abi: artifacts.registry.abi,
      functionName: "registrar",
    })) as Address,
  );
  if (current === input.deployment.registrar) return undefined;
  if (current !== ZERO_ADDRESS) {
    throw new Error("Registry V2 was initialized with an unexpected Registrar");
  }
  return input.send();
}

async function ensureConsumerProposal(input: {
  publicClient: PublicClient;
  registrar: Address;
  authorizationSigner: Address;
  send: () => Promise<Hex>;
}): Promise<Hex | undefined> {
  const [consumer, hasPending, pendingSigner, pendingConsumer] = await Promise.all([
    input.publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
    input.publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
    input.publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
    input.publicClient.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
  ]);
  if (getAddress(consumer as Address) === input.registrar) return undefined;
  if (Boolean(hasPending)) {
    if (
      getAddress(pendingSigner as Address) !== input.authorizationSigner ||
      getAddress(pendingConsumer as Address) !== input.registrar
    ) {
      throw new Error("A different discount configuration is already pending");
    }
    return undefined;
  }
  return input.send();
}

async function validateProposal(
  client: PublicClient,
  registrar: Address,
  signer: Address,
): Promise<bigint> {
  const [consumer, hasPending, pendingSigner, pendingConsumer, pendingActivationTime] =
    await Promise.all([
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "consumer" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "hasPendingConfiguration" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingAuthorizationSigner" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingConsumer" }),
      client.readContract({ address: DISCOUNT_AUTHORIZATION, abi: artifacts.discountAuthorization.abi, functionName: "pendingActivationTime" }),
    ]);
  if (getAddress(consumer as Address) === registrar) return 0n;
  if (
    !Boolean(hasPending) ||
    getAddress(pendingSigner as Address) !== signer ||
    getAddress(pendingConsumer as Address) !== registrar
  ) {
    throw new Error("The pending discount configuration could not be verified");
  }
  return BigInt(pendingActivationTime as bigint);
}

async function successfulReceipt(
  client: PublicClient,
  hash: Hex,
  label: string,
) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    confirmations: 2,
    timeout: 180_000,
  });
  if (receipt.status !== "success") throw new Error(`${label} failed`);
}

function environmentValues(deployment?: Deployment) {
  return {
    NEXT_PUBLIC_XNS_REGISTRY: deployment?.registry,
    NEXT_PUBLIC_XNS_REGISTRAR: deployment?.registrar,
    NEXT_PUBLIC_XNS_RESOLVER_V2: deployment?.forwardResolver,
    NEXT_PUBLIC_XNS_REVERSE_RESOLVER_V2: deployment?.reverseResolver,
    NEXT_PUBLIC_XNS_MULTICHAIN_RESOLVER: deployment?.multichainResolver,
    NEXT_PUBLIC_XNS_SUBDOMAIN_REGISTRAR: deployment?.subdomainRegistrar,
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-mono">{value}</dd>
    </div>
  );
}

function TransactionLink({ hash }: { hash: Hex }) {
  return (
    <a
      className="mt-2 block break-all font-mono text-sm text-blue-700 underline"
      href={`https://testnet.xdcscan.com/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
    >
      {hash}
    </a>
  );
}

async function requireCode(
  client: PublicClient,
  address: Address,
  label: string,
) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${label} has no contract code`);
}

function salt(value: number) {
  return (`0x${value.toString(16).padStart(64, "0")}`) as Hex;
}

function injectedProvider(): EIP1193Provider {
  const injected = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!injected) throw new Error("MetaMask was not detected");
  const providers = injected.providers ?? [injected];
  const metamask = providers.find(
    (provider: MetaMaskProvider) =>
      provider.isMetaMask === true && provider.isRabby !== true,
  );
  if (!metamask) {
    throw new Error("Enable the MetaMask extension to continue on Apothem");
  }
  return metamask;
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x33" }],
    });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x33",
        chainName: apothem.name,
        nativeCurrency: apothem.nativeCurrency,
        rpcUrls: apothem.rpcUrls.default.http,
        blockExplorerUrls: [apothem.blockExplorers.default.url],
      }],
    });
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    const text = cause.message.split("\n")[0];
    return text.length > 320 ? `${text.slice(0, 317)}...` : text;
  }
  return "The deployment operation failed";
}
