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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("xdcid-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

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
    <header className="xdc-site-nav sticky top-0 z-20 border-b backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link aria-label="XDCID home" className="flex shrink-0 items-center" href="/">
          <span aria-hidden="true" className="xdc-logo-light relative h-8 w-32 overflow-hidden">
            <Image
              alt=""
              className="absolute left-[-19px] top-[-26px] h-[84px] w-[158px] max-w-none"
              height={914}
              priority
              src="/XDCID-transparent.png"
              width={1714}
            />
          </span>
          <span aria-hidden="true" className="xdc-logo-dark h-8 items-center gap-2">
            <span className="relative block h-8 w-12 overflow-hidden">
              <Image
                alt=""
                className="absolute left-[-19px] top-[-26px] h-[84px] w-[158px] max-w-none"
                height={916}
                priority
                src="/XDCID-transparent.png"
                width={1717}
              />
            </span>
            <span className="text-[1.18rem] font-semibold tracking-[0.12em] text-[#f7faf9]">XDCID</span>
          </span>
        </Link>
        <nav className="hidden min-w-0 items-center gap-1 text-sm xl:flex">
          {navigationItems.map((item) => (
            <NavigationLink key={item.href} {...item} />
          ))}
          {canSeeAdmin ? (
            <Link className="xdc-nav-link rounded-md px-3 py-2" href="/admin">
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden xl:inline-flex" onToggle={toggleTheme} theme={theme} />
          <WalletButton />
          <button
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            className="xdc-icon-button grid h-11 w-11 place-items-center text-xl xl:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
        {menuOpen ? (
          <nav className="xdc-mobile-nav absolute left-4 right-4 top-[calc(100%+0.5rem)] grid gap-1 p-3 text-sm shadow-xl xl:hidden">
            {navigationItems.map((item) => (
              <NavigationLink key={item.href} mobile {...item} />
            ))}
            {canSeeAdmin ? (
              <Link className="xdc-nav-link rounded-xl px-4 py-3 font-medium" href="/admin">Admin</Link>
            ) : null}
            <ThemeToggle className="mt-1 flex w-full justify-center" onToggle={toggleTheme} theme={theme} />
          </nav>
        ) : null}
      </div>
    </header>
  );
}

function ThemeToggle({
  className,
  onToggle,
  theme,
}: {
  className?: string;
  onToggle: () => void;
  theme: "dark" | "light";
}) {
  const targetTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      aria-label={`Switch to ${targetTheme} mode`}
      className={`${className ?? ""} xdc-theme-toggle h-10 items-center gap-2 rounded-full border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]`}
      onClick={onToggle}
      type="button"
    >
      <span aria-hidden="true" className="text-sm">{theme === "dark" ? "☼" : "◐"}</span>
      {targetTheme}
    </button>
  );
}

function NavigationLink({ href, label, upcoming, mobile = false }: {
  href: string;
  label: string;
  upcoming?: boolean;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`${mobile ? "rounded-xl px-4 py-3 font-medium" : "rounded-md px-3 py-2"} xdc-nav-link`}
      href={href}
    >
      <span>{label}</span>
      {upcoming ? (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Soon</span>
      ) : null}
    </Link>
  );
}
