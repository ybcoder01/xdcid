import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import { Nav } from "../components/Nav";
import { Providers } from "../components/Providers";
import { evaluateFeatureFlags } from "../flags";

const title = "XDCID";
const description = ".XDC names for identities, profiles, and payments on XDC";

export const metadata: Metadata = {
  metadataBase: new URL("https://xdcid.xyz"),
  applicationName: title,
  title,
  description,
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const featureFlags = await evaluateFeatureFlags();

  return (
    <html lang="en">
      <body>
        <Providers featureFlags={featureFlags}>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
