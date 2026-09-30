"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { pricingPolicyAbi } from "../config/contracts";
import type { RegistrationTerm } from "../lib/pricingPolicy";
import { NetworkLogo } from "./NetworkLogo";

export type HomepageAvailabilityState =
  | "idle"
  | "invalid"
  | "checking"
  | "available"
  | "registered"
  | "reserved"
  | "review"
  | "unavailable"
  | "error"
  | "unconfigured"
  | "unsupported";

type Props = {
  availabilityState: HomepageAvailabilityState;
  input: string;
  name: string;
  isValid: boolean;
  pricingPolicyAddress: `0x${string}`;
  registrationChainId: number;
  validationError?: string;
  onInput: (value: string) => void;
};

const networks = [
  { name: "XDC", chainId: 50, color: "#0d7775", position: "left-[7%] top-[22%]" },
  { name: "Ethereum", chainId: 1, color: "#6978c9", position: "left-[3%] top-[48%]" },
  { name: "Base", chainId: 8453, color: "#2864f0", position: "right-[6%] top-[25%]" },
  { name: "Arbitrum", chainId: 42161, color: "#4d92bf", position: "right-[3%] top-[55%]" },
  { name: "Polygon", chainId: 137, color: "#8a54d8", position: "left-[9%] top-[72%]" },
] as const;

const floatingNames = [
  { name: "maya.xdc", position: "left-[18%] top-[16%] -rotate-6" },
  { name: "builder.xdc", position: "right-[20%] top-[14%] rotate-6" },
  { name: "pay.xdc", position: "left-[22%] top-[78%] rotate-3" },
  { name: "aurora.xdc", position: "right-[19%] top-[76%] -rotate-3" },
  { name: "one.xdc", position: "right-[8%] top-[83%] rotate-6" },
] as const;

