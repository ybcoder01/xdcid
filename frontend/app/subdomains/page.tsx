import { SubdomainRegistration } from "../../components/SubdomainRegistration";

export default function SubdomainsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <section className="mb-7 rounded-3xl border bg-white p-7 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#0b6670]">
          XDCID subdomains
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">
          Create identities beneath your name
        </h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          Parent-name owners can register paid subdomains for people, teams, or services and assign each one to its own wallet.
        </p>
      </section>
      <SubdomainRegistration />
    </main>
  );
}
