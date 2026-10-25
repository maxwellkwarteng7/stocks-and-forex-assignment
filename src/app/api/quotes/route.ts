import { connection } from "next/server";
import { getQuotes } from "@/lib/server/quotes";

export async function GET() {
  await connection();
  return Response.json(await getQuotes());
}
