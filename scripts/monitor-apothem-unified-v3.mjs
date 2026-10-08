import { readFile } from "node:fs/promises";
import { createPublicClient, getAddress, http, parseAbi } from "viem";

const manifest = JSON.parse(await readFile(new URL("../deployments/apothem-unified-v3.json", import.meta.url), "utf8"));
const baseUrl = (process.env.XDCID_DEV_URL || "https://dev.xdcid.xyz").replace(/\/$/, "");
const expectReady = process.env.EXPECT_UNIFIED_READY === "true";
const client = createPublicClient({ transport: http(process.env.APOTHEM_RPC_URL || "https://rpc.apothem.network") });
const registrarAbi = parseAbi(["function pricingPolicy() view returns (address)", "function registry() view returns (address)"]);
const policyAbi = parseAbi(["function config() view returns ((uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint16,uint16,uint16,uint16,address quoteSigner,address usdcToken,address treasury,bool xdcPaymentsEnabled,bool usdcPaymentsEnabled))"]);

const failures = [];
const codes = await Promise.all([manifest.registry, manifest.resolver, manifest.registrar, manifest.pricingPolicy].map((address) => client.getCode({ address })));
codes.forEach((code, index) => { if (!code || code === "0x") failures.push(`Missing bytecode at deployment address ${index + 1}`); });
const [chainId, policy, registry, config, response] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: manifest.registrar, abi: registrarAbi, functionName: "pricingPolicy" }),
  client.readContract({ address: manifest.registrar, abi: registrarAbi, functionName: "registry" }),
  client.readContract({ address: manifest.pricingPolicy, abi: policyAbi, functionName: "config" }),
  fetch(`${baseUrl}/api/v1/registrar/quote`, { headers: { accept: "application/json" } }),
]);
if (chainId !== manifest.chainId) failures.push(`RPC chain is ${chainId}, expected ${manifest.chainId}`);
if (getAddress(policy) !== getAddress(manifest.pricingPolicy)) failures.push("Registrar pricing policy binding drifted");
if (getAddress(registry) !== getAddress(manifest.registry)) failures.push("Registrar registry binding drifted");
if (expectReady && getAddress(config.quoteSigner) !== getAddress(manifest.quoteSigner)) failures.push("Active quote signer drifted");
if (expectReady && getAddress(config.treasury) !== getAddress(manifest.treasury)) failures.push("Active treasury drifted");
if (expectReady && getAddress(config.usdcToken) !== getAddress(manifest.usdc)) failures.push("Active USDC token drifted");
const payload = await response.json();
if (!response.ok) failures.push(`Readiness endpoint returned HTTP ${response.status}`);
if (payload?.data?.chainId !== manifest.chainId) failures.push("Readiness endpoint chain ID drifted");
if (getAddress(payload?.data?.pricingPolicy) !== getAddress(manifest.pricingPolicy)) failures.push("Readiness endpoint pricing policy drifted");
if (getAddress(payload?.data?.configuredSigner) !== getAddress(manifest.quoteSigner)) failures.push("Readiness endpoint configured signer drifted");
if (expectReady && payload?.data?.ready !== true) failures.push("Unified quote service is not ready after activation");
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), chainId, quoteReady: payload?.data?.ready, expectReady, failures }, null, 2));
if (failures.length) process.exit(1);
