import Image from "next/image";

export const BASE_NETWORK_ICON_URL = "/base-network-icon.svg";

export function BaseNetworkLogo({ size = 28 }: { size?: number }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="shrink-0"
      height={size}
      src={BASE_NETWORK_ICON_URL}
      width={size}
    />
  );
}
