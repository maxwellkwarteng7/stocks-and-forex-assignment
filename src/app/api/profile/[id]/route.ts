import { getInstrument } from "@/lib/market/instruments";
import { getProfile } from "@/lib/server/quotes";

export async function GET(_request: Request, ctx: RouteContext<"/api/profile/[id]">) {
  const { id } = await ctx.params;
  const inst = getInstrument(id);
  if (!inst || inst.kind !== "stock") return Response.json(null, { status: 404 });
  return Response.json(await getProfile(inst.id));
}
