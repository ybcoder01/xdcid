import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs | XDCID",
  description: "Integrate XDCID resolution, registration, subdomains, Pay Links, and wallet management."
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
    path: "/api/v1/subdomain/quote",
    title: "Subdomain quote",
    description: "Returns an authorized registration or renewal quote after checking parent-controller and expiry rules."
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
    title: "Issue and manage subdomains",
    description: "Parent owners or approved operators can request a quote and prepare the matching subdomain registration or renewal transaction.",
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
              Resolve human-readable .xdc names, register and manage identities, issue subdomains, and integrate signed Pay Links on XDC mainnet.
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
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">One SDK for Web3 and Web2</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Use the on-chain client for resolution and owner-authorized transaction preparation, or the HTTP client for server and browser integrations. Signed quotes cover registration, renewal, discount grants, and subdomains; Pay Link helpers cover creation, status, lookup, and revocation.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          Version 0.2 is available in this repository and compiled with the application. Public npm installation instructions will be added after the package is released.
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
