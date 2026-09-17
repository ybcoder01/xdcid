"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/pay\/[^/]+(?:\/.*)?$/, "/pay/[name]"],
  [/^\/name\/[^/]+(?:\/.*)?$/, "/name/[name]"],
];

export function sanitizeAnalyticsUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://xdcid.xyz");
    const dynamicRoute = DYNAMIC_ROUTES.find(([pattern]) =>
      pattern.test(url.pathname),
    );

    url.pathname = dynamicRoute?.[1] ?? url.pathname;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "https://xdcid.xyz/unknown";
  }
}

export function redactAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const baseUrl = typeof window === "undefined"
      ? "https://invalid.local"
      : window.location.origin;
    const hostname = new URL(event.url, baseUrl).hostname;
    if (hostname !== "xdcid.xyz" && hostname !== "www.xdcid.xyz") return null;
    return { ...event, url: sanitizeAnalyticsUrl(event.url) };
  } catch {
    return null;
  }
}

export function PrivacyAnalytics() {
  return (
    <Analytics
      beforeSend={redactAnalyticsEvent}
      debug={false}
      mode="production"
    />
  );
}
