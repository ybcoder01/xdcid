"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const productLinks = [
  ["Register", "/#register"],
  ["Send", "/send"],
  ["Pay Links", "/pay"],
  ["Subdomains", "/subdomains"],
];

const projectLinks = [
  ["Developers", "/developers"],
  ["Trust Center", "/trust"],
  ["Privacy", "/privacy"],
  ["Contact", "/contact"],
];

export function SiteFooter() {
  const pathname = usePathname();
  if (/^\/pay\/[^/]+/.test(pathname)) return null;

  return (
    <footer className="mt-12 border-t border-slate-200 bg-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <p className="text-xl font-semibold tracking-tight text-slate-950">XDCID</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Wallet-owned .xdc identities on XDC Network with destination records for five supported EVM networks.
          </p>
        </div>
        <FooterLinks title="Use XDCID" links={productLinks} />
        <FooterLinks title="Project" links={projectLinks} />
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500">
          <span>Non-custodial software · Verify before signing</span>
          <a className="font-semibold text-slate-700 hover:text-[#0b6670]" href="https://github.com/ybcoder01/xdcid" rel="noreferrer" target="_blank">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link className="text-sm font-medium text-slate-700 hover:text-[#0b6670]" href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
