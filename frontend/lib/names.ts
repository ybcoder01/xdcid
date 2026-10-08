export const XNS_SUFFIX = ".xdc";
export const MIN_XNS_LABEL_LENGTH = 2;
export const MAX_XNS_LABEL_LENGTH = 63;

export type ParsedXnsName = {
  input: string;
  label: string;
  name: string;
  isValid: boolean;
  error?: string;
};

export type ParsedResolvableXnsName = ParsedXnsName & {
  kind: "top-level" | "subdomain";
  parentName?: string;
  subdomainLabel?: string;
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

/**
 * Parses a payment/resolution target. Registration continues to use
 * parseXnsName so only top-level labels can reach the top-level registrar.
 */
export function parseResolvableXnsName(value: string): ParsedResolvableXnsName {
  const input = value.trim();
  const withoutSuffix = input.toLowerCase().endsWith(XNS_SUFFIX)
    ? input.slice(0, -XNS_SUFFIX.length)
    : input;
  const labels = withoutSuffix.toLowerCase().split(".");

  if (labels.length === 1) {
    return { ...parseXnsName(input), kind: "top-level" };
  }

  const name = withoutSuffix.toLowerCase() + XNS_SUFFIX;
  if (labels.length !== 2) {
    return {
      input,
      label: withoutSuffix.toLowerCase(),
      name,
      kind: "subdomain",
      isValid: false,
      error: "Use a name.xdc or subdomain.name.xdc",
    };
  }

  const [subdomainLabel, parentLabel] = labels;
  const parent = parseXnsName(parentLabel);
  if (!parent.isValid) {
    return {
      input,
      label: withoutSuffix.toLowerCase(),
      name,
      kind: "subdomain",
      parentName: parent.name,
      subdomainLabel,
      isValid: false,
      error: parent.error,
    };
  }

  if (subdomainLabel.length < 1 || subdomainLabel.length > MAX_XNS_LABEL_LENGTH) {
    return {
      input,
      label: withoutSuffix.toLowerCase(),
      name,
      kind: "subdomain",
      parentName: parent.name,
      subdomainLabel,
      isValid: false,
      error: "Subdomain labels must be between 1 and 63 characters",
    };
  }

  if (!/^[a-z0-9-]+$/.test(subdomainLabel)) {
    return {
      input,
      label: withoutSuffix.toLowerCase(),
      name,
      kind: "subdomain",
      parentName: parent.name,
      subdomainLabel,
      isValid: false,
      error: "Use only letters, numbers, hyphens, and one dot before the parent name",
    };
  }

  if (subdomainLabel.startsWith("-") || subdomainLabel.endsWith("-")) {
    return {
      input,
      label: withoutSuffix.toLowerCase(),
      name,
      kind: "subdomain",
      parentName: parent.name,
      subdomainLabel,
      isValid: false,
      error: "A subdomain label cannot start or end with a hyphen",
    };
  }

  return {
    input,
    label: withoutSuffix.toLowerCase(),
    name: `${subdomainLabel}.${parent.name}`,
    kind: "subdomain",
    parentName: parent.name,
    subdomainLabel,
    isValid: true,
  };
}

function invalid(input: string, label: string, name: string, error: string): ParsedXnsName {
  return { input, label, name, isValid: false, error };
}
