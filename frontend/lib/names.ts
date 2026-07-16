export const XNS_SUFFIX = ".xdc";
export const MIN_XNS_LABEL_LENGTH = 3;
export const MAX_XNS_LABEL_LENGTH = 63;

export type ParsedXnsName = {
  input: string;
  label: string;
  name: string;
  isValid: boolean;
  error?: string;
};

export function parseXnsName(value: string): ParsedXnsName {
  const input = value.trim();
  const withoutSuffix = input.toLowerCase().endsWith(XNS_SUFFIX)
    ? input.slice(0, -XNS_SUFFIX.length)
    : input;
  const label = withoutSuffix.toLowerCase();
  const name = label + XNS_SUFFIX;

  if (label.length < MIN_XNS_LABEL_LENGTH) {
    return invalid(input, label, name, "Name must be at least " + MIN_XNS_LABEL_LENGTH + " characters");
  }

  if (label.length > MAX_XNS_LABEL_LENGTH) {
    return invalid(input, label, name, "Name must be at most " + MAX_XNS_LABEL_LENGTH + " characters");
  }

  if (!/^[a-z0-9-]+$/.test(label)) {
    return invalid(input, label, name, "Use only letters, numbers, and hyphens");
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    return invalid(input, label, name, "Name cannot start or end with a hyphen");
  }

  return { input, label, name, isValid: true };
}

function invalid(input: string, label: string, name: string, error: string): ParsedXnsName {
  return { input, label, name, isValid: false, error };
}
