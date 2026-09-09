export function BaseNetworkLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <rect fill="#0000FF" height="32" rx="2.53" width="32" />
    </svg>
  );
}
