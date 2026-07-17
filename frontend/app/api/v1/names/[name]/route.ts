import { NextResponse } from "next/server";
import { ApiInputError, getNameData, parseYears } from "../../../../../lib/xnsApi";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ name: string }>;
};

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { name } = await context.params;
    const years = parseYears(new URL(request.url).searchParams.get("years"));
    const data = await getNameData(name, years);

    return NextResponse.json({ version: "v1", data }, { headers });
  } catch (error) {
    if (error instanceof ApiInputError) {
      return NextResponse.json(
        { version: "v1", error: { message: error.message } },
        { status: 400, headers }
      );
    }

    console.error("XNS name lookup failed", error);
    return NextResponse.json(
      { version: "v1", error: { message: "Unable to read the XDC Network" } },
      { status: 503, headers }
    );
  }
}
