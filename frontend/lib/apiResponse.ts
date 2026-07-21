import { NextResponse } from "next/server";

export const API_VERSION = "v1";

const headers = { "Cache-Control": "no-store" };

export type ApiErrorCode =
  | "INVALID_NAME"
  | "INVALID_ADDRESS"
  | "INVALID_YEARS"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "GATEWAY_UNAVAILABLE"
  | "XDC_INDEX_UNAVAILABLE"
  | "XDC_RPC_UNAVAILABLE";

type InputErrorCode =
  | "INVALID_NAME"
  | "INVALID_ADDRESS"
  | "INVALID_YEARS";

export class ApiInputError extends Error {
  constructor(
    public readonly code: InputErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

export class ApiServiceError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status = 503
  ) {
    super(message);
    this.name = "ApiServiceError";
  }
}

export function apiSuccess<T>(data: T) {
  return NextResponse.json({ version: API_VERSION, data }, { headers });
}

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json(
    { version: API_VERSION, error: { code, message } },
    { status, headers }
  );
}

export function handleApiError(error: unknown, logMessage: string) {
  if (error instanceof ApiInputError) {
    return apiError(error.code, error.message, 400);
  }

  if (error instanceof ApiServiceError) {
    return apiError(error.code, error.message, error.status);
  }

  console.error(logMessage, error);
  return apiError(
    "XDC_RPC_UNAVAILABLE",
    "Unable to read the XDC Network",
    503
  );
}
