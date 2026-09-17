import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Developers",
  description: "Integrate XDCID through public APIs, verified XDC contracts, and developer-preview tooling.",
};

const paths = [
  {
    status: "Available now",
    statusClass: "bg-emerald-100 text-emerald-800",
    title: "Public HTTPS API",
    description: "Resolve names, reverse-resolve wallets, check ownership and pricing, and inspect active names without an API key.",
    href: "/docs#public-api",
    action: "Read the API docs",
  },
  {
    status: "Available now",
    statusClass: "bg-emerald-100 text-emerald-800",
    title: "Verified contracts",
    description: "Read the deployed XDC mainnet contracts directly and prepare wallet-owned transactions without handing XDCID a private key.",
    href: "/trust#contracts",
    action: "Review contract controls",
  },
  {
    status: "Developer preview",
    statusClass: "bg-amber-100 text-amber-800",
    title: "TypeScript SDK",
    description: "The SDK source is available for review and integration testing, but @xdcid/sdk is not yet published to npm.",
    href: "https://github.com/ybcoder01/xdcid/tree/main/sdk",
    action: "View source on GitHub",
    external: true,
  },
];

export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950 px-6 py-10 text-white shadow-xl md:px-10 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Developer portal</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Build on XDCID with clear production boundaries</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
          Start with the production API or verified contracts. Preview tooling is labelled separately so integrations do not depend on an unpublished package.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-200" href="/docs">
            Open documentation
          </Link>
          <a className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10" href="/openapi.yaml">
            OpenAPI specification
          </a>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-3" aria-label="XDCID integration paths">
        {paths.map((path) => (
          <article className="flex min-h-72 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" key={path.title}>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${path.statusClass}`}>{path.status}</span>
            <h2 className="mt-5 text-2xl font-semibold text-slate-950">{path.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{path.description}</p>
            {path.external ? (
              <a className="mt-auto pt-6 text-sm font-semibold text-[#0b6670]" href={path.href} rel="noreferrer" target="_blank">
                {path.action} →
              </a>
            ) : (
              <Link className="mt-auto pt-6 text-sm font-semibold text-[#0b6670]" href={path.href}>
                {path.action} →
              </Link>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
