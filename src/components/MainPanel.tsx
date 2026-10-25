"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { direction, formatCompact, formatDay, formatPct, formatPrice, formatSigned, toneClass } from "@/lib/client/format";
import { useSeries } from "@/lib/client/hooks";
import { bollinger, rangeStats, sma } from "@/lib/market/analytics";
import type { Instrument } from "@/lib/market/instruments";
import { intervalFor, periodsPerYear, RANGES, rangeStart, type RangeKey } from "@/lib/market/ranges";
import type { CompanyProfile, Quote, SeriesPayload } from "@/lib/market/types";
import { PriceChart, type ChartKind, type Overlays } from "./charts/PriceChart";
import { ChangePill, Menu, MenuCheck, Segmented, SourceBadge } from "./ui";

interface Props {
  inst: Instrument;
  daily: SeriesPayload | undefined;
  quote: Quote | undefined;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
}

const KINDS = [
  { value: "candles", label: "Candles" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
] as const;

export function MainPanel({ inst, daily, quote, range, onRange }: Props) {
  const interval = intervalFor(range);
  const { series, loading } = useSeries(inst.id, interval, interval === "daily" ? daily : undefined);
  const profile = useProfile(inst);

  const [kind, setKind] = useState<ChartKind>("candles");
  const [show, setShow] = useState({ sma20: true, sma50: false, bands: false, volume: true, log: false, table: false });
  const flip = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const bars = useMemo(() => series?.bars ?? [], [series]);
  const closes = useMemo(() => bars.map((b) => b.c), [bars]);
  const overlays: Overlays = useMemo(
    () => ({
      sma20: show.sma20 ? sma(closes, 20) : null,
      sma50: show.sma50 ? sma(closes, 50) : null,
      bands: show.bands ? bollinger(closes, 20, 2) : null,
    }),
    [closes, show.sma20, show.sma50, show.bands],
  );

  const initialStart = useMemo(() => {
    if (bars.length === 0) return 0;
    const from = rangeStart(range, bars[bars.length - 1].t);
    return Math.max(0, bars.findIndex((b) => b.t >= from));
  }, [bars, range]);

  const [hover, setHover] = useState<number | null>(null);
  const [zoomHint, setZoomHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showZoomHint = useCallback(() => {
    setZoomHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setZoomHint(false), 1400);
  }, []);
  const [view, setView] = useState<[number, number] | null>(null);

  
  const viewKey = `${series?.id}.${series?.interval}.${range}`;

  const stats = useMemo(() => {
    if (bars.length < 2) return null;
    const [a, b] = view ?? [initialStart, bars.length - 1];
    return rangeStats(bars.slice(a, b + 1), periodsPerYear(interval));
  }, [bars, view, initialStart, interval]);

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const headline = quote
    ? { price: quote.price, change: quote.change, pct: quote.changePct, note: `Last trade ${formatTradeTime(quote.t)}` }
    : lastBar && prevBar
      ? {
          price: lastBar.c,
          change: lastBar.c - prevBar.c,
          pct: (lastBar.c / prevBar.c - 1) * 100,
          note: `Close ${formatDay(lastBar.t)}`,
        }
      : null;
  const dir = direction(headline?.change ?? 0);

  const readoutIndex = hover ?? bars.length - 1;
  const windowBars = useMemo(() => {
    const [a, b] = view ?? [initialStart, bars.length - 1];
    return bars.slice(a, b + 1);
  }, [bars, view, initialStart]);
  const fourth =
    inst.kind === "stock"
      ? { label: "Avg volume", value: windowBars.length ? formatCompact(mean(windowBars.map((b) => b.v ?? 0))) : "—" }
      : {
          label: interval === "daily" ? "Avg daily range" : "Avg weekly range",
          value: windowBars.length ? `${mean(windowBars.map((b) => ((b.h - b.l) / b.c) * 100)).toFixed(2)}%` : "—",
        };
  const overlayCount = [show.sma20, show.sma50, show.bands].filter(Boolean).length;

  return (
    <section aria-labelledby="instrument-title" className="@container border-b border-line px-4 pb-6 pt-6 md:px-8">
      <div className="grid items-end gap-x-8 gap-y-5 @2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-center gap-3.5">
          <InstrumentMark inst={inst} logo={profile?.logo ?? null} />
          <div className="min-w-0">
            <h1 id="instrument-title" className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
              {inst.label}
              <span className="truncate text-sm font-normal text-ink-2">{profile?.name ?? inst.name}</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted">
              {inst.kind === "stock"
                ? [profile?.exchange?.split(" ")[0], profile?.industry, profile?.marketCapMillions ? `$${formatCompact(profile.marketCapMillions * 1e6)} market cap` : null]
                    .filter(Boolean)
                    .join(" · ") || "US equity"
                : `Spot FX, price of 1 ${inst.base} in ${inst.quote}`}
            </p>
          </div>
        </div>

        {headline && (
          <div className="@2xl:text-right">
            <div className="text-5xl font-semibold leading-none tracking-tight">
              <RollingNumber text={formatPrice(headline.price, inst.decimals)} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 @2xl:justify-end">
              <span className={`tabular font-mono text-sm font-medium ${toneClass(dir)}`}>
                {formatSigned(headline.change, inst.decimals)}
              </span>
              <ChangePill pct={headline.pct} size="md" />
              <span className="text-xs text-muted">{headline.note}</span>
            </div>
          </div>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl bg-surface-2/60 px-4 py-3.5 ring-1 ring-line sm:grid-cols-[auto_minmax(140px,1.6fr)_auto_auto]">
        <Stat label={`${range === "MAX" ? "All-time" : range} change`} value={stats ? formatPct(stats.changePct) : "—"} tone={stats ? toneClass(direction(stats.changePct)) : undefined} />
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-[11px] text-muted">Window range</dt>
          <dd className="mt-1.5">
            {stats ? <RangeBar low={stats.low} high={stats.high} value={stats.last} decimals={inst.decimals} /> : "—"}
          </dd>
        </div>
        <Stat label="Volatility, annualised" value={stats ? `${stats.volatilityPct.toFixed(1)}%` : "—"} />
        <Stat label={fourth.label} value={fourth.value} />
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Segmented
          label="Time range"
          value={range}
          onChange={onRange}
          options={RANGES.map((r) => ({
            value: r,
            label: r,
            title: intervalFor(r) === "daily" ? "Daily bars" : "Weekly bars, full history",
          }))}
        />
        <Segmented label="Chart type" value={kind} onChange={setKind} options={KINDS} />
        <span className="ml-auto flex items-center gap-2">
          <Menu label="Indicators" badge={overlayCount}>
            <MenuCheck checked={show.sma20} onChange={() => flip("sma20")} label="SMA 20" hint="20-bar simple moving average" swatch="var(--series-2)" />
            <MenuCheck checked={show.sma50} onChange={() => flip("sma50")} label="SMA 50" hint="50-bar simple moving average" swatch="var(--series-5)" />
            <MenuCheck checked={show.bands} onChange={() => flip("bands")} label="Bollinger bands" hint="20 bars, 2 standard deviations" swatch="var(--muted)" />
            <div className="my-1 h-px bg-line" />
            {inst.kind === "stock" && <MenuCheck checked={show.volume} onChange={() => flip("volume")} label="Volume" />}
            <MenuCheck checked={show.log} onChange={() => flip("log")} label="Log scale" hint="Equal steps are equal % moves" />
          </Menu>
          <button
            onClick={() => flip("table")}
            aria-pressed={show.table}
            className={`press rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              show.table ? "border-ink bg-ink text-page" : "border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            Table
          </button>
        </span>
      </div>

      {bars[readoutIndex] && (
        <Readout bar={bars[readoutIndex]} prev={bars[readoutIndex - 1]} inst={inst} overlays={overlays} index={readoutIndex} hovering={hover !== null} />
      )}

      <div className="relative mt-1">
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 top-32 z-10 -translate-x-1/2 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-page shadow-lg transition-opacity duration-300 ${
            zoomHint ? "opacity-90" : "opacity-0"
          }`}
        >
          Hold Ctrl (⌘ on Mac) and scroll to zoom
        </div>
        {bars.length > 1 ? (
          show.table ? (
            <BarTable bars={bars.slice(view?.[0] ?? initialStart, (view?.[1] ?? bars.length - 1) + 1)} inst={inst} />
          ) : (
            <PriceChart
              bars={bars}
              initialStart={initialStart}
              viewKey={viewKey}
              kind={kind}
              log={show.log}
              overlays={overlays}
              showVolume={show.volume && inst.kind === "stock"}
              decimals={inst.decimals}
              onHover={setHover}
              onView={(a, b) => setView((v) => (v && v[0] === a && v[1] === b ? v : [a, b]))}
              dimmed={loading}
              onWheelHint={showZoomHint}
            />
          )
        ) : (
          <div className="mt-3 h-[452px] rounded-xl skeleton" role="status" aria-label={`Loading ${interval} history`} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="max-w-[70ch] text-[11px] leading-relaxed text-muted">
          Ctrl/⌘ + scroll or pinch to zoom, drag to pan, brush the strip to pick a window. With the chart focused, ← → step
          through bars.{interval === "weekly" && inst.kind === "stock" ? " Weekly history is split-adjusted." : ""}
        </p>
        {series && <SourceBadge series={series} provider="Alpha Vantage" />}
      </div>
    </section>
  );
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const tradeTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** New York time so everyone sees the same thing */
function formatTradeTime(t: number): string {
  return `${tradeTime.format(t)} ET`;
}

function InstrumentMark({ inst, logo }: { inst: Instrument; logo: string | null }) {
  if (logo) {
    return (
      <img src={logo} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-line" />
    );
  }
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 font-mono text-[10px] font-semibold leading-tight text-ink-2 ring-1 ring-line">
      {inst.kind === "fx" ? (
        <span className="text-center">
          {inst.base}
          <span className="block border-t border-[var(--axis)] text-muted">{inst.quote}</span>
        </span>
      ) : (
        inst.label.slice(0, 2)
      )}
    </span>
  );
}

/** the digits roll when the price changes */
function RollingNumber({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span className="tabular inline-flex">
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) => {
        const key = chars.length - i; 
        if (!/\d/.test(ch)) {
          return (
            <span key={key} aria-hidden>
              {ch}
            </span>
          );
        }
        return (
          <span key={key} className="roll" aria-hidden>
            <span style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function RangeBar({ low, high, value, decimals }: { low: number; high: number; value: number; decimals: number }) {
  const pct = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-[var(--grid)]">
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: `${pct}%`, transition: "left 300ms var(--ease-out)" }}
          title={`Latest ${formatPrice(value, decimals)}`}
        />
      </div>
      <div className="tabular mt-1.5 flex justify-between font-mono text-[11px] text-ink-2">
        <span>{formatPrice(low, decimals)}</span>
        <span>{formatPrice(high, decimals)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`tabular font-mono text-sm font-medium ${tone ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}

function Readout({
  bar,
  prev,
  inst,
  overlays,
  index,
  hovering,
}: {
  bar: SeriesPayload["bars"][number];
  prev?: SeriesPayload["bars"][number];
  inst: Instrument;
  overlays: Overlays;
  index: number;
  hovering: boolean;
}) {
  const p = (v: number) => formatPrice(v, inst.decimals);
  const chg = prev ? (bar.c / prev.c - 1) * 100 : 0;
  const items: [string, string, string?][] = [
    ["O", p(bar.o)],
    ["H", p(bar.h)],
    ["L", p(bar.l)],
    ["C", p(bar.c)],
  ];
  if (bar.v !== null) items.push(["Vol", formatCompact(bar.v)]);
  if (overlays.sma20?.[index]) items.push(["SMA20", p(overlays.sma20[index]!), "var(--series-2)"]);
  if (overlays.sma50?.[index]) items.push(["SMA50", p(overlays.sma50[index]!), "var(--series-5)"]);
  return (
    <div className="mt-4 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-live="off">
      <span className={`font-medium ${hovering ? "text-ink" : "text-muted"}`}>{formatDay(bar.t)}</span>
      {items.map(([k, v, c]) => (
        <span key={k} className="flex items-center gap-1.5">
          {c && <span className="inline-block h-0.5 w-2.5 rounded" style={{ background: c }} aria-hidden />}
          <span className="text-muted">{k}</span>
          <span className="tabular font-mono text-ink">{v}</span>
        </span>
      ))}
      {prev && <span className={`tabular font-mono ${toneClass(direction(chg))}`}>{formatPct(chg)}</span>}
    </div>
  );
}

function BarTable({ bars, inst }: { bars: SeriesPayload["bars"]; inst: Instrument }) {
  const rows = [...bars].reverse();
  const p = (v: number) => formatPrice(v, inst.decimals);
  return (
    <div className="mt-3 max-h-100 overflow-auto rounded-lg border border-line">
      <table className="w-full text-xs">
        <caption className="sr-only">{inst.label} price history for the visible window</caption>
        <thead className="sticky top-0 bg-surface text-muted">
          <tr className="text-right [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th className="text-left">Date</th>
            <th>Open</th>
            <th>High</th>
            <th>Low</th>
            <th>Close</th>
            <th>Change</th>
            {inst.kind === "stock" && <th>Volume</th>}
          </tr>
        </thead>
        <tbody className="tabular font-mono">
          {rows.map((b, i) => {
            const prev = rows[i + 1];
            const chg = prev ? (b.c / prev.c - 1) * 100 : null;
            return (
              <tr key={b.t} className="border-t border-line text-right [&>td]:px-3 [&>td]:py-1.5">
                <td className="text-left font-sans text-ink-2">{formatDay(b.t)}</td>
                <td>{p(b.o)}</td>
                <td>{p(b.h)}</td>
                <td>{p(b.l)}</td>
                <td className="font-medium text-ink">{p(b.c)}</td>
                <td className={chg === null ? "text-muted" : toneClass(direction(chg))}>{chg === null ? "—" : formatPct(chg)}</td>
                {inst.kind === "stock" && <td className="text-ink-2">{b.v !== null ? formatCompact(b.v) : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function useProfile(inst: Instrument): CompanyProfile | null {
  const [profile, setProfile] = useState<{ id: string; p: CompanyProfile | null } | null>(null);
  useEffect(() => {
    if (inst.kind !== "stock") return;
    let live = true;
    fetch(`/api/profile/${inst.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => live && setProfile({ id: inst.id, p }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [inst]);
  return profile?.id === inst.id ? profile.p : null;
}
