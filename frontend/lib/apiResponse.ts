import { NextResponse } from "next/server";

export const API_VERSION = "v1";

export type ApiErrorCode =
  | "INVALID_NAME"
  | "INVALID_ADDRESS"
  | "INVALID_YEARS"
  | "RATE_LIMITED"
  | "XDC_RPC_UNAVAILABLE";

type InputErrorCode = Exclude<
  ApiErrorCode,
  "RATE_LIMITED" | "XDC_RPC_UNAVAILABLE"
>;

export class ApiInputError extends Error {
  constructor(
    public readonly code: InputErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

function responseHeaders(additionalHeaders?: HeadersInit): Headers {
  const headers = new Headers(additionalHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function apiSuccess<T>(data: T, additionalHeaders?: HeadersInit) {
  return NextResponse.json(
    { version: API_VERSION, data },
    { headers: responseHeaders(additionalHeaders) }
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  additionalHeaders?: HeadersInit
) {
  return NextResponse.json(
    { version: API_VERSION, error: { code, message } },
    { status, headers: responseHeaders(additionalHeaders) }
  );
}

export function handleApiError(
  error: unknown,
  logMessage: string,
  additionalHeaders?: HeadersInit
) {
  if (error instanceof ApiInputError) {
    return apiError(error.code, error.message, 400, additionalHeaders);
  }

  console.error(logMessage, error);
  return apiError(
    "XDC_RPC_UNAVAILABLE",
    "Unable to read the XDC Network",
    503,
    additionalHeaders
  );
}
