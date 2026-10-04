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
  if (
    pathname === "/" ||
    /^\/pay\/[^/]+/.test(pathname)
  ) return null;

  return (
    <footer className="xdc-site-footer mt-12 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <p className="text-xl font-semibold tracking-tight">XDCID</p>
          <p className="xdc-muted mt-3 max-w-sm text-sm leading-6">
            Wallet-owned .xdc identities on XDC Network with destination records for five supported EVM networks.
          </p>
        </div>
        <FooterLinks title="Use XDCID" links={productLinks} />
        <FooterLinks title="Project" links={projectLinks} />
      </div>
      <div className="xdc-footer-rule border-t">
        <div className="xdc-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs">
          <span>Non-custodial software · Verify before signing</span>
          <a className="xdc-inline-link font-semibold" href="https://github.com/ybcoder01/xdcid" rel="noreferrer" target="_blank">
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
      <p className="xdc-muted text-xs font-bold uppercase tracking-[0.16em]">{title}</p>
      <ul className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link className="xdc-footer-link text-sm font-medium" href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
