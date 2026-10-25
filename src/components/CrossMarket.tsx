"use client";

import { useMemo, useState } from "react";
import { useMultiSeries } from "@/lib/client/hooks";
import { correlationMatrix, rebase } from "@/lib/market/analytics";
import { FX_PAIRS, getInstrument, INSTRUMENTS } from "@/lib/market/instruments";
import { intervalFor, rangeStart, sliceRange, type RangeKey } from "@/lib/market/ranges";
import type { SeriesPayload } from "@/lib/market/types";
import { CompareChart, type CompareLine } from "./charts/CompareChart";
import { CorrelationHeatmap } from "./charts/CorrelationHeatmap";
import { FxStrength, type StrengthRow } from "./charts/FxStrength";
import { SectionHeader, Segmented } from "./ui";

const SLOTS = 5;
const CURRENCY_NAMES: Record<string, string> = { EUR: "Euro", GBP: "British pound", JPY: "Japanese yen", GHS: "Ghanaian cedi" };

interface Props {
  board: Map<string, SeriesPayload>;
  range: RangeKey;
}

export function CrossMarket({ board, range }: Props) {
  return (
    <>
      <Compare board={board} range={range} />
      <div className="grid grid-cols-[minmax(0,1fr)] border-b border-line lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Strength board={board} />
        <Correlation board={board} />
      </div>
    </>
  );
}

function Compare({ board, range }: Props) {
  // each pick keeps its colour so removing one doesn't repaint the others
  const [picks, setPicks] = useState<{ id: string; slot: number }[]>([
    { id: "AAPL", slot: 1 },
    { id: "NVDA", slot: 2 },
    { id: "EURUSD", slot: 3 },
    { id: "USDGHS", slot: 4 },
  ]);
  const interval = intervalFor(range);
  const ids = picks.map((p) => p.id);
  const series = useMultiSeries(ids, interval, board);

  const lines: CompareLine[] = useMemo(() => {
    const byId = new Map(series.map((s) => [s.id, s]));
    const lastTs = series.map((s) => s.bars[s.bars.length - 1]?.t ?? 0);
    const from = lastTs.length ? rangeStart(range, Math.min(...lastTs)) : 0;
    const starts = series.map((s) => s.bars.find((b) => b.t >= from)?.t ?? Infinity);
    const commonStart = starts.length ? Math.max(...starts) : from;
    return picks.flatMap((p) => {
      const s = byId.get(p.id);
      if (!s) return [];
      return [{ id: p.id, label: getInstrument(p.id)!.label, color: `var(--series-${p.slot})`, points: rebase(s.bars, commonStart) }];
    });
  }, [series, picks, range]);

  const toggle = (id: string) =>
    setPicks((list) => {
      if (list.some((p) => p.id === id)) return list.filter((p) => p.id !== id);
      if (list.length >= SLOTS) return list;
      const used = new Set(list.map((p) => p.slot));
      const slot = [1, 2, 3, 4, 5].find((s) => !used.has(s))!;
      return [...list, { id, slot }];
    });

  return (
    <section className="min-w-0 border-b border-line px-4 py-6 md:px-6" aria-labelledby="compare-title">
      <SectionHeader title="Relative performance">
        <span className="text-[11px] text-muted">
          Rebased to 0% at the start of the {range} window · up to {SLOTS}
        </span>
      </SectionHeader>
      <h3 id="compare-title" className="sr-only">Relative performance</h3>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {INSTRUMENTS.map((inst) => {
          const pick = picks.find((p) => p.id === inst.id);
          const full = !pick && picks.length >= SLOTS;
          return (
            <button
              key={inst.id}
              onClick={() => toggle(inst.id)}
              disabled={full}
              aria-pressed={!!pick}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                pick ? "border-ink/30 bg-surface text-ink" : "border-line text-muted hover:text-ink-2"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: pick ? `var(--series-${pick.slot})` : "var(--axis)" }}
                aria-hidden
              />
              {inst.label}
            </button>
          );
        })}
      </div>
      {lines.length > 0 ? (
        <CompareChart lines={lines} />
      ) : (
        <div className="grid h-[280px] place-items-center text-sm text-muted">Pick instruments to compare.</div>
      )}
    </section>
  );
}

const WINDOWS = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
] as const;

function Strength({ board }: { board: Map<string, SeriesPayload> }) {
  const [span, setSpan] = useState<"1M" | "3M">("1M");
  const rows: StrengthRow[] = useMemo(
    () =>
      FX_PAIRS.flatMap((pair) => {
        const s = board.get(pair.id);
        const bars = s ? sliceRange(s.bars, span) : [];
        if (bars.length < 2) return [];
        const r = bars[bars.length - 1].c / bars[0].c;
        // USD/XXX going up means XXX got weaker, so flip it
        const usdBase = pair.base === "USD";
        const currency = usdBase ? pair.quote! : pair.base!;
        const pct = ((usdBase ? 1 / r : r) - 1) * 100;
        return [{ currency, name: CURRENCY_NAMES[currency] ?? currency, pct }];
      }),
    [board, span],
  );

  return (
    <section className="min-w-0 border-b border-line px-4 py-6 md:px-6 lg:border-b-0 lg:border-r" aria-label="Currency strength">
      <SectionHeader title="Currency vs US dollar">
        <Segmented label="Window" value={span} onChange={setSpan} options={WINDOWS} />
      </SectionHeader>
      <FxStrength rows={rows} />
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        How much each currency gained or lost against the dollar over the last {span === "1M" ? "month" : "three months"}.
        USD-base pairs are inverted so every bar reads the same way.
      </p>
    </section>
  );
}

function Correlation({ board }: { board: Map<string, SeriesPayload> }) {
  const [span, setSpan] = useState<"1M" | "3M">("3M");
  const { labels, matrix } = useMemo(() => {
    const present = INSTRUMENTS.filter((i) => board.has(i.id));
    return {
      labels: present.map((i) => i.label),
      matrix: correlationMatrix(present.map((i) => sliceRange(board.get(i.id)!.bars, span))),
    };
  }, [board, span]);

  return (
    <section className="min-w-0 px-4 py-6 md:px-6" aria-label="Correlation of daily returns">
      <SectionHeader title="Correlation of daily returns">
        <Segmented label="Window" value={span} onChange={setSpan} options={WINDOWS} />
      </SectionHeader>
      <CorrelationHeatmap labels={labels} matrix={matrix} />
    </section>
  );
}
