import { BaseNetworkLogo } from "./BaseNetworkLogo";
import { TokenLogo, nativeTokenForChain } from "./TokenLogo";

const ARBITRUM_CHAIN_IDS = new Set([42161, 421614]);
const BASE_CHAIN_IDS = new Set([8453, 84532]);

export function NetworkLogo({ chainId, size = 24 }: { chainId: number; size?: number }) {
  if (BASE_CHAIN_IDS.has(chainId)) return <BaseNetworkLogo size={size} />;

  if (ARBITRUM_CHAIN_IDS.has(chainId)) {
    return (
      <svg
        aria-label="Arbitrum logo"
        className="shrink-0"
        height={size}
        role="img"
        viewBox="0 0 40 40"
        width={size}
      >
        <circle cx="20" cy="20" fill="#2d374b" r="18" />
        <path fill="#28a0f0" d="m27.3 35.5-6.1-9.6 3.4-5.8 7.8 12.4-5.1 3Zm6.5-4-8.2-12.9 3-5.1 8.3 13-3.1 5Z" />
        <path fill="#fff" d="M7.2 34.8 3 32.4 15.7 12.6c.9-1.5 2.9-2 4.8-2l2.2.1L7.2 34.8Zm20-24.1h-5.9L8.1 32.6l4.4 2.6 5.7-9.5 1.3-2.1 7.7-12.9Z" />
      </svg>
    );
  }

  return <TokenLogo size={size} symbol={nativeTokenForChain(chainId)} />;
}
