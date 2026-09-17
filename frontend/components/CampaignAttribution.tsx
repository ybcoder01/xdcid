"use client";

import { track } from "@vercel/analytics";
import { useEffect } from "react";

const ALLOWED_SOURCES = new Set([
  "x",
  "telegram",
  "discord",
  "github",
  "partner",
  "newsletter",
]);
const ALLOWED_CAMPAIGNS = new Set(["launch", "beta", "developer"]);

export function CampaignAttribution() {
  useEffect(() => {
    if (window.location.hostname !== "xdcid.xyz" && window.location.hostname !== "www.xdcid.xyz") return;

    const params = new URLSearchParams(window.location.search);
    const source = params.get("utm_source")?.trim().toLowerCase();
    const campaign = params.get("utm_campaign")?.trim().toLowerCase();
    if (!source || !campaign || !ALLOWED_SOURCES.has(source) || !ALLOWED_CAMPAIGNS.has(campaign)) return;

    const key = `xdcid:campaign:${source}:${campaign}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    track("campaign_visit", { source, campaign });
  }, []);

  return null;
}