export function HomepageConceptReview(props: Props) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [termYears, setTermYears] = useState<RegistrationTerm>(1);
  const presentation = availabilityPresentation(
    props.availabilityState,
    props.name,
    props.validationError,
  );
  const showPrice = props.availabilityState === "available";
  const labelLength = props.name.endsWith(".xdc")
    ? props.name.slice(0, -4).length
    : props.name.length;
  const price = useReadContract({
    address: props.pricingPolicyAddress,
    chainId: props.registrationChainId,
    abi: pricingPolicyAbi,
    functionName: "priceUsdMicros",
    args: [0, BigInt(labelLength), BigInt(termYears)],
    query: { enabled: showPrice },
  });
  const actionHref = presentation.href && showPrice
    ? `${presentation.href}?years=${termYears}`
    : presentation.href;

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("xdcid-theme");
    const nextTheme = savedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("xdcid-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  };

  return (
    <main className="relative h-[calc(100dvh-73px)] min-h-[540px] overflow-hidden bg-[var(--home-bg)] text-[var(--home-ink)]">
      <section className="relative flex h-full items-center justify-center overflow-hidden px-4 pb-8 pt-14 sm:px-8 sm:pb-12 sm:pt-16">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,var(--home-glow),transparent_48%)]" />
        <div aria-hidden="true" className="absolute left-1/2 top-[48%] h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--home-line)] sm:h-[43rem] sm:w-[43rem]" />
        <div aria-hidden="true" className="absolute left-1/2 top-[48%] h-[23rem] w-[23rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--home-line)] sm:h-[31rem] sm:w-[31rem]" />
        <div aria-hidden="true" className="absolute left-1/2 top-[48%] h-[13rem] w-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--home-line)] sm:h-[19rem] sm:w-[19rem]" />

        <button
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-[var(--home-border)] bg-[var(--home-panel)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] shadow-sm hover:border-[#70d8ca] sm:right-7 sm:top-6"
          onClick={toggleTheme}
          type="button"
        >
          <span aria-hidden="true" className="text-sm">{theme === "dark" ? "☼" : "◐"}</span>
          {theme === "dark" ? "Light" : "Dark"}
        </button>

        <div aria-hidden="true" className="hidden sm:block">
          {floatingNames.map((item) => (
            <span className={`absolute ${item.position} rounded-full border border-[var(--home-border)] bg-[var(--home-panel-muted)] px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] text-[var(--home-muted)] shadow-sm`} key={item.name}>{item.name}</span>
          ))}
        </div>

        <div className="hidden lg:block">
          {networks.map((network) => (
            <div className={`absolute ${network.position} z-10 flex items-center gap-2 rounded-full border border-[var(--home-border)] bg-[var(--home-panel)] py-2 pl-2 pr-4 shadow-[0_12px_35px_var(--home-shadow)]`} key={network.name}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white"><NetworkLogo chainId={network.chainId} size={24} /></span>
              <span className="text-sm font-semibold">{network.name}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: network.color }} />
            </div>
          ))}
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#70d8ca] sm:text-xs">XDCID</p>
          <h1 className="mt-5 whitespace-nowrap text-[clamp(1.45rem,5.25vw,4.7rem)] font-semibold leading-none tracking-[-0.065em]">The shortest route to your wallet</h1>
          <p className="mt-5 text-sm text-[var(--home-muted)] sm:text-lg">One human-readable identity. Five verified destinations.</p>

          <div className="mt-8 w-full max-w-3xl sm:mt-10">
            <label className="sr-only" htmlFor="homepage-name">Find your XDCID</label>
            <div className="grid min-h-16 grid-cols-[1fr_auto] overflow-hidden rounded-2xl border border-[#70d8ca] bg-[var(--home-input)] shadow-[0_24px_70px_var(--home-shadow)] sm:min-h-[72px]">
              <div className="flex min-w-0 items-center px-4 sm:px-6">
                <input aria-invalid={!!props.input.trim() && !props.isValid} className="min-w-0 flex-1 border-0 bg-transparent px-0 py-4 text-base text-[var(--home-ink)] shadow-none placeholder:text-[var(--home-muted)] focus:shadow-none sm:text-lg" id="homepage-name" onChange={(event) => props.onInput(event.target.value)} placeholder="Find your name" value={props.input} />
                <span className="font-mono text-base font-semibold text-[#0d8883] sm:text-lg">.xdc</span>
              </div>
              {actionHref ? (
                <Link className="grid min-w-28 place-items-center bg-[#70d8ca] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#071c1b] hover:bg-[#8be8dc] focus-visible:bg-[#8be8dc] sm:min-w-40 sm:px-6" href={actionHref}>
                  {presentation.action}
                </Link>
              ) : (
                <span className="grid min-w-28 place-items-center bg-[#70d8ca]/45 px-4 text-center font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--home-muted)] sm:min-w-40 sm:px-6">
                  {presentation.action}
                </span>
              )}
            </div>
            <p aria-live="polite" className={presentation.error ? "mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#ff735d]" : presentation.success ? "mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#33b8ab]" : "mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--home-muted)]"}>{presentation.message}</p>
            {showPrice ? (
              <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-[var(--home-border)] bg-[var(--home-panel)] p-3 text-left shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:px-4">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--home-muted)]">Registration price</p>
                  <p className="mt-1 text-lg font-semibold">
                    {price.isLoading
                      ? "Reading live price…"
                      : price.isError || typeof price.data !== "bigint"
                        ? "Price unavailable"
                        : formatUsdMicros(price.data)}
                  </p>
                </div>
                <label className="text-right sm:text-left">
                  <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--home-muted)]">Term</span>
                  <select
                    className="mt-1 rounded-lg border border-[var(--home-border)] bg-[var(--home-input)] px-3 py-2 text-sm font-semibold text-[var(--home-ink)]"
                    onChange={(event) => setTermYears(Number(event.target.value) as RegistrationTerm)}
                    value={termYears}
                  >
                    <option value={1}>1 year</option>
                    <option value={3}>3 years · 10% off</option>
                    <option value={5}>5 years · 15% off</option>
                    <option value={10}>10 years · 20% off</option>
                  </select>
                </label>
                <Link className="col-span-2 rounded-xl bg-[#70d8ca] px-5 py-3 text-center text-sm font-semibold text-[#071c1b] hover:bg-[#8be8dc] sm:col-span-1" href={`/register/${encodeURIComponent(props.name)}?years=${termYears}`}>
                  Register
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mt-7 grid grid-cols-5 gap-2 lg:hidden">
            {networks.map((network) => (
              <div aria-label={network.name} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--home-border)] bg-white shadow-sm sm:h-12 sm:w-12" key={network.name} title={network.name}>
                <NetworkLogo chainId={network.chainId} size={25} />
              </div>
            ))}
          </div>

          <p className="mt-7 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--home-muted)]">Wallet-owned · Non-custodial · Built on XDC</p>
        </div>
      </section>
    </main>
  );
}

function formatUsdMicros(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `$${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

function availabilityPresentation(
  state: HomepageAvailabilityState,
  name: string,
  validationError?: string,
): { action: string; error?: boolean; href?: string; message: string; success?: boolean } {
  switch (state) {
    case "available":
      return {
        action: "Register →",
        href: `/register/${encodeURIComponent(name)}`,
        message: `${name} is available`,
        success: true,
      };
    case "registered":
      return {
        action: "View ID →",
        href: `/name/${encodeURIComponent(name)}`,
        message: `${name} is already registered`,
      };
    case "checking":
      return { action: "Checking…", message: `Checking ${name}…` };
    case "invalid":
      return {
        action: "Unavailable",
        error: true,
        message: validationError || "Enter a valid XDCID",
      };
    case "reserved":
      return {
        action: "Reserved",
        message: "Reserved in XDCDomains; migration is required",
      };
    case "review":
      return {
        action: "Review",
        message: "Registered in both registries; review is required",
      };
    case "unsupported":
      return {
        action: "Unavailable",
        message: "This name length is not currently supported",
      };
    case "unconfigured":
      return {
        action: "Unavailable",
        error: true,
        message: "Registration is not configured",
      };
    case "error":
      return {
        action: "Try again",
        error: true,
        message: "Could not check registry status",
      };
    case "unavailable":
      return { action: "Unavailable", message: `${name} is unavailable` };
    default:
      return {
        action: "Enter a name",
        message: "Availability is checked automatically",
      };
  }
}
