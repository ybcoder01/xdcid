"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { XDC_WRITE_GAS_LIMITS, xdcWriteOverrides } from "../../../lib/xdcWriteGas";

const TEST_WALLET = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRAR = getAddress("0xa2135729ce122ef93158FCc4C69683155e6707d3");
const CHAIN_ID = 51;

const apothem = {
  id: CHAIN_ID,
  name: "XDC Apothem",
  nativeCurrency: { name: "TXDC", symbol: "TXDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://erpc.apothem.network"] } },
  blockExplorers: {
    default: { name: "XDCScan Testnet", url: "https://testnet.xdcscan.com" },
  },
} as const;

const registrarAbi = parseAbi([
  "function pricingPolicy() view returns (address)",
  "function registry() view returns (address)",
  "function registrationsPaused() view returns (bool)",
  "function parentOperators(bytes32 parentNode,address parentOwner,address operator) view returns (bool)",
  "function nonces(address) view returns (uint256)",
  "function available(string parentName,string label) view returns (bool)",
  "function nodeFor(string parentName,string label) pure returns (bytes32)",
  "function parentNodeFor(string parentName) pure returns (bytes32)",
  "function ownerOf(bytes32 node) view returns (address)",
  "function addressOf(bytes32 node,uint256 chainId) view returns (address)",
  "function records(bytes32 node) view returns (address owner,bytes32 parentNode,uint256 expiry)",
  "function registerWithQuote(string parentName,string label,(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline) quote,bytes quoteSignature) payable",
  "function renewWithQuote(string parentName,string label,(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline) quote,bytes quoteSignature) payable",
  "function setAddress(bytes32 node,uint256 chainId,address destination)",
  "function transferSubdomain(bytes32 node,address newOwner)",
  "function assignSubdomain(string parentName,string label,address newOwner)",
  "function reclaimSubdomain(string parentName,string label)",
  "function releaseSubdomain(string parentName,string label)",
  "function setParentOperator(string parentName,address operator,bool approved)",
]);

const policyAbi = parseAbi([
  "function version() view returns (uint256)",
  "function parentNodeFor(string parentName) pure returns (bytes32)",
  "function isQuoteAuthorizationValid(address signer,uint256 quoteVersion) view returns (bool)",
  "function priceUsdMicros(uint8 product,uint256 labelLength,uint256 years_) view returns (uint256)",
  "function config() view returns ((uint64 twoCharacterAnnualUsdMicros,uint64 threeCharacterAnnualUsdMicros,uint64 fourCharacterAnnualUsdMicros,uint64 standardAnnualUsdMicros,uint64 subdomainAnnualUsdMicros,uint64 premiumSubdomainAnnualUsdMicros,uint64 migrationUsdMicros,uint16 threeYearDiscountBps,uint16 fiveYearDiscountBps,uint16 tenYearDiscountBps,uint16 xdcQuoteBufferBps,address quoteSigner,address usdcToken,address treasury,bool xdcPaymentsEnabled,bool usdcPaymentsEnabled))",
]);

