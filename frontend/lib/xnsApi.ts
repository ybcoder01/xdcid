import {
  formatEther,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress
} from "viem";
import {
  activeRegistryAddress,
  addresses,
  isTestnetEnvironment,
  registrarAbi,
  registryAbi,
  resolverAbi,
  reverseResolverAbi,
  xdcMainnet
} from "../config/contracts";
import {
  legacyXdcDomainsAbi,
  legacyXdcDomainsAddress
} from "../config/legacyDomains";
import { ApiInputError } from "./apiResponse";
import { parseXnsName } from "./names";
import { classifyRegistryStatus } from "./registryStatus";
import { withShortCache } from "./shortCache";
import { xdcClient } from "./xdcClient";

export const profileKeys = ["avatar", "website", "twitter", "telegram", "bio"] as const;

type ProfileKey = (typeof profileKeys)[number];
type Profile = Record<ProfileKey, string | null>;

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

  return withShortCache("name:" + parsed.name + ":" + years, async () => {
    const node = keccak256(stringToHex(parsed.name));

    if (isTestnetEnvironment) {
      const [owner, expiry] = await Promise.all([
        xdcClient.readContract({
          address: activeRegistryAddress,
          abi: registryAbi,
          functionName: "ownerOf",
          args: [node]
        }),
        xdcClient.readContract({
          address: activeRegistryAddress,
          abi: registryAbi,
          functionName: "expiryOf",
          args: [node]
        })
      ]);
      const registered = owner !== zeroAddress;
      const normalizedOwner = registered ? getAddress(owner) : null;
      const profile = Object.fromEntries(
        profileKeys.map((key) => [key, null])
      ) as Profile;

      return {
        name: parsed.name,
        label: parsed.label,
        node,
        network: { chainId: 51, name: "XDC Apothem" },
        available: !registered,
        registered,
        owner: normalizedOwner,
        resolvedAddress: normalizedOwner,
        registry: {
          state: registered ? "xdcid" : "available",
          registrationAllowed: !registered,
          xdcid: {
            contract: activeRegistryAddress,
            registered,
            owner: normalizedOwner
          },
          legacy: {
            contract: legacyXdcDomainsAddress,
            tokenId: null,
            registered: false,
            owner: null
          }
        },
        expiry: {
          timestamp: expiry > 0n ? expiry.toString() : null,
          iso: expiry > 0n ? new Date(Number(expiry) * 1000).toISOString() : null
        },
        pricing: null,
        profile
      };
    }
    const legacyTokenId = await xdcClient.readContract({
      address: legacyXdcDomainsAddress,
      abi: legacyXdcDomainsAbi,
      functionName: "_tokenIdMaps",
      args: [parsed.name]
    });
    const [
      owner,
      expiry,
      available,
      pricePerYear,
      resolvedAddress,
      profileValues,
      legacyRegistered
    ] = await Promise.all([
      xdcClient.readContract({
        address: addresses.registry,
        abi: registryAbi,
        functionName: "ownerOf",
        args: [node]
      }),
      xdcClient.readContract({
        address: addresses.registry,
        abi: registryAbi,
        functionName: "expiryOf",
        args: [node]
      }),
      xdcClient.readContract({
        address: addresses.registrar,
        abi: registrarAbi,
        functionName: "available",
        args: [parsed.name]
      }),
      xdcClient.readContract({
        address: addresses.registrar,
        abi: registrarAbi,
        functionName: "price",
        args: [parsed.name]
      }),
      xdcClient.readContract({
        address: addresses.resolver,
        abi: resolverAbi,
        functionName: "addresses",
        args: [node]
      }),
      Promise.all(
        profileKeys.map((key) =>
          xdcClient.readContract({
            address: addresses.resolver,
            abi: resolverAbi,
            functionName: "text",
            args: [node, key]
          })
        )
      ),
      xdcClient.readContract({
        address: legacyXdcDomainsAddress,
        abi: legacyXdcDomainsAbi,
        functionName: "exists",
        args: [legacyTokenId]
      })
    ]);

    const registered = owner !== zeroAddress;
    const legacyOwner = legacyRegistered
      ? await xdcClient.readContract({
          address: legacyXdcDomainsAddress,
          abi: legacyXdcDomainsAbi,
          functionName: "ownerOf",
          args: [legacyTokenId]
        })
      : null;
    const registryClassification = classifyRegistryStatus({
      xdcidRegistered: registered,
      legacyRegistered
    });
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
      registry: {
        ...registryClassification,
        xdcid: {
          contract: addresses.registry,
          registered,
          owner: registered ? getAddress(owner) : null
        },
        legacy: {
          contract: legacyXdcDomainsAddress,
          tokenId: legacyTokenId.toString(),
          registered: legacyRegistered,
          owner: legacyOwner ? getAddress(legacyOwner) : null
        }
      },
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
  });
}

export async function getReverseData(input: string) {
  if (!isAddress(input)) {
    throw new ApiInputError(
      "INVALID_ADDRESS",
      "address must be a valid EVM address"
    );
  }

  const address = getAddress(input);
  if (isTestnetEnvironment) {
    return { address, name: null, verified: false };
  }
  return withShortCache("reverse:" + address.toLowerCase(), async () => {
    const storedName = await xdcClient.readContract({
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
    const owner = await xdcClient.readContract({
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
  });
}
