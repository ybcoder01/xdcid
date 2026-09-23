import fs from "node:fs";

const reportPath = process.argv[2] || "slither-report.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

if (report.success !== true || !Array.isArray(report.results?.detectors)) {
  console.error("Slither did not produce a successful detector report.");
  console.error(report.error || "Unknown Slither failure");
  process.exit(1);
}

// Explicitly reviewed baseline. These entries remain visible in Slither output;
// the allowlist only prevents known results from making every CI run fail.
const reviewedHighOrMedium = new Set([
  "arbitrary-send-eth|XNSSignedQuoteRegistrar._collectPayment",
  "arbitrary-send-eth|XNSRegistrarV2._collectPayment",
  "arbitrary-send-eth|XNSSubdomainRegistrar._collectPayment",
  "reentrancy-eth|Reentrancy in XNSSubdomainRegistrar.registerWithQuote",
  "reentrancy-eth|Reentrancy in XNSSubdomainRegistrar.renewWithQuote",
  "unused-return|XNSPrimaryRegistrar._initializePrimary",
]);

const counts = {};
const unexpected = [];
for (const finding of report.results.detectors) {
  counts[finding.impact] = (counts[finding.impact] || 0) + 1;
  if (finding.impact !== "High" && finding.impact !== "Medium") continue;

  const headline = String(finding.description || "").split("\n", 1)[0];
  const reviewed = [...reviewedHighOrMedium].some((entry) => {
    const [check, prefix] = entry.split("|");
    return finding.check === check && headline.startsWith(prefix);
  });
  if (!reviewed) unexpected.push({
    check: finding.check,
    impact: finding.impact,
    headline,
  });
}

console.log("Slither detector counts:", counts);
if (unexpected.length > 0) {
  console.error("Unexpected High/Medium Slither findings:");
  for (const finding of unexpected) {
    console.error(`- ${finding.impact} ${finding.check}: ${finding.headline}`);
  }
  process.exit(1);
}

console.log("No new High or Medium Slither findings outside the reviewed baseline.");