const registryAbi = parseAbi([
  "function ownerOf(bytes32 node) view returns (address)",
  "function expiryOf(bytes32 node) view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);

const quoteTypes = {
  SubdomainQuote: [
    { name: "node", type: "bytes32" },
    { name: "parentNode", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "subdomainOwner", type: "address" },
    { name: "termYears", type: "uint256" },
    { name: "paymentToken", type: "address" },
    { name: "paymentAmount", type: "uint256" },
    { name: "usdMicros", type: "uint256" },
    { name: "policyVersion", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "issuedAt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

type MetaMaskProvider = EIP1193Provider & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: MetaMaskProvider[];
};

type Currency = "TXDC" | "USDC";
type Status = {
  node?: Hex;
  available?: boolean;
  owner?: Address;
  expiry?: bigint;
  destination?: Address;
};

type Diagnostic = {
  label: string;
  passed: boolean;
  detail: string;
};

type PreparedQuote = {
  action: "registerWithQuote" | "renewWithQuote";
  parentName: string;
  label: string;
  currency: Currency;
  quote: {
    node: Hex;
    parentNode: Hex;
    payer: Address;
    subdomainOwner: Address;
    termYears: bigint;
    paymentToken: Address;
    paymentAmount: bigint;
    usdMicros: bigint;
    policyVersion: bigint;
    nonce: bigint;
    issuedAt: bigint;
    deadline: bigint;
  };
  signature: Hex;
  usdcToken: Address;
};

export default function ApothemSubdomainTestingClient() {
  const [account, setAccount] = useState<Address>();
  const [parentName, setParentName] = useState("testing123.xdc");
  const [label, setLabel] = useState("pay");
  const [termYears, setTermYears] = useState(1);
  const [currency, setCurrency] = useState<Currency>("TXDC");
  const [subdomainOwner, setSubdomainOwner] = useState<string>(TEST_WALLET);
  const [payerAddress, setPayerAddress] = useState<string>(TEST_WALLET);
  const [recordChainId, setRecordChainId] = useState(51);
  const [recordAddress, setRecordAddress] = useState<string>(TEST_WALLET);
  const [newOwner, setNewOwner] = useState("");
  const [operator, setOperatorAddress] = useState("");
  const [status, setStatus] = useState<Status>({});
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [prepared, setPrepared] = useState<PreparedQuote>();
  const [message, setMessage] = useState("Connect MetaMask to run the read-only preflight.");
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<Hex>();

  async function connect() {
    await run(async () => {
      const { provider, account: selected, publicClient } = await clients();
      await requireCode(publicClient);
      setAccount(selected);
      setSubdomainOwner((current) => current || selected);
      setPayerAddress(selected);
      setRecordAddress((current) => current || selected);
      setMessage("MetaMask, Apothem, and the registrar are connected. Refresh state before preparing a quote.");
      await refreshWith(publicClient, selected);
      void provider;
    });
  }

  async function refresh() {
    await run(async () => {
      const { account: selected, publicClient } = await clients(false);
      await refreshWith(publicClient, selected);
      setMessage("On-chain subdomain state refreshed.");
    });
  }

  async function preparePaidAction(
    action: "registerWithQuote" | "renewWithQuote",
  ) {
    await run(async () => {
      const { account: signer, publicClient, walletClient } = await clients();
      if (!isAddress(payerAddress)) {
        throw new Error("Enter a valid payer wallet address");
      }
      if (action === "registerWithQuote" && !isAddress(subdomainOwner)) {
        throw new Error("Enter a valid subdomain owner address");
      }

      const policy = await publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "pricingPolicy",
      });
      const version = await publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "version",
      });
      const authorized = await publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "isQuoteAuthorizationValid",
        args: [signer, version],
      });
      if (!authorized) {
        throw new Error(
          "Switch MetaMask to the authorized Apothem quote-signer wallet before preparing the quote",
        );
      }

      const owner =
        action === "renewWithQuote" && status.owner && status.owner !== zeroAddress
          ? status.owner
          : getAddress(subdomainOwner);
      const parent = canonicalParent();
      const child = canonicalLabel();
      const signed = await signedQuote(
        publicClient,
        walletClient,
        signer,
        getAddress(payerAddress),
        owner,
      );
      setPrepared({
        action,
        parentName: parent,
        label: child,
        currency,
        ...signed,
      });
      setMessage(
        "Quote prepared. Switch MetaMask to payer " +
          getAddress(payerAddress) +
          " and click Submit.",
      );
    });
  }

  async function submitPaidAction(
    action: "registerWithQuote" | "renewWithQuote",
  ) {
    await run(async () => {
      if (!prepared || prepared.action !== action) {
        throw new Error("Prepare a fresh " + (action === "registerWithQuote" ? "registration" : "renewal") + " quote first");
      }
      const { account: selected, publicClient, walletClient } = await clients();
      if (selected !== prepared.quote.payer) {
        throw new Error("Switch MetaMask to the prepared payer wallet " + prepared.quote.payer);
      }
      if (BigInt(Math.floor(Date.now() / 1_000)) > prepared.quote.deadline) {
        setPrepared(undefined);
        throw new Error("The prepared quote expired. Switch to the quote signer and prepare a new one");
      }

      if (prepared.currency === "USDC") {
        const approvalGas = await xdcWriteOverrides(
          publicClient,
          CHAIN_ID,
          XDC_WRITE_GAS_LIMITS.erc20Approval,
        );
        const approval = await walletClient.writeContract({
          account: selected,
          chain: apothem,
          address: prepared.usdcToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [REGISTRAR, prepared.quote.paymentAmount],
          ...approvalGas,
        });
        setMessage("USDC approval submitted. Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approval, confirmations: 1 });
      }

      const paidActionGas = await xdcWriteOverrides(
        publicClient,
        CHAIN_ID,
        action === "registerWithQuote"
          ? XDC_WRITE_GAS_LIMITS.subdomainRegistration
          : XDC_WRITE_GAS_LIMITS.subdomainRenewal,
      );
      const request = {
        account: selected,
        chain: apothem,
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: action,
        args: [
          prepared.parentName,
          prepared.label,
          prepared.quote,
          prepared.signature,
        ],
        value: prepared.currency === "TXDC" ? prepared.quote.paymentAmount : 0n,
        ...paidActionGas,
      } as const;

      setMessage("Running " + (action === "registerWithQuote" ? "registration" : "renewal") + " preflight...");
      try {
        await publicClient.simulateContract(request);
      } catch (cause) {
        throw new Error("Transaction preflight failed: " + errorMessage(cause));
      }

      setMessage("Preflight passed. Confirm the transaction in MetaMask.");
      const hash = await walletClient.writeContract(request);
      await confirm(publicClient, hash);
      setPrepared(undefined);
      setAccount(selected);
      await refreshWith(publicClient, selected);
      setMessage(
        action === "registerWithQuote"
          ? "Subdomain registration confirmed."
          : "Subdomain renewal confirmed.",
      );
    });
  }

  async function setDestination() {
    if (!isAddress(recordAddress)) {
      throw new Error("Enter a valid destination address");
    }
    await write("setAddress", [requiredNode(), BigInt(recordChainId), getAddress(recordAddress)]);
  }

  async function transfer() {
    if (!isAddress(newOwner)) throw new Error("Enter a valid new owner address");
    await write("transferSubdomain", [requiredNode(), getAddress(newOwner)]);
  }

  async function assign() {
    if (!isAddress(newOwner)) throw new Error("Enter a valid assignee address");
    await write("assignSubdomain", [
      canonicalParent(),
      canonicalLabel(),
      getAddress(newOwner),
    ]);
  }

  async function reclaim() {
    await write("reclaimSubdomain", [canonicalParent(), canonicalLabel()]);
  }

  async function release() {
    await write("releaseSubdomain", [canonicalParent(), canonicalLabel()]);
  }

  async function updateOperator(approved: boolean) {
    if (!isAddress(operator)) throw new Error("Enter a valid operator address");
    await write("setParentOperator", [canonicalParent(), getAddress(operator), approved]);
  }

  async function write(
    functionName:
      | "setAddress"
      | "transferSubdomain"
      | "assignSubdomain"
      | "reclaimSubdomain"
      | "releaseSubdomain"
      | "setParentOperator",
    args: readonly unknown[],
  ) {
    await run(async () => {
      const { account: selected, publicClient, walletClient } = await clients();
      const recordGas = await xdcWriteOverrides(
        publicClient,
        CHAIN_ID,
        XDC_WRITE_GAS_LIMITS.recordUpdate,
      );
      const request = {
        account: selected,
        chain: apothem,
        address: REGISTRAR,
        abi: registrarAbi,
        functionName,
        args: args as never,
        ...recordGas,
      } as const;

      setMessage("Running contract preflight...");
      try {
        await publicClient.simulateContract(request);
      } catch (cause) {
        throw new Error("Contract preflight failed: " + errorMessage(cause));
      }

      setMessage("Preflight passed. Confirm the transaction in MetaMask.");
      const hash = await walletClient.writeContract(request);
      await confirm(publicClient, hash);
      await refreshWith(publicClient, selected);
      setMessage(functionName + " confirmed.");
    });
  }

  async function confirm(publicClient: ReturnType<typeof createPublicClient>, hash: Hex) {
    setLastHash(hash);
    setMessage("Transaction submitted. Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 180_000,
    });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
  }

  async function refreshWith(
    publicClient: ReturnType<typeof createPublicClient>,
    selected: Address,
  ) {
    const parent = canonicalParent();
    const child = canonicalLabel();
    const [node, available] = await Promise.all([
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "nodeFor",
        args: [parent, child],
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "available",
        args: [parent, child],
      }),
    ]);
    const [owner, record, destination] = await Promise.all([
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "ownerOf",
        args: [node],
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "records",
        args: [node],
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "addressOf",
        args: [node, BigInt(recordChainId)],
      }),
    ]);
    setStatus({
      node,
      available,
      owner: owner,
      expiry: record[2],
      destination,
    });
    await diagnoseRegistration(publicClient, selected, available);
  }

  async function diagnoseRegistration(
    publicClient: ReturnType<typeof createPublicClient>,
    selected: Address,
    available: boolean,
  ) {
    const parent = canonicalParent();
    const parentNode = keccak256(toBytes(parent));
    const [registry, policy, paused] = await Promise.all([
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "registry",
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "pricingPolicy",
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "registrationsPaused",
      }),
    ]);
    const [parentOwner, parentExpiry, approvedOperator, config, policyPrice] = await Promise.all([
      publicClient.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [parentNode],
      }),
      publicClient.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [parentNode],
      }),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "parentOperators",
        args: [parentNode, await publicClient.readContract({
          address: registry,
          abi: registryAbi,
          functionName: "ownerOf",
          args: [parentNode],
        }), selected],
      }),
      publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "config",
      }),
      publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "priceUsdMicros",
        args: [2, 1n, BigInt(termYears)],
      }),
    ]);

    let apiPrice = 0n;
    let quoteAvailable = false;
    try {
      const response = await fetch(
        "/api/v1/pricing/quote?product=subdomain&years=" + termYears,
        { cache: "no-store" },
      );
      const body = await response.json() as {
        data?: { pricing?: { totalMicros?: string }; xdc?: { wei?: string } };
      };
      apiPrice = BigInt(body.data?.pricing?.totalMicros || "0");
      quoteAvailable = response.ok && apiPrice > 0n &&
        (currency !== "TXDC" || BigInt(body.data?.xdc?.wei || "0") > 0n);
    } catch {
      quoteAvailable = false;
    }

    const proposedExpiry = BigInt(Math.floor(Date.now() / 1_000)) +
      BigInt(termYears) * 365n * 24n * 60n * 60n;
    const parentActive = parentOwner !== zeroAddress && parentExpiry > BigInt(Math.floor(Date.now() / 1_000));
    const controller = selected === parentOwner || approvedOperator;
    const paymentEnabled = currency === "TXDC"
      ? config.xdcPaymentsEnabled
      : config.usdcPaymentsEnabled;

    setDiagnostics([
      {
        label: "Parent name active",
        passed: parentActive,
        detail: parentActive
          ? "Parent owner " + parentOwner
          : "The parent name is missing or expired",
      },
      {
        label: "Connected wallet controls parent",
        passed: controller,
        detail: controller
          ? "Connected as parent owner or approved operator"
          : "Use the parent owner or authorize this wallet as an operator",
      },
      {
        label: "Label available",
        passed: available,
        detail: available ? "The label can be registered" : "This label is already active",
      },
      {
        label: "Registrations enabled",
        passed: !paused,
        detail: paused ? "Subdomain registrations are paused" : "Registrations are active",
      },
      {
        label: "Term fits parent expiry",
        passed: proposedExpiry <= parentExpiry,
        detail: proposedExpiry <= parentExpiry
          ? "Requested term ends before the parent name expires"
          : "Renew the parent name first or select a shorter term",
      },
      {
        label: "Pricing policy matches API",
        passed: quoteAvailable && apiPrice === policyPrice,
        detail: quoteAvailable && apiPrice === policyPrice
          ? "$" + formatUnits(policyPrice, 6)
          : "API quote $" + formatUnits(apiPrice, 6) +
            " does not match policy $" + formatUnits(policyPrice, 6),
      },
      {
        label: currency + " payments enabled",
        passed: paymentEnabled,
        detail: paymentEnabled
          ? currency + " is accepted by the Apothem policy"
          : currency + " payments are disabled",
      },
    ]);
  }

  async function signedQuote(
    publicClient: ReturnType<typeof createPublicClient>,
    walletClient: ReturnType<typeof createWalletClient>,
    signer: Address,
    payer: Address,
    owner: Address,
  ) {
    const policy = await publicClient.readContract({
      address: REGISTRAR,
      abi: registrarAbi,
      functionName: "pricingPolicy",
    });
    const [node, parentNode, nonce, version, config] = await Promise.all([
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "nodeFor",
        args: [canonicalParent(), canonicalLabel()],
      }),
      Promise.resolve(keccak256(toBytes(canonicalParent()))),
      publicClient.readContract({
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: "nonces",
        args: [payer],
      }),
      publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "version",
      }),
      publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "config",
      }),
    ]);

    const quoteResponse = await fetch(
      "/api/v1/pricing/quote?product=subdomain&years=" + termYears,
      { cache: "no-store" },
    );
    const quoteBody = await quoteResponse.json() as {
      data?: { pricing?: { totalMicros?: string }; xdc?: { wei?: string } };
      error?: { message?: string };
    };
    if (!quoteResponse.ok || !quoteBody.data?.pricing?.totalMicros) {
      throw new Error(quoteBody.error?.message || "Unable to obtain the subdomain price");
    }

    const usdMicros = BigInt(quoteBody.data.pricing.totalMicros);
    const paymentToken = currency === "TXDC"
      ? getAddress("0x0000000000000000000000000000000000000000")
      : getAddress(config.usdcToken);
    const paymentAmount = currency === "TXDC"
      ? BigInt(quoteBody.data.xdc?.wei || "0")
      : usdMicros;
    if (paymentAmount <= 0n) throw new Error("The payment quote is invalid");

    const issuedAt = BigInt(Math.floor(Date.now() / 1_000));
    const quote = {
      node,
      parentNode,
      payer,
      subdomainOwner: owner,
      termYears: BigInt(termYears),
      paymentToken,
      paymentAmount,
      usdMicros,
      policyVersion: version,
      nonce,
      issuedAt,
      deadline: issuedAt + 600n,
    };

    const signature = await walletClient.signTypedData({
      account: signer,
      domain: {
        name: "XDCID Subdomain Registrar",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: REGISTRAR,
      },
      types: quoteTypes,
      primaryType: "SubdomainQuote",
      message: quote,
    });
    return { quote, signature, usdcToken: getAddress(config.usdcToken) };
  }

  async function clients(requestAccounts = true) {
    const provider = injectedMetaMask();
    const accounts = await provider.request({
      method: requestAccounts ? "eth_requestAccounts" : "eth_accounts",
    }) as string[];
    if (!accounts[0]) throw new Error("Connect MetaMask first");
    const selected = getAddress(accounts[0]);
    await ensureApothem(provider);
    return {
      provider,
      account: selected,
      publicClient: createPublicClient({ chain: apothem, transport: custom(provider) }),
      walletClient: createWalletClient({ chain: apothem, transport: custom(provider) }),
    };
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

  function canonicalParent() {
    const value = parentName.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.xdc$/.test(value)) {
      throw new Error("Enter a valid parent name ending in .xdc");
    }
    return value;
  }

  function canonicalLabel() {
    const value = label.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
      throw new Error("Enter a valid subdomain label");
    }
    return value;
  }

  function requiredNode() {
    if (!status.node) throw new Error("Refresh the subdomain state first");
    return status.node;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-7">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-800">
            Preview-only · XDC Apothem
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Test XDCID subdomains</h1>
          <p className="mt-3 text-slate-700">
            Use MetaMask and testnet assets only. Each write is shown in the wallet before it is submitted. No private key or test record is stored by this page.
          </p>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Parent name" value={parentName} onChange={setParentName} />
            <Field label="Subdomain label" value={label} onChange={setLabel} />
            <label className="text-sm font-medium">Term
              <select className="mt-2 w-full rounded-xl border p-3" value={termYears} onChange={(event) => setTermYears(Number(event.target.value))}>
                {[1, 3, 5, 10].map((years) => <option key={years} value={years}>{years} year(s)</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Payment
              <select className="mt-2 w-full rounded-xl border p-3" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                <option>TXDC</option><option>USDC</option>
              </select>
            </label>
            <Field label="Subdomain owner" value={subdomainOwner} onChange={setSubdomainOwner} />
            <Field label="Payer / delegated officer wallet" value={payerAddress} onChange={setPayerAddress} />
            <label className="text-sm font-medium">Address-record chain
              <select className="mt-2 w-full rounded-xl border p-3" value={recordChainId} onChange={(event) => setRecordChainId(Number(event.target.value))}>
                <option value={51}>Apothem (51)</option>
                <option value={11155111}>Ethereum Sepolia</option>
                <option value={421614}>Arbitrum Sepolia</option>
                <option value={84532}>Base Sepolia</option>
                <option value={80002}>Polygon Amoy</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Action label={account ? "MetaMask verified" : "Connect MetaMask"} onClick={connect} disabled={busy} />
            <Action label="Refresh state" onClick={refresh} disabled={busy} secondary />
            <Action label="1. Sign registration quote" onClick={() => preparePaidAction("registerWithQuote")} disabled={!account || busy || status.available === false} />
            <Action label="2. Submit registration" onClick={() => submitPaidAction("registerWithQuote")} disabled={!prepared || prepared.action !== "registerWithQuote" || busy} />
            <Action label="1. Sign renewal quote" onClick={() => preparePaidAction("renewWithQuote")} disabled={!account || busy || !status.owner || status.owner === zeroAddress} secondary />
            <Action label="2. Submit renewal" onClick={() => submitPaidAction("renewWithQuote")} disabled={!prepared || prepared.action !== "renewWithQuote" || busy} secondary />
          </div>
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <p className="font-semibold">Delegated-officer test flow</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Enter the delegated officer as the payer.</li>
              <li>Connect the authorized quote-signer wallet and sign the quote.</li>
              <li>Switch MetaMask to the delegated officer and submit the prepared transaction.</li>
            </ol>
            <p className="mt-2">Prepared quotes remain only in this browser tab and expire after 10 minutes.</p>
          </div>
          <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm">{message}</p>
          {lastHash ? (
            <a className="mt-3 block break-all font-mono text-sm text-blue-700 underline" href={"https://testnet.xdcscan.com/tx/" + lastHash} target="_blank" rel="noreferrer">
              {lastHash}
            </a>
          ) : null}
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Registration diagnostics</h2>
          <p className="mt-2 text-sm text-slate-600">
            Refresh state after changing the parent, label, term, or payment method. Every check must pass before registration.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {diagnostics.length === 0 ? (
              <p className="text-sm text-slate-600">Refresh state to run the checks.</p>
            ) : diagnostics.map((diagnostic) => (
              <div
                key={diagnostic.label}
                className={(diagnostic.passed
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-red-200 bg-red-50") + " rounded-xl border p-4"}
              >
                <p className="font-semibold">
                  {diagnostic.passed ? "Pass · " : "Action needed · "}{diagnostic.label}
                </p>
                <p className="mt-1 break-all text-sm text-slate-700">{diagnostic.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">Resolution record</h2>
            <Field label="Destination address" value={recordAddress} onChange={setRecordAddress} />
            <Action label="Set destination" onClick={setDestination} disabled={!account || busy || !status.node} />
          </div>
          <div className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">Ownership and company controls</h2>
            <p className="mt-2 text-sm text-slate-600">
              A holder can transfer their assigned identity. The parent owner or an approved operator can assign or reclaim it. Only the parent owner can release the label for registration again.
            </p>
            <Field label="Assignee wallet" value={newOwner} onChange={setNewOwner} />
            <div className="mt-3 flex flex-wrap gap-3">
              <Action label="Transfer as current holder" onClick={transfer} disabled={!account || busy || !status.node} />
              <Action label="Assign as parent controller" onClick={assign} disabled={!account || busy || !status.node} />
              <Action label="Reclaim to company" onClick={reclaim} disabled={!account || busy || !status.node} secondary />
              <Action label="Release name" onClick={release} disabled={!account || busy || !status.node} secondary />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Delegated company operator</h2>
          <p className="mt-2 text-sm text-slate-600">
            Authorize an HR or administrative wallet to register, renew, assign, reclaim, and manage resolution records. The parent owner can remove it at any time.
          </p>
          <Field label="HR or administrator wallet" value={operator} onChange={setOperatorAddress} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Action label="Authorize operator" onClick={() => updateOperator(true)} disabled={!account || busy} />
            <Action label="Remove operator" onClick={() => updateOperator(false)} disabled={!account || busy} secondary />
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Live state</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Contract" value={REGISTRAR} />
            <Detail label="Node" value={status.node || "Refresh to calculate"} />
            <Detail
              label="Registration status"
              value={
                status.available === undefined
                  ? "Unknown"
                  : status.available
                    ? "Available"
                    : "Registered"
              }
            />
            <Detail label="Owner" value={status.owner || "Unknown"} />
            <Detail label="Expiry" value={status.expiry ? new Date(Number(status.expiry) * 1000).toLocaleString() : "Not registered"} />
            <Detail label={"Destination on chain " + recordChainId} value={status.destination || "Unknown"} />
          </dl>
        </section>
      </div>
    </main>
  );
}

const zeroAddress = getAddress("0x0000000000000000000000000000000000000000");

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block text-sm font-medium">{label}
      <input className="mt-2 w-full rounded-xl border p-3 font-mono text-sm" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Action({ label, onClick, disabled, secondary = false }: { label: string; onClick: () => void; disabled: boolean; secondary?: boolean }) {
  return (
    <button className={(secondary ? "border bg-white text-slate-950" : "bg-slate-950 text-white") + " rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-50"} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>;
}

function injectedMetaMask(): MetaMaskProvider {
  const injected = (window as Window & { ethereum?: MetaMaskProvider }).ethereum;
  if (!injected) throw new Error("MetaMask was not detected");
  const providers = injected.providers ?? [injected];
  const metamask = providers.find((provider: MetaMaskProvider) => provider.isMetaMask === true && provider.isRabby !== true);
  if (!metamask) throw new Error("Enable MetaMask to continue on Apothem");
  return metamask;
}

async function ensureApothem(provider: EIP1193Provider) {
  const current = await provider.request({ method: "eth_chainId" }) as string;
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x33" }] });
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

async function requireCode(publicClient: ReturnType<typeof createPublicClient>) {
  const code = await publicClient.getCode({ address: REGISTRAR });
  if (!code || code === "0x") throw new Error("The verified Apothem Subdomain Registrar has no bytecode");
}

function errorMessage(cause: unknown) {
  const messages: string[] = [];
  const visited = new Set<unknown>();

  function collect(value: unknown, depth = 0) {
    if (depth > 5 || value == null || visited.has(value)) return;
    if (typeof value === "string") {
      if (value.trim()) messages.push(value.trim());
      return;
    }
    if (typeof value !== "object") return;
    visited.add(value);

    const record = value as Record<string, unknown>;
    for (const key of ["reason", "shortMessage", "details", "message"]) {
      if (typeof record[key] === "string" && record[key].trim()) {
        messages.push(record[key].trim());
      }
    }
    collect(record.cause, depth + 1);
  }

  collect(cause);
  const useful = messages.find((message) =>
    !message.startsWith("The contract function") &&
    !message.startsWith("ContractFunctionExecutionError") &&
    message !== "Wallet operation failed"
  );
  const message = useful || messages[0] || "Wallet operation failed";
  const compact = message.replace(/\s+/g, " ").trim();
  return compact.length > 700 ? compact.slice(0, 697) + "..." : compact;
}
