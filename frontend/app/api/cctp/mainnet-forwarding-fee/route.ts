import {
  buildMainnetForwardingFeeUrl,
  parseMainnetForwardingQuote
} from "../../../../lib/cctpMainnet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const sourceChainId = Number(requestUrl.searchParams.get("sourceChainId"));
  const destinationChainId = Number(
    requestUrl.searchParams.get("destinationChainId")
  );

  let circleUrl: string;
  try {
    circleUrl = buildMainnetForwardingFeeUrl(
      sourceChainId,
      destinationChainId
    );
  } catch {
    return Response.json(
      { error: "Automatic forwarding is not available for this route" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(circleUrl, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return Response.json(
        { error: "Circle forwarding quotes are temporarily unavailable" },
        { status: 502 }
      );
    }

    const quote = parseMainnetForwardingQuote(
      (await response.json()) as unknown
    );
    return Response.json(
      {
        forwardFee: quote.forwardFee.toString(),
        minimumFeeBps: quote.minimumFeeBps
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "Could not retrieve a valid Circle forwarding quote" },
      { status: 502 }
    );
  }
}
