type TokenLogoSymbol = "USDC" | "XDC" | "ETH" | "POL";

export function TokenLogo({
  symbol,
  size = 36,
}: {
  symbol: TokenLogoSymbol;
  size?: number;
}) {
  const label = symbol + " logo";
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 40 40",
    role: "img",
    "aria-label": label,
  } as const;

  if (symbol === "USDC") {
    return (
      <svg {...shared}>
        <circle cx="20" cy="20" r="20" fill="#2775CA" />
        <path d="M23.2 13.7c-1-.5-2-.7-3.2-.7-2.9 0-4.8 1.5-4.8 3.8 0 5.6 9.1 3 9.1 6.7 0 1.2-1 2-2.7 2-1.8 0-3.3-.5-4.7-1.5l-1.4 3c1.1.8 2.6 1.3 4.1 1.5V31h2.7v-2.6c3.1-.3 5.1-2.2 5.1-5 0-5.8-9.1-3.3-9.1-6.7 0-1 .8-1.7 2.3-1.7 1.3 0 2.4.3 3.5.9l1.1-2.2Z" fill="white" />
        <path d="M11.8 11.8a11.6 11.6 0 0 0 0 16.4M28.2 11.8a11.6 11.6 0 0 1 0 16.4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (symbol === "ETH") {
    return (
      <svg {...shared}>
        <circle cx="20" cy="20" r="20" fill="#EEF0FF" />
        <path d="m20 5 9 15-9 5-9-5 9-15Z" fill="#627EEA" />
        <path d="m20 27 9-5-9 13-9-13 9 5Z" fill="#4656A6" />
        <path d="M20 5v20l9-5-9-15Z" fill="#8798ED" />
      </svg>
    );
  }

  if (symbol === "POL") {
    return (
      <svg {...shared}>
        <circle cx="20" cy="20" r="20" fill="#8247E5" />
        <path d="m14.8 23.3 4.2 2.4c.7.4 1.6.4 2.3 0l4.2-2.4a2.3 2.3 0 0 0 1.2-2v-4.9a2.3 2.3 0 0 0-1.2-2L21.3 12c-.7-.4-1.6-.4-2.3 0l-4.2 2.4m10.4 2.3-4-2.3a2.3 2.3 0 0 0-2.3 0l-4.2 2.4a2.3 2.3 0 0 0-1.2 2v4.9a2.3 2.3 0 0 0 1.2 2l4.2 2.4" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <circle cx="20" cy="20" r="20" fill="#183E72" />
      <path d="m10 12 6.4 8L10 28h5.5l6.3-8-6.3-8H10Zm14.5 0-6.3 8 6.3 8H30l-6.4-8 6.4-8h-5.5Z" fill="white" />
    </svg>
  );
}

export function nativeTokenForChain(chainId: number): Exclude<TokenLogoSymbol, "USDC"> {
  if (chainId === 137) return "POL";
  if (chainId === 1 || chainId === 8453 || chainId === 42161) return "ETH";
  return "XDC";
}
