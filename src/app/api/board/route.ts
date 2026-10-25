import { connection } from "next/server";
import { alphaVantageBudget } from "@/lib/server/alphaVantageQueue";
import { getBoard } from "@/lib/server/series";

export async function GET() {
  // request time only, building it would burn API quota on every deploy
  await connection();
  const series = await getBoard();
  return Response.json({ series, budget: alphaVantageBudget() });
}
