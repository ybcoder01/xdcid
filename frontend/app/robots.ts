import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/archive",
        "/history",
        "/pay/",
        "/deployment/",
        "/testing/",
      ],
    },
    sitemap: "https://xdcid.xyz/sitemap.xml",
  };
}
