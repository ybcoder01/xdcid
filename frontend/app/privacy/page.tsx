import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How XDCID handles public blockchain data, wallet-authorized history, Pay Links, and privacy-safe analytics.",
};

const sections = [
  {
    title: "Public blockchain activity",
    body: "XDCID names, ownership, expiry, resolver records, wallet addresses, and transactions written to supported public networks are public by design. XDCID cannot make on-chain data private or delete it from a blockchain.",
  },
  {
    title: "Payment and receipt records",
    body: "When supported payments complete, XDCID may store transaction hashes, participants, amount, asset, route, timestamps, and receipt metadata. Access to private history requires a fresh wallet signature. Private references and descriptions are encrypted before storage.",
  },
  {
    title: "Pay Links",
    body: "A short Pay Link stores the signed request needed to present and verify checkout. XDCID does not store a private key or sign the payment transaction. Links expire when paid, cancelled, or when their configured retention period ends.",
  },
  {
    title: "Analytics",
    body: "Production analytics measure aggregate page visits and a small allowlist of product events. Query strings, URL fragments, XDCID names, Pay Link identifiers, wallet addresses, transaction hashes, amounts, and free-form text are not sent as analytics properties.",
  },
  {
    title: "Wallet connection",
    body: "Connecting a wallet exposes the active public address and network to the application. XDCID never requests a seed phrase or private key. Wallet signatures are used only for the purpose described in the wallet prompt.",
  },
  {
    title: "Retention and control",
    body: "Payment-history retention is governed by the platform history policy and operational controls. Blockchain records are outside XDCID's control. Do not place secrets or sensitive personal information in public name records or transaction fields.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-10 shadow-sm md:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b6670]">Privacy at XDCID</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">Public where blockchain requires it. Private where the product can protect it.</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
          This summary explains the platform&apos;s current data boundaries. It is written for product transparency and does not change the public nature of blockchain activity.
        </p>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" key={section.title}>
            <h2 className="text-xl font-semibold text-slate-950">{section.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{section.body}</p>
          </article>
        ))}
      </section>
      <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        Never share a seed phrase, private key, password, or exchange recovery code with XDCID or through a public support channel.
      </p>
    </main>
  );
}
