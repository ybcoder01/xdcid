import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Integrate production XDCID APIs and contracts, and review upcoming SDK and subdomain capabilities."
};

const publicEndpoints = [
  {
    method: "GET",
    path: "/api/v1/names/{name}?years=1",
    title: "Name lookup",
    description: "Returns the canonical name, owner, resolved address, availability, registration price, expiry, and profile records."
  },
  {
    method: "GET",
    path: "/api/v1/reverse/{address}",
    title: "Reverse lookup",
    description: "Returns the verified primary XDCID name for a wallet address, or null when no current record exists."
  },
  {
    method: "GET",
    path: "/api/v1/addresses/{address}/names",
    title: "Owned names",
    description: "Returns the verified primary ID and every active XDCID name currently owned by a wallet."
  },
  {
    method: "GET",
    path: "/api/v1/pricing/quote?product=registration&name=alice.xdc&years=1",
    title: "Informational pricing",
    description: "Returns the current USD policy price and buffered XDC estimate. It does not authorize a payment."
  },
  {
    method: "POST",
    path: "/api/v1/registrar/quote",
    title: "Registration or renewal quote",
    description: "Returns a short-lived signed quote bound to a payer, owner, name, policy, registrar, and nonce."
  },
  {
    method: "POST",
    path: "/api/pay-links",
    title: "Create a short Pay Link",
    description: "Stores an already signed payment request and returns its shareable path plus a private revocation token."
  },
  {
    method: "GET",
    path: "/api/pay-links/cancellations/{requestId}",
    title: "Monitor a Pay Link",
    description: "Returns active, cancelled, or paid so an integration can update immediately after completion."
  },
  {
    method: "PRIVATE",
    path: "/address-book",
    title: "Encrypted Exchange Address Book",
    description: "Wallet owners can save exchange, asset, network, address and memo together. Records are encrypted and require a short-lived wallet-authorized vault session."
  }
];

const integrationGuides = [
  {
    eyebrow: "Web2 or backend",
    title: "Resolve names over HTTPS",
    description: "Use the typed API client from Node.js, a browser, or any runtime with fetch. No wallet or API key is required for public reads.",
    code: 'import { createXdcidApiClient } from "@xdcid/sdk/api";\n\nconst api = createXdcidApiClient();\nconst result = await api.getName("alice.xdc");\nconst primary = await api.reverseResolve(wallet);'
  },
  {
    eyebrow: "Wallet application",
    title: "Register with a signed quote",
    description: "Request a ten-minute quote, then let the payer approve USDC when needed and submit the prepared registrar call from their own wallet.",
    code: 'const quote = await api.createRegistrarQuote({\n  name: "alice.xdc", product: "registration",\n  termYears: 1, paymentCurrency: "USDC",\n  payer: account, nameOwner: account\n});\nconst plan = xdcid.prepareRegistrarPayment(quote);'
  },
  {
    eyebrow: "Organizations",
    title: "Preview subdomain integration (upcoming)",
    description: "Subdomain contracts and integration helpers are under development and are not part of the public product launch.",
    code: 'const quote = await api.createSubdomainQuote({\n  parentName: "company.xdc", label: "alice",\n  action: "registration", termYears: 1,\n  paymentCurrency: "XDC", payer: account,\n  subdomainOwner: account\n});'
  },
  {
    eyebrow: "Payments",
    title: "Share and monitor Pay Links",
    description: "Store an already signed request, render its short path or QR code, and poll its request ID until the link becomes paid or cancelled.",
    code: 'const link = await api.createPayLink({ request, signature });\nconst status = await api.getPayLinkStatus(requestId);\n// Keep link.revocationToken private.'
  }
];

const paidCapabilities = [
  ["Resolve", "Resolve an XDCID name to its owner, payment address, and expiry."],
  ["Reverse", "Find the verified primary XDCID name for an XDC address."],
  ["Availability", "Check whether a name is available and retrieve its registration price."],
  ["Profile", "Read the public profile records attached to an XDCID name."],
  ["Owned names", "List every active XDCID name owned by an address, including its verified primary ID."]
];

const supportedPaymentNetworks = [
  ["Ethereum", "ETH", "1"],
  ["XDC Network", "XDC", "50"],
  ["Polygon", "POL", "137"],
  ["Base", "ETH", "8453"],
  ["Arbitrum One", "ETH", "42161"]
];

const destinationSafeguards = [
  {
    title: "Match the exchange exactly",
    description: "Confirm the asset, deposit network, address, and any memo or tag against the exchange deposit screen. A valid EVM address does not prove that the exchange accepts the selected asset on that network."
  },
  {
    title: "Saved routes update together",
    description: "Selecting a saved destination applies its asset and network to both sides of a direct route and asks the connected wallet to switch to that network when necessary. Review the route before approving the transfer."
  },
  {
    title: "Memo or tag payments are blocked",
    description: "XDCID stores a memo or tag with the destination for reference, but Send cannot safely include it in the transfer yet. A saved entry that requires one is blocked instead of risking an uncredited exchange deposit."
  },
  {
    title: "Reconfirm changed details",
    description: "Treat any exchange notice, address change, network change, or asset change as a new destination. Verify the latest deposit instructions before sending again, and retire entries that are no longer valid."
  }
];

