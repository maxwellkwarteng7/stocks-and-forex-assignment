import { connection } from "next/server";
import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import { getInstrument } from "@/lib/market/instruments";
import { isRangeKey } from "@/lib/market/ranges";
import { alphaVantageBudget } from "@/lib/server/alphaVantageQueue";
import { getQuotes } from "@/lib/server/quotes";
import { getBoard } from "@/lib/server/series";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}

// fetch on the server for the first paint, then the browser polls the same functions through /api
async function Board({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  // never pre-build this, the data changes per request
  await connection();
  const params = await searchParams;
  const s = typeof params.s === "string" ? params.s : "";
  const r = typeof params.r === "string" ? params.r : "";

  const [series, quotes] = await Promise.all([getBoard(), getQuotes()]);

  return (
    <Dashboard
      initialBoard={{ series, budget: alphaVantageBudget() }}
      initialQuotes={quotes}
      initialSelected={getInstrument(s)?.id ?? "AAPL"}
      initialRange={isRangeKey(r) ? r : "3M"}
    />
  );
}

function BoardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true">
      <div className="h-14 border-b border-line" />
      <div className="flex flex-1">
        <div className="hidden w-[320px] space-y-2 border-r border-line p-4 lg:block">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
        <div className="flex-1 space-y-4 p-6">
          <div className="h-12 w-1/3 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-[420px] animate-pulse rounded-lg bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
