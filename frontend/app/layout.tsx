import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata } from "next";
import { Nav } from "../components/Nav";
import { Providers } from "../components/Providers";

export const metadata: Metadata = {
  title: "XDCID",
  description: ".XDC names for XDC"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
