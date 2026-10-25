"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/client/hooks";
import { getInstrument, INSTRUMENTS } from "@/lib/market/instruments";
import type { RangeKey } from "@/lib/market/ranges";
import { usEquitySession } from "@/lib/market/sessions";
import type { BoardPayload, QuotesPayload } from "@/lib/market/types";
import { CrossMarket } from "./CrossMarket";
import { MainPanel } from "./MainPanel";
import { TopBar } from "./TopBar";
import { Watchlist, type LastPrice } from "./Watchlist";

interface Props {
  initialBoard: BoardPayload;
  initialQuotes: QuotesPayload;
  initialSelected: string;
  initialRange: RangeKey;
}

const boardInterval = (b: BoardPayload) =>
  b.series.some((s) => s.notice === "throttled") ? 60_000 : 10 * 60_000;
const quoteInterval = () => (usEquitySession(new Date()).state === "closed" ? 5 * 60_000 : 15_000);

export function Dashboard({ initialBoard, initialQuotes, initialSelected, initialRange }: Props) {
  const [selected, setSelected] = useState(initialSelected);
  const [range, setRange] = useState<RangeKey>(initialRange);

  // history every 10 min, or every minute while some series are still on the snapshot
  const board = usePoll<BoardPayload>("/api/board", boardInterval, initialBoard);
  const quotes = usePoll<QuotesPayload>("/api/quotes", quoteInterval, initialQuotes);

  const boardMap = useMemo(() => new Map(board.series.map((s) => [s.id, s])), [board]);

  const prices = useMemo(() => {
    const map = new Map<string, LastPrice>();
    for (const inst of INSTRUMENTS) {
      const q = quotes.quotes[inst.id];
      if (q) {
        map.set(inst.id, { price: q.price, changePct: q.changePct, live: true });
        continue;
      }
      const bars = boardMap.get(inst.id)?.bars;
      if (bars && bars.length > 1) {
        const [prev, last] = bars.slice(-2);
        map.set(inst.id, { price: last.c, changePct: (last.c / prev.c - 1) * 100, live: false });
      }
    }
    return map;
  }, [quotes, boardMap]);

  // keep the url shareable: ?s=NVDA&r=1Y
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("s", selected);
    url.searchParams.set("r", range);
    window.history.replaceState(null, "", url);
  }, [selected, range]);

  const select = useCallback((id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const inst = getInstrument(selected) ?? INSTRUMENTS[0];

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar board={board} quotes={quotes} />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-[320px] lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-2 lg:py-4">
          <Watchlist board={boardMap} prices={prices} selected={inst.id} onSelect={select} />
        </aside>
        <main className="min-w-0 flex-1">
          <MainPanel
            inst={inst}
            daily={boardMap.get(inst.id)}
            quote={quotes.quotes[inst.id]}
            range={range}
            onRange={setRange}
          />
          <CrossMarket board={boardMap} range={range} />
          <footer className="px-4 py-6 text-[11px] leading-relaxed text-muted md:px-6">
            Stock quotes: Finnhub (real time, US). History and FX: Alpha Vantage (end of day; weekly stock history is
            split-adjusted). When a provider is unavailable the dashboard shows recorded data and says so. Not
            investment advice.
          </footer>
        </main>
      </div>
    </div>
  );
}
