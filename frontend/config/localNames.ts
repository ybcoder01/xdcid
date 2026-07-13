export function loadNames(address?: string) {
  if (!address || typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key(address));
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export function saveName(address: string, name: string) {
  const names = Array.from(new Set([...loadNames(address), name]));
  window.localStorage.setItem(key(address), JSON.stringify(names));
}

function key(address: string) {
  return `xns:names:${address.toLowerCase()}`;
}
