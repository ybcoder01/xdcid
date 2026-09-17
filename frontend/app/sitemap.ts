import type { MetadataRoute } from "next";

const publicRoutes = [
  "",
  "/send",
  "/pay",
  "/dashboard",
  "/developers",
  "/docs",
  "/trust",
  "/privacy",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((path) => ({
    url: `https://xdcid.xyz${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/developers" || path === "/trust" ? 0.8 : 0.6,
  }));
}
