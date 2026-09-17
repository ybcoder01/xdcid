import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact and Community",
  description: "Verified contact, community, and project links for XDCID.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0b6670]">Contact and community</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">One verified place to follow the project</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
          The public GitHub repository is the currently verified source for releases, documentation, issue tracking, and technical discussion. Additional official social channels will appear here only after they are verified.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <a className="rounded-2xl border border-slate-200 bg-slate-50 p-5 hover:border-teal-400" href="https://github.com/ybcoder01/xdcid" rel="noreferrer" target="_blank">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Source and releases</span>
            <strong className="mt-2 block text-xl text-slate-950">GitHub repository</strong>
          </a>
          <a className="rounded-2xl border border-slate-200 bg-slate-50 p-5 hover:border-teal-400" href="https://github.com/ybcoder01/xdcid/issues" rel="noreferrer" target="_blank">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Product support</span>
            <strong className="mt-2 block text-xl text-slate-950">GitHub Issues</strong>
          </a>
        </div>
        <p className="mt-6 text-sm leading-6 text-slate-600">
          Never include seed phrases, private keys, personal payment records, or sensitive vulnerability details in a public issue.
        </p>
      </section>
    </main>
  );
}
