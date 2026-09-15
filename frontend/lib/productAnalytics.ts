"use client";

import { track } from "@vercel/analytics";

type Outcome = "started" | "confirmed" | "failed";
type PaymentChannel = "send" | "pay_link";
type PayLinkAction = "created" | "creation_failed" | "opened" | "cancelled";

const NETWORK_NAMES: Record<number, string> = {
  1: "ethereum",
  50: "xdc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
};

function canTrackProduction(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "xdcid.xyz" ||
    window.location.hostname === "www.xdcid.xyz";
}

function safeNetwork(chainId: number): string {
  return NETWORK_NAMES[chainId] ?? "other";
}

function safeAsset(asset: string): string {
  const normalized = asset.toUpperCase();
  return ["XDC", "USDC", "ETH", "POL"].includes(normalized)
    ? normalized.toLowerCase()
    : "other";
}

export function trackRegistration(
  outcome: Outcome,
  paymentCurrency: string,
  termYears: number,
) {
  if (!canTrackProduction()) return;
  track(`registration_${outcome}`, {
    asset: safeAsset(paymentCurrency),
    term: [1, 3, 5, 10].includes(termYears) ? `${termYears}y` : "other",
  });
}

export function trackPayment(
  channel: PaymentChannel,
  outcome: Outcome,
  asset: string,
  sourceChainId: number,
  destinationChainId: number,
) {
  if (!canTrackProduction()) return;
  track(`${channel}_${outcome}`, {
    asset: safeAsset(asset),
    route: `${safeNetwork(sourceChainId)}-${safeNetwork(destinationChainId)}`,
  });
}

export function trackPayLink(
  action: PayLinkAction,
  asset: string,
  sourceChainId: number,
  destinationChainId: number,
) {
  if (!canTrackProduction()) return;
  track(`pay_link_${action}`, {
    asset: safeAsset(asset),
    route: `${safeNetwork(sourceChainId)}-${safeNetwork(destinationChainId)}`,
  });
}
