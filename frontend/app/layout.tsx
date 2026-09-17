import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import { Nav } from "../components/Nav";
import { Providers } from "../components/Providers";
import { PrivacyAnalytics } from "../components/PrivacyAnalytics";
import { SiteFooter } from "../components/SiteFooter";
import { CampaignAttribution } from "../components/CampaignAttribution";

const title = "XDCID";
const description = "Wallet-owned .XDC identities on XDC Network with payment destinations across XDC, Ethereum, Base, Arbitrum, and Polygon.";
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: title,
  url: "https://xdcid.xyz",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description,
  codeRepository: "https://github.com/ybcoder01/xdcid",
  publisher: {
    "@type": "Organization",
    name: title,
    url: "https://xdcid.xyz",
    sameAs: ["https://github.com/ybcoder01/xdcid"],
  },
};

export const metadata: Metadata = {
  metadataBase: new URL("https://xdcid.xyz"),
  applicationName: title,
  title: { default: title, template: "%s | XDCID" },
  description,
  keywords: ["XDCID", ".xdc", "XDC Network", "Web3 identity", "multichain payments"],
  icons: {
    icon: "/XDCID.png",
    apple: "/XDCID.png"
  },
  openGraph: {
    type: "website",
    siteName: title,
    title,
    description,
    images: [
      {
        url: "/XDCID.png",
        width: 1714,
        height: 914,
        alt: "XDCID"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/XDCID.png"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          type="application/ld+json"
        />
        <Providers>
          <Nav />
          {children}
          <SiteFooter />
        </Providers>
        <CampaignAttribution />
        <PrivacyAnalytics />
      </body>
    </html>
  );
}
