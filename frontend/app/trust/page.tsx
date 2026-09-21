import type { Metadata } from "next";
import type { ReactNode } from "react";
import { XDC_MAINNET_DEPLOYMENT } from "../../../sdk/src/deployment/deployments";

export const metadata: Metadata = {
  title: "Trust Center",
  description: "XDCID contract controls, custody boundaries, security posture, privacy practices, audit status, and support channels.",
};

const contracts = [
  {
    name: "Registry",
    address: XDC_MAINNET_DEPLOYMENT.active.registry,
    control: "The protocol owner can change the authorized registrar. Name owners control transfers and resolver selection for their active names.",
  },
  {
    name: "Active Registrar V2",
    address: XDC_MAINNET_DEPLOYMENT.active.registrar,
    control: "The owner can pause new registrations and renewals. Payment amounts, signer authorization, ownership, nonce, and expiry are checked on-chain.",
  },
  {
    name: "Pricing Policy V2",
    address: XDC_MAINNET_DEPLOYMENT.active.pricingPolicy,
    control: "Owner-governed configuration changes use a 48-hour delay before activation.",
  },
  {
    name: "Multichain Resolver",
    address: XDC_MAINNET_DEPLOYMENT.active.multichainResolver,
    control: "Only the current, unexpired name owner can set or clear chain-specific destination records.",
  },
];

export default function TrustPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-10 shadow-sm md:px-10 md:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b6670]">XDCID Trust Center</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">Know what the platform can—and cannot—control</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
          This page documents administrative powers, custody boundaries, stored data, security controls, and the current assurance level. Verify contract state independently before signing a transaction.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold">
          <a className="rounded-xl bg-slate-950 px-5 py-3 text-white hover:bg-[#0b6670]" href="#contracts">Contract controls</a>
          <a className="rounded-xl border border-slate-300 px-5 py-3 text-slate-800 hover:bg-slate-50" href="/privacy">Privacy details</a>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8" id="contracts">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b6670]">Contract control</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold text-slate-950">Verified XDC mainnet contracts</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Externally unaudited</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          The contracts are deployed as ordinary contracts rather than upgradeable proxies. Material logic changes require a new deployment; the Registry owner can select a different authorized registrar.
        </p>
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
          {contracts.map((contract) => (
            <article className="grid gap-3 border-b border-slate-200 p-5 last:border-b-0 md:grid-cols-[220px_1fr]" key={contract.address}>
              <div>
                <h3 className="font-semibold text-slate-950">{contract.name}</h3>
                <a className="mt-1 block break-all font-mono text-xs text-[#0b6670] hover:underline" href={`https://xdcscan.com/address/${contract.address}`} rel="noreferrer" target="_blank">
                  {contract.address}
                </a>
              </div>
              <p className="text-sm leading-6 text-slate-600">{contract.control}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">
          The published Registry and active Registrar owner is <code className="break-all rounded bg-slate-100 px-1.5 py-1 text-xs text-slate-900">{XDC_MAINNET_DEPLOYMENT.protocolOwner}</code>. Resolver contracts authorize individual name owners through the Registry and do not have a protocol-owner transfer role.
        </p>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <TrustCard title="Non-custodial payments" eyebrow="Custody">
          XDCID never receives a wallet private key and does not hold user payment funds. Pay Link and Send transactions move from the payer wallet to the resolved destination, while current XDCID ownership and signed request integrity are checked before execution.
        </TrustCard>
        <TrustCard title="Wallet-authorized controls" eyebrow="Security">
          Owner actions require the connected wallet, expiry and ownership are checked on-chain, signed requests are bound to exact fields and nonces, and compatible smart accounts are verified through ERC-1271. Administrative routes use wallet challenges and server-side sessions.
        </TrustCard>
        <TrustCard title="Minimized, purpose-bound data" eyebrow="Privacy">
          Public names, addresses, and transactions remain visible on-chain. XDCID stores completed-payment metadata for wallet-authorized history; private references are encrypted. Production analytics remove URL queries and dynamic name or Pay Link identifiers before collection.
        </TrustCard>
        <TrustCard title="No independent audit yet" eyebrow="Audit status">
          The repository includes automated contract and application tests, but XDCID has not yet published an independent third-party security audit. Treat the product as early-stage software and verify transaction details in your wallet.
        </TrustCard>
      </section>

      <section className="mt-8 rounded-2xl border border-teal-200 bg-teal-50 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b6670]">Support and disclosure</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">Use the verified project channel</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          Product questions and reproducible non-sensitive issues can be reported through the public GitHub repository. Do not post private keys, recovery phrases, personal payment records, or unpatched vulnerability details in a public issue.
        </p>
        <a className="mt-5 inline-flex rounded-xl bg-[#0b6670] px-5 py-3 text-sm font-semibold text-white hover:bg-[#084f57]" href="https://github.com/ybcoder01/xdcid/issues" rel="noreferrer" target="_blank">
          Open GitHub Issues
        </a>
      </section>
    </main>
  );
}

function TrustCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b6670]">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{children}</p>
    </article>
  );
}
