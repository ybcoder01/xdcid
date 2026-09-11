import { getAddress, isHex, type Hex } from "viem";
import {
  requireAdminPermission,
} from "../../../../lib/adminAuth";
import { isSameOrigin } from "../../../../lib/adminSecurity";
import { currentDomainDiscountContext } from "../../../../lib/domainDiscountContext";
import {
  buildDomainDiscountAuthorization,
  deserializeDomainDiscountAuthorization,
  domainDiscountAuthorizationAbi,
  serializeDomainDiscountAuthorization,
} from "../../../../lib/domainDiscounts";
import {
  countDomainDiscountGrantsByCampaign,
  listDomainDiscountGrants,
  saveDomainDiscountGrant,
} from "../../../../lib/domainDiscountGrantStore";
import {
  BETA_REGISTRATION_CAMPAIGN,
  BETA_REGISTRATION_LIMIT,
  betaGrantValidationError,
} from "../../../../lib/betaRegistration";
import { xdcClient } from "../../../../lib/xdcClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BODY_BYTES = 16_384;

export async function GET(request: Request) {
  const session = await requireAdminPermission(request, "discount:issue");
  if (!session) return unauthorized();

  try {
    const context = await currentDomainDiscountContext();
    const grants = await listDomainDiscountGrants({
      chainId: context.chainId,
      authorizationContract: context.authorizationContract,
    });
    const betaIssued = await countDomainDiscountGrantsByCampaign({
      chainId: context.chainId,
      authorizationContract: context.authorizationContract,
      campaign: BETA_REGISTRATION_CAMPAIGN,
    });
    return Response.json(
      {
        context,
        beta: {
          campaign: BETA_REGISTRATION_CAMPAIGN,
          issued: betaIssued,
          limit: BETA_REGISTRATION_LIMIT,
          remaining: Math.max(BETA_REGISTRATION_LIMIT - betaIssued, 0),
        },
        grants: grants.map((grant) => ({
          ...grant,
          authorization: serializeDomainDiscountAuthorization(grant.authorization),
        })),
      },
      { headers: noStoreHeaders() },
    );
  } catch {
    return Response.json(
      { error: "Domain discount grants are temporarily unavailable" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: "Invalid request origin" },
      { status: 403, headers: noStoreHeaders() },
    );
  }
  const session = await requireAdminPermission(request, "discount:issue");
  if (!session) return unauthorized();

  try {
    const body = (await readBody(request)) as {
      name?: unknown;
      authorization?: unknown;
      signature?: unknown;
      campaign?: unknown;
    };
    if (typeof body.name !== "string" || typeof body.signature !== "string" || !isHex(body.signature)) {
      return invalid("A valid name, authorization, and signature are required");
    }
    let supplied;
    let normalized;
    try {
      supplied = deserializeDomainDiscountAuthorization(body.authorization);
      normalized = buildDomainDiscountAuthorization({
        name: body.name,
        beneficiary: supplied.beneficiary,
        product: supplied.product,
        termYears: Number(supplied.termYears),
        discountBps: supplied.discountBps,
        maxUses: supplied.maxUses,
        validAfter: Number(supplied.validAfter),
        deadline: Number(supplied.deadline),
        nonce: supplied.nonce,
      });
    } catch (error) {
      return invalid(
        error instanceof Error ? error.message : "Invalid discount grant",
      );
    }
    if (normalized.authorization.node !== supplied.node) {
      return invalid("The signed grant does not match the supplied name");
    }
    const campaign = body.campaign === BETA_REGISTRATION_CAMPAIGN
      ? BETA_REGISTRATION_CAMPAIGN
      : undefined;
    if (body.campaign !== undefined && !campaign) {
      return invalid("The discount campaign is invalid");
    }
    if (campaign) {
      const betaError = betaGrantValidationError({
        name: normalized.name,
        authorization: normalized.authorization,
      });
      if (betaError) return invalid(betaError);
    }
    const now = Math.floor(Date.now() / 1_000);
    if (
      supplied.product !== 0 ||
      supplied.validAfter > BigInt(now + 5 * 60) ||
      supplied.deadline <= BigInt(now) ||
      supplied.deadline > BigInt(now + 31 * 24 * 60 * 60)
    ) {
      return invalid("Registration grants must be active and expire within 31 days");
    }

    const context = await currentDomainDiscountContext();
    if (getAddress(session.address) !== context.authorizationSigner) {
      return unauthorized();
    }
    if (campaign) {
      const betaIssued = await countDomainDiscountGrantsByCampaign({
        chainId: context.chainId,
        authorizationContract: context.authorizationContract,
        campaign,
      });
      if (betaIssued >= BETA_REGISTRATION_LIMIT) {
        return Response.json(
          { error: "The 50-wallet beta allocation is full" },
          { status: 409, headers: noStoreHeaders() },
        );
      }
    }
    const usable = await xdcClient.readContract({
      address: context.authorizationContract,
      abi: domainDiscountAuthorizationAbi,
      functionName: "isUsable",
      args: [normalized.authorization, body.signature as Hex],
    });
    if (!usable) return invalid("The discount contract rejected this grant");
    const authorizationHash = await xdcClient.readContract({
      address: context.authorizationContract,
      abi: domainDiscountAuthorizationAbi,
      functionName: "hashAuthorization",
      args: [normalized.authorization],
    });
    const saved = await saveDomainDiscountGrant({
      authorizationHash,
      chainId: context.chainId,
      registrar: context.registrar,
      authorizationContract: context.authorizationContract,
      name: normalized.name,
      authorization: normalized.authorization,
      signature: body.signature as Hex,
      campaign,
      createdBy: session.address,
    });
    return Response.json(
      {
        grant: {
          ...saved,
          authorization: serializeDomainDiscountAuthorization(saved.authorization),
        },
      },
      { status: 201, headers: noStoreHeaders() },
    );
  } catch {
    return Response.json(
      { error: "Domain discount grant could not be saved" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_BODY_BYTES) {
    throw new Error("Request body is too large");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new Error("Request body is too large");
  }
  return JSON.parse(raw) as unknown;
}

function unauthorized() {
  return Response.json(
    { error: "Discount-signer authentication required" },
    { status: 403, headers: noStoreHeaders() },
  );
}

function invalid(error: string) {
  return Response.json({ error }, { status: 400, headers: noStoreHeaders() });
}

function noStoreHeaders() {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}
