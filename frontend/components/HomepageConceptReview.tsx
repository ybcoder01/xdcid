"use client";

import Link from "next/link";
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
  validationError?: string;
  onInput: (value: string) => void;
};

const networks = [
  { name: "XDC Network", chainId: 50, color: "#0d7775", route: "Owner address" },
  { name: "Ethereum", chainId: 1, color: "#6978c9", route: "Custom route" },
  { name: "Base", chainId: 8453, color: "#2864f0", route: "Custom route" },
  { name: "Arbitrum", chainId: 42161, color: "#4d92bf", route: "Custom route" },
  { name: "Polygon", chainId: 137, color: "#8a54d8", route: "Custom route" },
] as const;

export function HomepageConceptReview(props: Props) {
  const displayName = props.input.trim() && props.isValid ? props.name : "YOURNAME.XDC";
  const presentation = availabilityPresentation(
    props.availabilityState,
    props.name,
    props.validationError,
  );

  return (
    <main className="relative h-[calc(100dvh-73px)] min-h-[520px] overflow-hidden bg-white">
      <section className="grid h-full grid-rows-[minmax(0,1fr)_170px] overflow-hidden bg-[#f5f1e8] text-[#151719] min-[700px]:grid-rows-[1fr_0.42fr]">
        <div className="grid min-h-0 grid-cols-1 grid-rows-[0.78fr_1.22fr] border-b border-black min-[700px]:grid-cols-12 min-[700px]:grid-rows-1">
          <div className="col-span-1 flex min-w-0 flex-col justify-between border-b border-black p-4 min-[700px]:col-span-8 min-[700px]:border-b-0 min-[700px]:border-r min-[700px]:p-[4vw]">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-black/45">
              <span>01 / Choose a name</span><span>XDCID</span>
            </div>
            <div>
              <h1 className="truncate text-[clamp(2.15rem,9vw,4rem)] font-semibold uppercase leading-[0.78] tracking-[-0.075em] min-[700px]:text-[clamp(2.7rem,6vw,6.5rem)]">{displayName}</h1>
              <p className="mt-3 max-w-xl text-lg font-medium leading-tight min-[700px]:mt-6 min-[700px]:text-3xl">Your name, wherever you transact.</p>
              <p className="mt-3 hidden max-w-xl text-sm leading-6 text-black/55 min-[700px]:block min-[700px]:text-base">Use one .xdc identity across XDC, Ethereum, Base, Arbitrum and Polygon—each routed to the address you choose.</p>
            </div>
            <div className="hidden items-center gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-black/45 min-[700px]:flex"><span>Wallet-owned</span><span>·</span><span>Non-custodial</span><span>·</span><span>Built on XDC</span></div>
          </div>

          <div className="relative col-span-1 flex min-h-0 flex-col overflow-hidden bg-[#071c1b] text-white min-[700px]:col-span-4">
            <div aria-hidden="true" className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#1f8f87]/20 blur-3xl" />
            <div className="relative flex items-center justify-between border-b border-white/15 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.17em] text-white/55"><span>03 / Route it</span><span>5-network resolver</span></div>
            <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-1 px-4 py-2 min-[700px]:gap-2 min-[700px]:px-5 min-[700px]:py-4">
              <div className="mb-2 hidden items-end justify-between gap-3 min-[700px]:flex">
                <p className="text-[1.35rem] font-semibold leading-[1.02] tracking-[-0.035em]">One name.<br /><span className="text-[#70d8ca]">Five precise routes.</span></p>
                <span className="mb-0.5 text-right font-mono text-[7px] uppercase leading-4 tracking-[0.14em] text-white/35">Set by<br />the owner</span>
              </div>
              {networks.map((network) => (
                <div className="group relative grid grid-cols-[34px_1fr_auto] items-center gap-3 overflow-hidden rounded-lg border border-white/10 border-l-[3px] bg-white/[0.06] px-3 py-2 transition-colors hover:bg-white/[0.09]" key={network.name} style={{ borderLeftColor: network.color }}>
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-md bg-white shadow-[0_3px_12px_rgba(0,0,0,.18)]"><NetworkLogo chainId={network.chainId} size={23} /></span>
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold tracking-[-0.01em]">{network.name}</span><span className="block font-mono text-[7px] uppercase tracking-[0.12em] text-white/35">{network.route}</span></span>
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2 py-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: network.color }} /><span className="font-mono text-[8px] text-white/45">0x…</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 min-[700px]:grid-cols-12">
          <div className="col-span-1 flex items-center px-4 min-[700px]:col-span-8 min-[700px]:px-[4vw]">
            <div className="w-full">
              <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/45" htmlFor="homepage-name">Find your XDCID</label>
              <div className="mt-2 grid grid-cols-[1fr_auto] border-2 border-black bg-white">
                <div className="flex min-w-0 items-center px-4">
                  <input aria-invalid={!!props.input.trim() && !props.isValid} className="min-w-0 flex-1 border-0 bg-transparent px-0 py-3 font-mono text-base shadow-none placeholder:text-black/30 focus:shadow-none min-[700px]:text-lg" id="homepage-name" onChange={(event) => props.onInput(event.target.value)} placeholder="yourname" value={props.input} />
                  <span className="font-mono text-base text-[#0d7775] min-[700px]:text-lg">.xdc</span>
                </div>
                {presentation.href ? (
                  <Link className="grid min-w-32 place-items-center border-l-2 border-black bg-black px-4 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-[#0d7775] focus-visible:bg-[#0d7775] min-[700px]:min-w-44 min-[700px]:px-6" href={presentation.href}>
                    {presentation.action}
                  </Link>
                ) : (
                  <span className="grid min-w-32 place-items-center border-l-2 border-black bg-black/35 px-4 text-center font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white min-[700px]:min-w-44 min-[700px]:px-6">
                    {presentation.action}
                  </span>
                )}
              </div>
              <p aria-live="polite" className={presentation.error ? "mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-red-600" : presentation.success ? "mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#0d7775]" : "mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-black/40"}>{presentation.message}</p>
            </div>
          </div>
          <div className="hidden flex-col justify-between border-l border-black bg-[#ff735d] p-5 min-[700px]:col-span-4 min-[700px]:flex min-[700px]:p-6">
            <span className="font-mono text-[10px] uppercase tracking-[0.17em]">02 / Own it</span>
            <p className="text-xl font-semibold leading-tight min-[700px]:text-2xl">Controlled by<br />your wallet.</p>
          </div>
        </div>
      </section>
    </main>
  );
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
