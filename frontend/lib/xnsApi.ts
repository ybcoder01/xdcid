import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress
} from "viem";
import {
  addresses,
  registrarAbi,
  registryAbi,
  resolverAbi,
  reverseResolverAbi,
  xdcMainnet
} from "../config/contracts";
import { ApiInputError } from "./apiResponse";
import { parseXnsName } from "./names";

export const profileKeys = ["avatar", "website", "twitter", "telegram", "bio"] as const;

type ProfileKey = (typeof profileKeys)[number];
type Profile = Record<ProfileKey, string | null>;

const rpcUrl =
  process.env.XDC_RPC_URL ||
  process.env.NEXT_PUBLIC_XDC_RPC_URL ||
  xdcMainnet.rpcUrls.default.http[0];

const client = createPublicClient({
  chain: xdcMainnet,
  transport: http(rpcUrl)
});

export function parseYears(value: string | null): number {
  if (value === null) return 1;

  const years = Number(value);
  if (!Number.isSafeInteger(years) || years < 1 || years > 100) {
    throw new ApiInputError(
      "INVALID_YEARS",
      "years must be an integer between 1 and 100"
    );
  }

  return years;
}

export async function getNameData(input: string, years: number) {
  const parsed = parseXnsName(input);
  if (!parsed.isValid) {
    throw new ApiInputError(
      "INVALID_NAME",
      parsed.error || "Invalid XDCID name"
    );
  }

  const node = keccak256(stringToHex(parsed.name));
  const [owner, expiry, available, pricePerYear, resolvedAddress, profileValues] = await Promise.all([
    client.readContract({
      address: addresses.registry,
      abi: registryAbi,
      functionName: "ownerOf",
      args: [node]
    }),
    client.readContract({
      address: addresses.registry,
      abi: registryAbi,
      functionName: "expiryOf",
      args: [node]
    }),
    client.readContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "available",
      args: [parsed.name]
    }),
    client.readContract({
      address: addresses.registrar,
      abi: registrarAbi,
      functionName: "price",
      args: [parsed.name]
    }),
    client.readContract({
      address: addresses.resolver,
      abi: resolverAbi,
      functionName: "addresses",
      args: [node]
    }),
    Promise.all(
      profileKeys.map((key) =>
        client.readContract({
          address: addresses.resolver,
          abi: resolverAbi,
          functionName: "text",
          args: [node, key]
        })
      )
    )
  ]);

  const registered = owner !== zeroAddress;
  const totalPrice = pricePerYear * BigInt(years);
  const profile = Object.fromEntries(
    profileKeys.map((key, index) => [
      key,
      registered && profileValues[index] ? profileValues[index] : null
    ])
  ) as Profile;

  return {
    name: parsed.name,
    label: parsed.label,
    node,
    network: { chainId: xdcMainnet.id, name: xdcMainnet.name },
    available,
    registered,
    owner: registered ? getAddress(owner) : null,
    resolvedAddress:
      registered && resolvedAddress !== zeroAddress ? getAddress(resolvedAddress) : null,
    expiry: {
      timestamp: expiry > 0n ? expiry.toString() : null,
      iso: expiry > 0n ? new Date(Number(expiry) * 1000).toISOString() : null
    },
    pricing: {
      currency: "XDC",
      years,
      perYear: {
        wei: pricePerYear.toString(),
        xdc: formatEther(pricePerYear)
      },
      total: {
        wei: totalPrice.toString(),
        xdc: formatEther(totalPrice)
      }
    },
    profile
  };
}

export async function getReverseData(input: string) {
  if (!isAddress(input)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "address must be a valid EVM address"
    );
  }

  const address = getAddress(input);
  const storedName = await client.readContract({
    address: addresses.reverseResolver,
    abi: reverseResolverAbi,
    functionName: "primaryNames",
    args: [address]
  });

  if (!storedName) {
    return { address, name: null, verified: false };
  }

  const parsed = parseXnsName(storedName);
  if (!parsed.isValid) {
    return { address, name: null, verified: false };
  }

  const node = keccak256(stringToHex(parsed.name));
  const owner = await client.readContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "ownerOf",
    args: [node]
  });
  const verified = owner.toLowerCase() === address.toLowerCase();

  return {
    address,
    name: verified ? parsed.name : null,
    verified
  };
}
