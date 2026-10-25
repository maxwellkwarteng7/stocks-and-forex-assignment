"use client";

import { startTransition, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { direction, formatPrice } from "@/lib/client/format";
import { FX_PAIRS, INSTRUMENTS, STOCKS, type Instrument } from "@/lib/market/instruments";
import type { SeriesPayload } from "@/lib/market/types";
import { Sparkline } from "./charts/Sparkline";
import { ChangePill } from "./ui";

export interface LastPrice {
  price: number;
  changePct: number;
  live: boolean;
}

interface Props {
  board: Map<string, SeriesPayload>;
  prices: Map<string, LastPrice>;
  selected: string;
  onSelect: (id: string) => void;
}

/** rows are 62px so this leaves 10px top and bottom */
const BAR_H = 42;
const SLIDE_MS = 240;

export function Watchlist({ board, prices, selected: committed, onSelect: commit }: Props) {
  // the list updates straight away but the main panel waits for the bar to land,
  // otherwise the chart redraw makes the slide stutter
  const [selected, setSelected] = useState(committed);
  const [seen, setSeen] = useState(committed);
  if (committed !== seen) {
    // selection changed from outside, like the back button
    setSeen(committed);
    setSelected(committed);
  }
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const onSelect = (id: string) => {
    setSelected(id);
    clearTimeout(commitTimer.current);
    const sliding = barRef.current?.offsetParent != null;
    commitTimer.current = setTimeout(() => startTransition(() => commit(id)), sliding ? SLIDE_MS : 0);
  };
  const placed = useRef(false);
  const selectedRef = useRef(selected);

  // we move the bar straight in the DOM and only animate transform so it stays smooth
  const place = (animate: boolean) => {
    const nav = navRef.current;
    const bar = barRef.current;
    const row = nav?.querySelector<HTMLElement>(`[data-id="${selectedRef.current}"]`);
    if (!nav || !bar || !row) return;
    const top = row.offsetTop + (row.offsetHeight - BAR_H) / 2;
    bar.style.transition = animate ? `transform ${SLIDE_MS}ms var(--ease-out)` : "none";
    bar.style.transform = `translateY(${top}px)`;
    bar.style.opacity = "1";
  };

  useLayoutEffect(() => {
    const changed = selectedRef.current !== selected;
    selectedRef.current = selected;
    if (changed || !placed.current) place(placed.current);
    placed.current = true;
  });

  // one observer for the whole lifetime, a new one fires straight away and cuts the slide short
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let last = "";
    const ro = new ResizeObserver(([entry]) => {
      const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
      if (size !== last && last !== "") place(false);
      last = size;
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  // no smooth scroll for arrow keys, people press them too fast
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = INSTRUMENTS.findIndex((x) => x.id === selected);
    const next = INSTRUMENTS[(i + (e.key === "ArrowDown" ? 1 : -1) + INSTRUMENTS.length) % INSTRUMENTS.length];
    onSelect(next.id);
    navRef.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  return (
    <nav
      ref={navRef}
      aria-label="Watchlist"
      onKeyDown={onKeyDown}
      className="relative flex gap-5 overflow-x-auto px-4 py-4 lg:block lg:space-y-6 lg:overflow-visible lg:px-0"
    >
      <span
        ref={barRef}
        aria-hidden
        style={{ height: BAR_H }}
        className="slide-indicator pointer-events-none absolute left-1 top-0 hidden w-[3px] rounded-full will-change-transform bg-accent opacity-0 lg:block"
      />
      <Group title="Equities" note="Live" items={STOCKS} {...{ board, prices, selected, onSelect }} />
      <Group title="Forex" note="End of day" items={FX_PAIRS} {...{ board, prices, selected, onSelect }} />
    </nav>
  );
}

function Group({
  title,
  note,
  items,
  ...rest
}: Props & { title: string; note: string; items: readonly Instrument[] }) {
  const changes = items.map((i) => rest.prices.get(i.id)?.changePct ?? 0);
  const up = changes.filter((c) => c > 0).length;
  const down = changes.filter((c) => c < 0).length;

  return (
    <section className="min-w-max lg:min-w-0">
      <div className="mb-1 flex items-baseline justify-between px-3 lg:px-4">
        <h2 className="text-xs font-semibold text-ink">
          {title} <span className="font-normal text-muted">· {note}</span>
        </h2>
        <span className="tabular font-mono text-[11px] text-muted" title={`${up} up, ${down} down today`}>
          <span className="text-up">{up} ▲</span> <span className="text-down">{down} ▼</span>
        </span>
      </div>
      <ul className="flex gap-1 lg:block lg:space-y-px">
        {items.map((inst) => (
          <li key={inst.id}>
            <Row inst={inst} {...rest} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ inst, board, prices, selected, onSelect }: Props & { inst: Instrument }) {
  const series = board.get(inst.id);
  const last = prices.get(inst.id);
  const closes = series?.bars.slice(-30).map((b) => b.c) ?? [];
  const dir = direction(last?.changePct ?? 0);
  const active = selected === inst.id;
  const flash = useFlash(last?.price);

  return (
    <button
      data-id={inst.id}
      onClick={() => onSelect(inst.id)}
      aria-current={active ? "true" : undefined}
      tabIndex={active ? 0 : -1}
      className={`row-select grid w-56 grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left lg:w-full lg:px-4 ${
        active
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] ring-1 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)] lg:ring-0"
          : "hover:bg-surface-2"
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-[13px] font-semibold tracking-tight ${active ? "text-ink" : "text-ink"}`}>
          {inst.label}
        </span>
        <span className={`block truncate text-[11px] ${active ? "text-ink-2" : "text-muted"}`}>{inst.name}</span>
      </span>
      <Sparkline values={closes} up={dir !== "down"} width={64} />
      <span className="flex flex-col items-end gap-1">
        <span className={`tabular rounded px-1 font-mono text-[13px] font-medium text-ink ${flash}`}>
          {last ? formatPrice(last.price, inst.decimals) : "—"}
        </span>
        {last && <ChangePill pct={last.changePct} />}
      </span>
    </button>
  );
}

function useFlash(price: number | undefined): string {
  const prev = useRef(price);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (price === undefined || prev.current === undefined || price === prev.current) {
      prev.current = price;
      return;
    }
    const next = price > prev.current ? "flash-up" : "flash-down";
    prev.current = price;
    // a tick later so it's not set during render
    const on = setTimeout(() => setCls(next), 0);
    const off = setTimeout(() => setCls(""), 1200);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [price]);
  return cls;
}
