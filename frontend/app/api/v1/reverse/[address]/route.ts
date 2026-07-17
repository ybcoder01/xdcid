import { NextResponse } from "next/server";
import { ApiInputError, getReverseData } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ address: string }>;
};

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { address } = await context.params;
    const data = await getReverseData(address);

    return NextResponse.json({ version: "v1", data }, { headers });
  } catch (error) {
    if (error instanceof ApiInputError) {
      return NextResponse.json(
        { version: "v1", error: { message: error.message } },
        { status: 400, headers }
      );
    }

    console.error("XNS reverse lookup failed", error);
    return NextResponse.json(
      { version: "v1", error: { message: "Unable to read the XDC Network" } },
      { status: 503, headers }
    );
  }
}