const exampleResponse = '{\n  "version": "v1",\n  "data": {\n    "name": "alice.xdc",\n    "available": false,\n    "resolvedAddress": "0x..."\n  }\n}';

const errorResponse = '{\n  "version": "v1",\n  "error": {\n    "code": "INVALID_NAME",\n    "message": "Invalid XDCID name"\n  }\n}';

const sdkExample = 'import { createXdcidClient } from "@xdcid/sdk";\n\nconst xdcid = createXdcidClient();\nconst result = await xdcid.resolveName("alice.xdc");';

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-md border border-black/10 bg-slate-950 p-6 text-white shadow-sm md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Developer documentation</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold leading-tight md:text-5xl">Build with XDCID</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Resolve human-readable .xdc names, integrate production APIs and contracts, and review clearly labelled preview tooling.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 p-4 text-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-slate-400">Network</span>
              <span>XDC mainnet</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-slate-400">Chain ID</span>
              <span>50</span>
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <a className="rounded-md bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-300" href="/openapi.yaml">
            OpenAPI specification
          </a>
          <a className="rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10" href="/api/v1/names/alice.xdc?years=1">
            Try a name lookup
          </a>
          <a
            className="rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            href="https://github.com/ybcoder01/xdcid/tree/main/sdk"
            rel="noreferrer"
            target="_blank"
          >
            View TypeScript SDK
          </a>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Private destination vault</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Encrypted exchange destinations</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          The Exchange Address Book keeps an exchange name, your label, asset, network, deposit address, memo or tag, and private notes together. Each complete entry is encrypted at rest with authenticated AES-256-GCM encryption before it is stored. The database uses a wallet fingerprint to find the correct records and does not store the entry fields as readable columns.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-black/10 bg-neutral-50 p-5">
            <h3 className="font-semibold text-slate-950">What remains private</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Destination details and notes are returned only through an active wallet-authorized vault session. Private payment references are likewise stored in encrypted XDCID history and are not written into transaction calldata.
            </p>
          </article>
          <article className="rounded-md border border-black/10 bg-neutral-50 p-5">
            <h3 className="font-semibold text-slate-950">What encryption means</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              This is server-side encryption at rest, not end-to-end encryption. XDCID&apos;s protected server key is required to decrypt records after authorization. Public blockchain transfers still expose their normal on-chain sender, recipient, asset, amount, and transaction data.
            </p>
          </article>
          <article className="rounded-md border border-black/10 bg-neutral-50 p-5">
            <h3 className="font-semibold text-slate-950">How access is scoped</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Records are associated with the verified wallet and cannot be opened by merely knowing its address. The vault supports up to 100 saved destinations per wallet, and deleting an entry removes its encrypted record.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Wallet verification</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">A signature unlocks the vault</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Connect the wallet that owns the address book, then sign the one-time XDCID challenge. This is an off-chain message signature: it costs no gas, submits no transaction, moves no funds, and grants no token allowance.
          </p>
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-neutral-700">
            <li className="rounded-md border border-black/10 bg-neutral-50 p-4"><span className="font-semibold text-slate-950">Short-lived challenge:</span> the signing request expires after five minutes and can be used only once.</li>
            <li className="rounded-md border border-black/10 bg-neutral-50 p-4"><span className="font-semibold text-slate-950">Thirty-minute session:</span> successful verification creates a secure, HTTP-only vault session bound to the wallet and current client context.</li>
            <li className="rounded-md border border-black/10 bg-neutral-50 p-4"><span className="font-semibold text-slate-950">Wallet changes:</span> switching accounts, disconnecting, expiring the session, or selecting Lock now requires verification again.</li>
          </ul>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Deposit safety</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">Network and memo warnings</h2>
          <div className="mt-5 grid gap-3">
            {destinationSafeguards.map((safeguard) => (
              <article className="rounded-md border border-amber-200 bg-white/80 p-4" key={safeguard.title}>
                <h3 className="text-sm font-semibold text-slate-950">{safeguard.title}</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-700">{safeguard.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Payments</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Supported payment routes</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          XDCID currently supports payments across five EVM mainnets. An XDCID name resolves to the destination address for the selected network; a saved exchange destination supplies its verified address, asset, and network directly.
        </p>

        <div className="mt-6 overflow-x-auto rounded-md border border-black/10">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">Network</th>
                <th className="px-4 py-3 font-semibold">Native asset</th>
                <th className="px-4 py-3 font-semibold">Chain ID</th>
                <th className="px-4 py-3 font-semibold">Direct payments</th>
              </tr>
            </thead>
            <tbody>
              {supportedPaymentNetworks.map(([network, nativeAsset, chainId]) => (
                <tr className="border-t border-black/10" key={chainId}>
                  <td className="px-4 py-3 font-semibold text-slate-950">{network}</td>
                  <td className="px-4 py-3 text-neutral-700">{nativeAsset}</td>
                  <td className="px-4 py-3 font-mono text-neutral-700">{chainId}</td>
                  <td className="px-4 py-3 text-neutral-700">USDC and the network&apos;s native asset</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-md border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="font-semibold text-slate-950">Same-network direct</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              Send USDC or the source network&apos;s native asset directly when the source and destination networks match. The payer approves one wallet transaction and pays that network&apos;s gas.
            </p>
          </article>
          <article className="rounded-md border border-teal-200 bg-teal-50 p-5">
            <h3 className="font-semibold text-slate-950">Cross-network USDC</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              Send USDC between any two supported networks using Circle CCTP. Standard mode requires the payer to complete the source burn and destination mint. Automatic mode asks Circle to submit the destination mint and shows its forwarding cost plus the XDCID convenience fee before approval.
            </p>
          </article>
          <article className="rounded-md border border-red-200 bg-red-50 p-5">
            <h3 className="font-semibold text-slate-950">Not supported</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">
              Native assets cannot be transferred cross-network. Memo/tag exchange deposits remain blocked, and XDCID does not convert assets or route payments through unsupported networks.
            </p>
          </article>
        </div>
        <p className="mt-5 text-xs leading-5 text-neutral-500">
          The dev environment mirrors these routes on Ethereum Sepolia, XDC Apothem, Polygon Amoy, Base Sepolia, and Arbitrum Sepolia. Always use test assets on dev and mainnet assets on production.
        </p>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8" id="public-api">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Public API</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Public endpoints</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Public reads require no API key. Quote and Pay Link writes validate signed or wallet-bound input; they never accept a private key. Names are canonicalized to lowercase and may be supplied as a bare label or complete .xdc name.
        </p>
        <div className="mt-6 grid gap-4">
          {publicEndpoints.map((endpoint) => (
            <article className="rounded-md border border-black/10 bg-neutral-50 p-5" key={endpoint.path}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded bg-teal-100 px-2 py-1 text-xs font-bold text-teal-800">{endpoint.method}</span>
                <code className="break-all text-sm font-semibold text-slate-950">{endpoint.path}</code>
              </div>
              <h3 className="mt-4 font-semibold text-slate-950">{endpoint.title}</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-600">{endpoint.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">TypeScript SDK</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-semibold text-slate-950">One SDK for Web3 and Web2</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Developer preview · Not on npm</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Use the on-chain client for resolution and owner-authorized transaction preparation, or the HTTP client for server and browser integrations. Signed quotes cover registration, renewal, discount grants, and subdomains; Pay Link helpers cover creation, status, lookup, and revocation.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Version 0.2 is available only from this repository for review and integration testing. <strong>Do not use <code>npm install @xdcid/sdk</code> yet:</strong> the package has not been published to npm.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-6 text-slate-200">
          <code>{sdkExample}</code>
        </pre>
        <div className="mt-5 flex flex-wrap gap-4">
          <a
            className="text-sm font-semibold text-teal-800 hover:text-teal-950"
            href="https://github.com/ybcoder01/xdcid/tree/main/sdk"
            rel="noreferrer"
            target="_blank"
          >
            View SDK source →
          </a>
          <a
            className="text-sm font-semibold text-teal-800 hover:text-teal-950"
            href="https://github.com/ybcoder01/xdcid/blob/main/sdk/README.md"
            rel="noreferrer"
            target="_blank"
          >
            Read the SDK guide →
          </a>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Integration recipes</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Build by task</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          These flows keep signing in the user&apos;s wallet and use XDCID&apos;s API only where current policy, authorization, or durable Pay Link state is required.
        </p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {integrationGuides.map((guide) => (
            <article className="rounded-md border border-black/10 bg-neutral-50 p-5" key={guide.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">{guide.eyebrow}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">{guide.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{guide.description}</p>
              <pre className="mt-4 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-200">
                <code>{guide.code}</code>
              </pre>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Success format</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">Versioned responses</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Every application JSON response identifies the API version. Clients should ignore response fields they do not recognize.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-6 text-slate-200">
            <code>{exampleResponse}</code>
          </pre>
        </div>
        <div className="rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Error format</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">Consistent failures</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Invalid input returns HTTP 400, rate limits may return 429, and temporary XDC RPC failures return 503.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-6 text-slate-200">
            <code>{errorResponse}</code>
          </pre>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-black/10 bg-white/90 p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">XDC AI Gateway</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Paid agent capabilities</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          The XDCID service is available through XDC AI for 0.001 USDC per call. Agents should use the service URL published by XDC AI; protected upstream credentials remain server-side and are never required by callers.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {paidCapabilities.map(([title, description]) => (
            <article className="rounded-md border border-black/10 bg-neutral-50 p-5" key={title}>
              <h3 className="font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-md border border-teal-700/20 bg-teal-50 p-6 md:p-8">
        <h2 className="text-2xl font-semibold text-slate-950">Compatibility policy</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          New optional fields may be added within v1. Removing fields, renaming fields, changing their types, or changing documented behavior requires a new API version.
        </p>
        <a className="mt-5 inline-flex text-sm font-semibold text-teal-800 hover:text-teal-950" href="/openapi.yaml">
          View the complete schemas and status codes →
        </a>
      </section>
    </main>
  );
}
