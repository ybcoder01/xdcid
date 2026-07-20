import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs | XDCID",
  description: "Integrate XDCID name and reverse resolution on XDC mainnet."
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
  }
];

const paidCapabilities = [
  ["Resolve", "Resolve an XDCID name to its owner, payment address, and expiry."],
  ["Reverse", "Find the verified primary XDCID name for an XDC address."],
  ["Availability", "Check whether a name is available and retrieve its registration price."],
  ["Profile", "Read the public profile records attached to an XDCID name."]
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
              Resolve human-readable .xdc names, look up primary names, check availability, and read public profiles on XDC mainnet.
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
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Read-only endpoints</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          These endpoints require no API key. Names are canonicalized to lowercase and may be supplied as either a bare label or a complete .xdc name.
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
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Resolve XDCID directly on-chain</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          The read-only SDK provides name validation, forward and reverse resolution, availability, pricing, expiry, and profile lookups with XDC RPC fallback. It never requests a private key or wallet signature.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          The source is available now and is compiled with this project. Public npm installation instructions will be added after the package is released.
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
