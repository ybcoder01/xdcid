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
  parseAbi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";

const TEST_WALLET = getAddress("0x9c67d6cfE6A73497e7348b6b852495CA6236C29a");
const REGISTRAR = getAddress("0x3332EB7E6CD865178a9bc12E6F268736a0c97E6C");
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
  "function nonces(address) view returns (uint256)",
  "function available(string parentName,string label) view returns (bool)",
  "function nodeFor(string parentName,string label) pure returns (bytes32)",
  "function ownerOf(bytes32 node) view returns (address)",
  "function addressOf(bytes32 node,uint256 chainId) view returns (address)",
  "function records(bytes32 node) view returns (address owner,bytes32 parentNode,uint256 expiry)",
  "function registerWithQuote(string parentName,string label,(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline) quote,bytes quoteSignature) payable",
  "function renewWithQuote(string parentName,string label,(bytes32 node,bytes32 parentNode,address payer,address subdomainOwner,uint256 termYears,address paymentToken,uint256 paymentAmount,uint256 usdMicros,uint256 policyVersion,uint256 nonce,uint256 issuedAt,uint256 deadline) quote,bytes quoteSignature) payable",
  "function setAddress(bytes32 node,uint256 chainId,address destination)",
  "function transferSubdomain(bytes32 node,address newOwner)",
  "function revokeSubdomain(string parentName,string label)",
  "function setParentOperator(string parentName,address operator,bool approved)",
]);

