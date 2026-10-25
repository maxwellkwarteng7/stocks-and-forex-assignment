import { getInstrument } from "@/lib/market/instruments";
import { getSeries } from "@/lib/server/series";

/** one series, e.g. /api/series/AAPL?interval=weekly */
export async function GET(request: Request, ctx: RouteContext<"/api/series/[id]">) {
  const { id } = await ctx.params;
  const inst = getInstrument(id);
  if (!inst) return Response.json({ error: `Unknown instrument ${id}` }, { status: 404 });

  const interval = new URL(request.url).searchParams.get("interval") === "weekly" ? "weekly" : "daily";
  return Response.json(await getSeries(inst.id, interval));
}
