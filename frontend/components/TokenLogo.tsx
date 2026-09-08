import Image from "next/image";

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
    className: "shrink-0",
    role: "img",
    "aria-label": label,
  } as const;

  if (symbol === "USDC") {
    return (
      <svg {...shared} viewBox="0 0 96 96">
        <path d="M48 95C73.9574 95 95 73.9574 95 48C95 22.0426 73.9574 1 48 1C22.0426 1 1 22.0426 1 48C1 73.9574 22.0426 95 48 95Z" fill="#0B53BF" />
        <path d="M56.4609 13.7778V19.8291C68.5341 23.4716 77.3759 34.6928 77.3759 47.9997C77.3759 61.3066 68.5341 72.5278 56.4609 76.1703V82.2216C71.8534 78.4616 83.2509 64.5672 83.2509 47.9997C83.2509 31.4322 71.8534 17.5378 56.4609 13.7778Z" fill="white" />
        <path d="M18.625 47.9997C18.625 34.6928 27.4669 23.4716 39.54 19.8291V13.7778C24.1475 17.5378 12.75 31.4322 12.75 47.9997C12.75 64.5672 24.1475 78.4616 39.54 82.2216V76.1703C27.4669 72.5572 18.625 61.3066 18.625 47.9997Z" fill="white" />
        <path d="M60.6319 54.5506C60.6319 42.5362 41.8025 47.4713 41.8025 40.8325C41.8025 38.4531 43.7119 36.9256 47.3544 36.9256C51.7019 36.9256 53.2 39.0406 53.67 41.89H59.6625C59.1279 36.5426 56.0588 33.1662 50.9382 32.1604V27.4375H45.0632V31.9918C39.4534 32.7062 35.9275 35.973 35.9275 40.8325C35.9275 52.9056 54.7863 48.3819 54.7863 54.9031C54.7863 57.3706 52.4069 59.0156 48.3825 59.0156C43.1244 59.0156 41.3913 56.695 40.745 53.4931H34.8994C35.2781 59.3502 38.8897 63.0159 45.0632 63.9307V68.5625H50.9382V63.9923C56.9633 63.2139 60.6319 59.7089 60.6319 54.5506Z" fill="white" />
      </svg>
    );
  }

  if (symbol === "ETH") {
    return (
      <svg {...shared} viewBox="0 0 28 28">
        <path fill="#25292E" fillRule="evenodd" d="M14 28a14 14 0 1 0 0-28 14 14 0 0 0 0 28Z" clipRule="evenodd" />
        <path fill="white" fillOpacity=".3" fillRule="evenodd" d="M14 28a14 14 0 1 0 0-28 14 14 0 0 0 0 28Z" clipRule="evenodd" />
        <path fill="white" fillOpacity=".92" d="M8.19 14.77 14 18.21l5.8-3.44-5.8 8.19-5.81-8.19Z" />
        <path fill="white" d="m14 16.93-5.81-3.44L14 4.34l5.81 9.15L14 16.93Z" />
      </svg>
    );
  }

  if (symbol === "POL") {
    return (
      <svg {...shared} viewBox="0 0 28 28">
        <defs><linearGradient id="polygon-logo-gradient" x1="0" x2="28" y1="0" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#a229c5" /><stop offset="1" stopColor="#7b3fe4" /></linearGradient></defs>
        <circle cx="14" cy="14" r="14" fill="url(#polygon-logo-gradient)" />
        <path fill="white" d="m18.049 17.021 3.96-2.287a.681.681 0 0 0 .34-.589V9.572a.683.683 0 0 0-.34-.59l-3.96-2.286a.682.682 0 0 0-.68 0l-3.96 2.287a.682.682 0 0 0-.34.589v8.173L10.29 19.35l-2.777-1.604v-3.207l2.777-1.604 1.832 1.058V11.84l-1.492-.861a.681.681 0 0 0-.68 0l-3.96 2.287a.681.681 0 0 0-.34.589v4.573c0 .242.13.468.34.59l3.96 2.286a.68.68 0 0 0 .68 0l3.96-2.286a.682.682 0 0 0 .34-.589v-8.174l.05-.028 2.728-1.575 2.777 1.603v3.208l-2.777 1.603-1.83-1.056v2.151l1.49.86a.68.68 0 0 0 .68 0Z" />
      </svg>
    );
  }

  return <Image alt={label} className="shrink-0" height={size} src="/xdc-primary-icon.png" width={size} />;
}

export function nativeTokenForChain(chainId: number): Exclude<TokenLogoSymbol, "USDC"> {
  if (chainId === 137) return "POL";
  if (chainId === 1 || chainId === 8453 || chainId === 42161) return "ETH";
  return "XDC";
}