const policyAbi = parseAbi([
  "function version() view returns (uint256)",
  "function parentNodeFor(string parentName) pure returns (bytes32)",
  "function isQuoteAuthorizationValid(address signer,uint256 quoteVersion) view returns (bool)",
  "function config() view returns ((uint64 threeCharacterAnnualUsdMicros,uint64 fourCharacterAnnualUsdMicros,uint64 standardAnnualUsdMicros,uint64 subdomainAnnualUsdMicros,uint64 migrationUsdMicros,uint16 threeYearDiscountBps,uint16 fiveYearDiscountBps,uint16 tenYearDiscountBps,uint16 xdcQuoteBufferBps,address quoteSigner,address usdcToken,address treasury,bool xdcPaymentsEnabled,bool usdcPaymentsEnabled))",
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

export default function ApothemSubdomainTestingClient() {
  const [account, setAccount] = useState<Address>();
  const [parentName, setParentName] = useState("testing123.xdc");
  const [label, setLabel] = useState("pay");
  const [termYears, setTermYears] = useState(1);
  const [currency, setCurrency] = useState<Currency>("TXDC");
  const [subdomainOwner, setSubdomainOwner] = useState(TEST_WALLET);
  const [recordChainId, setRecordChainId] = useState(51);
  const [recordAddress, setRecordAddress] = useState(TEST_WALLET);
  const [newOwner, setNewOwner] = useState("");
  const [operator, setOperator] = useState("");
  const [status, setStatus] = useState<Status>({});
  const [message, setMessage] = useState("Connect MetaMask to run the read-only preflight.");
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<Hex>();

  async function connect() {
    await run(async () => {
      const { provider, account: selected, publicClient } = await clients();
      await requireCode(publicClient);
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
        args: [selected, version],
      });
      if (!authorized) {
        throw new Error("The selected MetaMask account is not the authorized Apothem quote signer");
      }
      setAccount(selected);
      setSubdomainOwner(selected);
      setRecordAddress(selected);
      setMessage("MetaMask, Apothem, registrar, and local test-quote authorization validated.");
      await refreshWith(publicClient);
      void provider;
    });
  }

  async function refresh() {
    await run(async () => {
      const { publicClient } = await clients(false);
      await refreshWith(publicClient);
      setMessage("On-chain subdomain state refreshed.");
    });
  }

  async function register() {
    await paidAction("registerWithQuote");
  }

  async function renew() {
    await paidAction("renewWithQuote");
  }

  async function paidAction(action: "registerWithQuote" | "renewWithQuote") {
    await run(async () => {
      const { account: selected, publicClient, walletClient } = await clients();
      const owner = getAddress(subdomainOwner);
      if (action === "renewWithQuote" && status.owner && selected !== status.owner) {
        throw new Error("Select the current subdomain owner in MetaMask to renew");
      }
      const { quote, signature, usdcToken } = await signedQuote(
        publicClient,
        walletClient,
        selected,
        owner,
      );

      if (currency === "USDC") {
        const approval = await walletClient.writeContract({
          account: selected,
          chain: apothem,
          address: usdcToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [REGISTRAR, quote.paymentAmount],
        });
        setMessage("USDC approval submitted. Waiting for confirmation...");
        await publicClient.waitForTransactionReceipt({ hash: approval, confirmations: 1 });
      }

      const hash = await walletClient.writeContract({
        account: selected,
        chain: apothem,
        address: REGISTRAR,
        abi: registrarAbi,
        functionName: action,
        args: [canonicalParent(), canonicalLabel(), quote, signature],
        value: currency === "TXDC" ? quote.paymentAmount : 0n,
      });
      await confirm(publicClient, hash);
      await refreshWith(publicClient);
      setMessage(
        action === "registerWithQuote"
          ? "Subdomain registration confirmed."
          : "Subdomain renewal confirmed.",
      );
    });
  }

  async function setDestination() {
    await write("setAddress", [requiredNode(), BigInt(recordChainId), getAddress(recordAddress)]);
  }

  async function transfer() {
    if (!isAddress(newOwner)) throw new Error("Enter a valid new owner address");
    await write("transferSubdomain", [requiredNode(), getAddress(newOwner)]);
  }

  async function revoke() {
    await write("revokeSubdomain", [canonicalParent(), canonicalLabel()]);
  }

  async function setOperator(approved: boolean) {
    if (!isAddress(operator)) throw new Error("Enter a valid operator address");
    await write("setParentOperator", [canonicalParent(), getAddress(operator), approved]);
  }

  async function write(functionName: "setAddress" | "transferSubdomain" | "revokeSubdomain" | "setParentOperator", args: readonly unknown[]) {
    await run(async () => {
      const { account: selected, publicClient, walletClient } = await clients();
      const hash = await walletClient.writeContract({
        account: selected,
        chain: apothem,
        address: REGISTRAR,
        abi: registrarAbi,
        functionName,
        args: args as never,
      });
      await confirm(publicClient, hash);
      await refreshWith(publicClient);
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

  async function refreshWith(publicClient: ReturnType<typeof createPublicClient>) {
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
  }

  async function signedQuote(
    publicClient: ReturnType<typeof createPublicClient>,
    walletClient: ReturnType<typeof createWalletClient>,
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
      publicClient.readContract({
        address: policy,
        abi: policyAbi,
        functionName: "parentNodeFor",
        args: [canonicalParent()],
      }),
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
      account: payer,
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
    if (selected !== TEST_WALLET && !account) {
      throw new Error("Start with the designated Apothem test wallet");
    }
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
            <Field label="Subdomain owner" value={subdomainOwner} onChange={(value) => isAddress(value) && setSubdomainOwner(getAddress(value))} />
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
            <Action label="Register" onClick={register} disabled={!account || busy || status.available === false} />
            <Action label="Renew" onClick={renew} disabled={!account || busy || !status.owner || status.owner === zeroAddress} />
          </div>
          <p className="mt-5 rounded-xl bg-slate-100 p-4 text-sm">{message}</p>
          {lastHash ? (
            <a className="mt-3 block break-all font-mono text-sm text-blue-700 underline" href={"https://testnet.xdcscan.com/tx/" + lastHash} target="_blank" rel="noreferrer">
              {lastHash}
            </a>
          ) : null}
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">Resolution record</h2>
            <Field label="Destination address" value={recordAddress} onChange={(value) => isAddress(value) && setRecordAddress(getAddress(value))} />
            <Action label="Set destination" onClick={setDestination} disabled={!account || busy || !status.node} />
          </div>
          <div className="rounded-3xl border bg-white p-7 shadow-sm">
            <h2 className="text-xl font-semibold">Ownership tests</h2>
            <Field label="New subdomain owner" value={newOwner} onChange={setNewOwner} />
            <div className="mt-3 flex flex-wrap gap-3">
              <Action label="Transfer" onClick={transfer} disabled={!account || busy || !status.node} />
              <Action label="Revoke as parent controller" onClick={revoke} disabled={!account || busy || !status.node} secondary />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Parent operator test</h2>
          <Field label="Operator address" value={operator} onChange={setOperator} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Action label="Approve operator" onClick={() => setOperator(true)} disabled={!account || busy} />
            <Action label="Remove operator" onClick={() => setOperator(false)} disabled={!account || busy} secondary />
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Live state</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Detail label="Contract" value={REGISTRAR} />
            <Detail label="Node" value={status.node || "Refresh to calculate"} />
            <Detail label="Available" value={status.available === undefined ? "Unknown" : String(status.available)} />
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
  const metamask = providers.find((provider) => provider.isMetaMask === true && provider.isRabby !== true);
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
  const raw = cause instanceof Error ? cause.message : "Wallet operation failed";
  const first = raw.split("\n")[0];
  return first.length > 320 ? first.slice(0, 317) + "..." : first;
}
