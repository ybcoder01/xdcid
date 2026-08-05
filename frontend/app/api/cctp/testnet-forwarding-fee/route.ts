import {
  buildCctpForwardingFeeUrl,
  parseCctpForwardingQuote,
  type CctpTestnetKey
} from "../../../../../../sdk/src/cctp";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") as CctpTestnetKey;
  const destination = url.searchParams.get("destination") as CctpTestnetKey;

  let circleUrl: string;
  try {
    circleUrl = buildCctpForwardingFeeUrl(source, destination);
  } catch {
    return Response.json({ error: "Unsupported forwarding route" }, { status: 400 });
  }

  try {
    const response = await fetch(circleUrl, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return Response.json({ error: "Circle forwarding quote is unavailable" }, { status: 502 });
    }
    const quote = parseCctpForwardingQuote(await response.json());
    return Response.json(
      {
        forwardFee: quote.forwardFee.toString(),
        minimumFeeBps: quote.minimumFeeBps
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Could not obtain a safe forwarding quote" }, { status: 502 });
  }
}
