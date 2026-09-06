import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { activeRegistrarAddress, activeXnsChainId } from "../config/contracts";
import {
  domainDiscountAuthorizationAbi,
  registrarDiscountContextAbi,
} from "./domainDiscounts";
import { xdcClient } from "./xdcClient";

export type DomainDiscountContext = {
  chainId: number;
  registrar: Address;
  authorizationContract: Address;
  authorizationSigner: Address;
};

export async function currentDomainDiscountContext(): Promise<DomainDiscountContext> {
  const authorizationContract = await xdcClient.readContract({
    address: activeRegistrarAddress,
    abi: registrarDiscountContextAbi,
    functionName: "discountAuthorization",
  });
  if (!isAddress(authorizationContract) || authorizationContract === zeroAddress) {
    throw new Error("Domain discount authorization is not configured");
  }

  const [authorizationSigner, consumer] = await Promise.all([
    xdcClient.readContract({
      address: authorizationContract,
      abi: domainDiscountAuthorizationAbi,
      functionName: "authorizationSigner",
    }),
    xdcClient.readContract({
      address: authorizationContract,
      abi: domainDiscountAuthorizationAbi,
      functionName: "consumer",
    }),
  ]);
  if (
    !isAddress(authorizationSigner) ||
    authorizationSigner === zeroAddress ||
    getAddress(consumer) !== getAddress(activeRegistrarAddress)
  ) {
    throw new Error("Domain discount authorization roles are not active");
  }

  return {
    chainId: activeXnsChainId,
    registrar: getAddress(activeRegistrarAddress),
    authorizationContract: getAddress(authorizationContract),
    authorizationSigner: getAddress(authorizationSigner),
  };
}
