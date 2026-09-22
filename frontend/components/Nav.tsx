"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import {
  adminPricingPolicyAddress,
  addresses,
  ownableAbi,
  zeroAddress,
} from "../config/contracts";
import { WalletButton } from "./WalletButton";

type AdminSessionStatus = {
  authenticated?: boolean;
  address?: string;
};

const ADMIN_SESSION_CHANGED_EVENT = "xdcid:admin-session-changed";
const navigationItems = [
  { href: "/send", label: "Send" },
  { href: "/pay", label: "Pay Links" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/subdomains", label: "Subdomains" },
  { href: "/history", label: "History" },
  { href: "/archive", label: "Archive" },
  { href: "/developers", label: "Developers" },
];

export function Nav() {
  const pathname = usePathname();
  const { address } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authorizedSessionAddress, setAuthorizedSessionAddress] =
    useState<string>();
  const registryOwner = useReadContract({
    address: addresses.registry,
    abi: ownableAbi,
    functionName: "owner"
  });
  const policyOwner = useReadContract({
    address: adminPricingPolicyAddress,
    abi: ownableAbi,
    functionName: "owner",
    query: { enabled: adminPricingPolicyAddress !== zeroAddress }
  });
  const checkAdminSession = useCallback(async () => {
    if (!address) {
      setAuthorizedSessionAddress(undefined);
      return;
    }

    try {
      const response = await fetch("/api/admin/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const session = (await response.json().catch(() => ({}))) as AdminSessionStatus;
      if (
        response.ok &&
        session.authenticated === true &&
        session.address?.toLowerCase() === address.toLowerCase()
      ) {
        setAuthorizedSessionAddress(session.address);
        return;
      }

      const eligibilityResponse = await fetch(
        `/api/admin/auth/eligibility?address=${encodeURIComponent(address)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const eligibility = (await eligibilityResponse
        .json()
        .catch(() => ({}))) as { eligible?: boolean };
      setAuthorizedSessionAddress(
        eligibilityResponse.ok && eligibility.eligible === true
          ? address
          : undefined,
      );
    } catch {
      setAuthorizedSessionAddress(undefined);
    }
  }, [address]);

  useEffect(() => {
    void checkAdminSession();

    const refreshSession = () => void checkAdminSession();
    window.addEventListener(ADMIN_SESSION_CHANGED_EVENT, refreshSession);
    window.addEventListener("focus", refreshSession);
    return () => {
      window.removeEventListener(ADMIN_SESSION_CHANGED_EVENT, refreshSession);
      window.removeEventListener("focus", refreshSession);
    };
  }, [checkAdminSession]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const canSeeAdmin = useMemo(
    () =>
      !!address &&
      (authorizedSessionAddress?.toLowerCase() === address.toLowerCase() ||
        [registryOwner.data, policyOwner.data]
          .filter((candidate): candidate is `0x${string}` => !!candidate)
          .some((candidate) => candidate.toLowerCase() === address.toLowerCase())),
    [address, authorizedSessionAddress, policyOwner.data, registryOwner.data],
  );

  if (/^\/pay\/[^/]+/.test(pathname)) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link aria-label="XDCID home" className="flex shrink-0 items-center" href="/">
          <span aria-hidden="true" className="relative block h-8 w-28 overflow-hidden">
            <Image
              alt=""
              className="absolute left-[-23px] top-[-26px] h-[84px] w-[158px] max-w-none"
              height={914}
              priority
              src="/XDCID.png"
              width={1714}
            />
          </span>
        </Link>
        <nav className="hidden min-w-0 items-center gap-1 text-sm xl:flex">
          {navigationItems.map((item) => (
            <NavigationLink key={item.href} {...item} />
          ))}
          {canSeeAdmin ? (
            <Link className="rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950" href="/admin">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton />
          <button
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl text-slate-900 shadow-sm xl:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
        {menuOpen ? (
          <nav className="absolute left-4 right-4 top-[calc(100%+0.5rem)] grid gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl xl:hidden">
            {navigationItems.map((item) => (
              <NavigationLink key={item.href} mobile {...item} />
            ))}
            {canSeeAdmin ? (
              <Link className="rounded-xl px-4 py-3 font-medium text-slate-800 hover:bg-slate-100" href="/admin">Admin</Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </header>
  );
}

function NavigationLink({ href, label, upcoming, mobile = false }: {
  href: string;
  label: string;
  upcoming?: boolean;
  mobile?: boolean;
}) {
  return (
    <Link
      className={mobile
        ? "rounded-xl px-4 py-3 font-medium text-slate-800 hover:bg-slate-100"
        : "rounded-md px-3 py-2 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"}
      href={href}
    >
      <span>{label}</span>
      {upcoming ? (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Soon</span>
      ) : null}
    </Link>
  );
}
