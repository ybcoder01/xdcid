export type PaymentReceiptRecord = {
  id: string;
  name: string;
  creator: string;
  payer: string;
  amountAtomic: string;
  token: string;
  tokenDecimals: number;
  transactionType: "native" | "same_chain_usdc" | "cross_chain_usdc" | "legacy";
  completionMethod: "direct" | "standard" | "automatic" | "recovered" | "wallet";
  paymentChannel: "send" | "pay_link";
  direction: "incoming" | "outgoing";
  xdcidFeeAtomic: string | null;
  circleFeeAtomic: string | null;
  sourceChainId: number;
  destinationChainId: number;
  sourceTransactionHash: string;
  destinationTransactionHash: string | null;
  completedAt: string;
  payerName?: string | null;
  destinationName?: string | null;
  privateContext?: {
    reference?: string;
    description?: string;
  };
};

export const NETWORKS = [
  [50, "XDC Network"],
  [1, "Ethereum"],
  [137, "Polygon"],
  [8453, "Base"],
  [42161, "Arbitrum One"],
  [51, "XDC Apothem"],
  [11155111, "Ethereum Sepolia"],
  [80002, "Polygon Amoy"],
  [84532, "Base Sepolia"],
  [421614, "Arbitrum Sepolia"]
] as const;

export function formatAtomic(value: string, decimals: number): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  return (negative ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

export function networkName(chainId: number): string {
  return NETWORKS.find(([id]) => id === chainId)?.[1] || "Chain " + chainId;
}

export function displayRoute(record: PaymentReceiptRecord): string {
  return /^0x[a-fA-F0-9]{40}$/.test(record.name) ? "Direct wallet" : record.name;
}

export function destinationReceiptName(record: PaymentReceiptRecord): string | undefined {
  if (record.destinationName) return record.destinationName;
  return /^0x[a-fA-F0-9]{40}$/.test(record.name) ? undefined : record.name;
}

export function paymentKind(record: PaymentReceiptRecord): string {
  if (record.paymentChannel === "pay_link") return "Pay Link";
  if (record.completionMethod === "automatic" || record.completionMethod === "recovered") return "Forwarding";
  if (record.transactionType === "native") return "Native transfer";
  if (record.transactionType === "same_chain_usdc") return "Same-chain USDC";
  if (record.transactionType === "cross_chain_usdc") return "Cross-chain USDC";
  return "Legacy payment";
}

export function completionLabel(method: PaymentReceiptRecord["completionMethod"]): string {
  return {
    direct: "Direct completion",
    standard: "Standard completion",
    automatic: "Automatic forwarding",
    recovered: "Recovered transfer",
    wallet: "Wallet completion"
  }[method];
}

export function formatFee(value: string | null): string {
  return value ? formatAtomic(value, 6) + " USDC" : "—";
}

export function shortAddress(address: string): string {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

export function explorerLink(chainId: number, hash: string): string {
  const bases: Record<number, string> = {
    1: "https://etherscan.io/tx/",
    50: "https://xdcscan.com/tx/",
    51: "https://testnet.xdcscan.com/tx/",
    137: "https://polygonscan.com/tx/",
    8453: "https://basescan.org/tx/",
    42161: "https://arbiscan.io/tx/",
    11155111: "https://sepolia.etherscan.io/tx/",
    80002: "https://amoy.polygonscan.com/tx/",
    84532: "https://sepolia.basescan.org/tx/",
    421614: "https://sepolia.arbiscan.io/tx/"
  };
  return (bases[chainId] || "https://xdcscan.com/tx/") + hash;
}

export function downloadPaymentReceiptPdf(record: PaymentReceiptRecord): void {
  const bytes = createPaymentReceiptPdf(record);
  const payload = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(payload).set(bytes);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "xdcid-receipt-" + safeFilename(record.id) + ".pdf";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function createPaymentReceiptPdf(record: PaymentReceiptRecord): Uint8Array {
  const completed = new Date(record.completedAt);
  const destinationName = destinationReceiptName(record);
  const lines: Array<[string, string]> = [
    ["Payment ID", record.id],
    ["Status", "Completed"],
    ["Date", completed.toISOString()],
    ["Payment type", paymentKind(record) + " / " + completionLabel(record.completionMethod)],
    ["Direction", record.direction === "incoming" ? "Incoming" : "Outgoing"],
    ["From", record.payer],
    ...(record.payerName ? [["Payer ID", record.payerName] as [string, string]] : []),
    ["To", record.creator],
    ...(destinationName ? [["Destination ID", destinationName] as [string, string]] : []),
    ["Route", networkName(record.sourceChainId) + " to " + networkName(record.destinationChainId)],
    ["XDCID fee", formatFee(record.xdcidFeeAtomic)],
    ["Circle fee", formatFee(record.circleFeeAtomic)],
    ["Reference", record.privateContext?.reference || "-"],
    ["Description", record.privateContext?.description || "-"],
    ["Source transaction", record.sourceTransactionHash],
    ["Destination transaction", record.destinationTransactionHash || "-"]
  ];
  const content: string[] = [
    "0.03 0.07 0.16 rg 0 650 612 142 re f",
    "0.08 0.50 0.46 rg 0 642 612 8 re f",
    "1 1 1 rg BT /F1 13 Tf 54 742 Td (XDCID PRIVATE PAYMENT RECEIPT) Tj ET",
    `1 1 1 rg BT /F2 30 Tf 54 695 Td (${pdfText(formatAtomic(record.amountAtomic, record.tokenDecimals) + " " + record.token)}) Tj ET`,
    `0.78 0.84 0.91 rg BT /F1 12 Tf 54 670 Td (${pdfText(displayRoute(record))}) Tj ET`,
    "0.08 0.50 0.46 rg 500 704 58 24 re f",
    "1 1 1 rg BT /F2 10 Tf 511 712 Td (PAID) Tj ET"
  ];
  let y = 612;
  for (const [label, rawValue] of lines) {
    const values = wrapPdfText(rawValue, 72);
    content.push(`0.39 0.46 0.57 rg BT /F1 9 Tf 54 ${y} Td (${pdfText(label.toUpperCase())}) Tj ET`);
    content.push(`0.05 0.09 0.16 rg BT /F1 10 Tf 200 ${y} Td (${pdfText(values[0])}) Tj ET`);
    for (let index = 1; index < values.length; index += 1) {
      y -= 13;
      content.push(`0.05 0.09 0.16 rg BT /F1 10 Tf 200 ${y} Td (${pdfText(values[index])}) Tj ET`);
    }
    y -= 27;
  }
  content.push("0.86 0.89 0.93 RG 54 72 m 558 72 l S");
  content.push("0.39 0.46 0.57 rg BT /F1 9 Tf 54 48 Td (Generated from the wallet-authorized XDCID private history record.) Tj ET");
  content.push("0.39 0.46 0.57 rg BT /F1 9 Tf 54 34 Td (Verify settlement independently using the transaction hash and the relevant block explorer.) Tj ET");
  return buildPdf(content.join("\n"));
}

function wrapPdfText(value: string, length: number): string[] {
  const safe = ascii(value);
  if (safe.length <= length) return [safe];
  const chunks: string[] = [];
  for (let index = 0; index < safe.length; index += length) chunks.push(safe.slice(index, index + length));
  return chunks;
}

function pdfText(value: string): string {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function ascii(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "-");
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function buildPdf(stream: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += offsets[index].toString().padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
