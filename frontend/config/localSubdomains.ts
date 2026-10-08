export function loadSubdomains(address?: string) {
  if (!address || typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(address));
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export function saveSubdomain(address: string, name: string) {
  const names = Array.from(new Set([...loadSubdomains(address), name]));
  window.localStorage.setItem(key(address), JSON.stringify(names));
}

function key(address: string) {
  return `xns:subdomains:${address.toLowerCase()}`;
}
