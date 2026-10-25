"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { arrow, direction, formatAge, formatPct } from "@/lib/client/format";
import { NOTICE_COPY } from "@/lib/market/errors";
import type { SeriesPayload } from "@/lib/market/types";

/** the highlight slides between options */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const thumbRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  // straight on the DOM so there's no re-render, and no slide in on first load
  useLayoutEffect(() => {
    const el = refs.current.get(value);
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    thumb.style.transition = placed.current ? "transform 220ms var(--ease-out), width 220ms var(--ease-out)" : "none";
    thumb.style.width = `${el.offsetWidth}px`;
    thumb.style.transform = `translateX(${el.offsetLeft}px)`;
    thumb.style.opacity = "1";
    placed.current = true;
  }, [value, options]);

  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-lg bg-surface-2 p-0.5">
      <span
        ref={thumbRef}
        aria-hidden
        className="slide-indicator absolute bottom-0.5 left-0 top-0.5 rounded-md bg-surface opacity-0 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_0_0_1px_var(--border)]"
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              if (el) refs.current.set(o.value, el);
            }}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`press relative z-10 rounded-md px-2.5 py-1 text-xs font-medium ${
              active ? "text-ink" : "text-muted hover:text-ink-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** colour, arrow and sign always agree */
export function ChangePill({ pct, size = "sm" }: { pct: number; size?: "sm" | "md" }) {
  const d = direction(pct);
  const tone =
    d === "up"
      ? "bg-[color-mix(in_srgb,var(--up)_14%,transparent)] text-up"
      : d === "down"
        ? "bg-[color-mix(in_srgb,var(--down)_14%,transparent)] text-down"
        : "bg-surface-2 text-muted";
  return (
    <span
      className={`tabular inline-flex items-center gap-1 rounded-md font-mono font-medium ${tone} ${
        size === "md" ? "px-2 py-0.5 text-sm" : "px-1.5 py-px text-[11px]"
      }`}
    >
      <span className="text-[0.75em]" aria-hidden>
        {arrow(d)}
      </span>
      {formatPct(pct)}
    </span>
  );
}

export function Menu({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="press inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        {label}
        {badge ? (
          <span className="tabular grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 font-mono text-[10px] text-page">
            {badge}
          </span>
        ) : null}
        <Chevron open={open} />
      </button>
      <div
        data-open={open}
        className="popover absolute right-0 top-full z-40 mt-2 w-[min(15rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
      >
        {children}
      </div>
    </div>
  );
}

export function MenuCheck({
  checked,
  onChange,
  label,
  hint,
  swatch,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  swatch?: string;
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-surface-2"
    >
      <span
        aria-hidden
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors duration-150 ${
          checked ? "border-ink bg-ink text-page" : "border-[var(--axis)]"
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-ink">
          {label}
          {swatch && <span className="h-0.5 w-3 rounded" style={{ background: swatch }} aria-hidden />}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
      </span>
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden
      className="transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SourceBadge({ series, provider }: { series: SeriesPayload; provider: string }) {
  const snapshot = series.source === "snapshot";
  const title = snapshot && series.notice ? NOTICE_COPY[series.notice] : undefined;
  return (
    <span title={title} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: snapshot ? "var(--series-4)" : "var(--up)" }}
        aria-hidden
      />
      {snapshot ? `Snapshot as of ${series.lastRefreshed}` : `${provider}, fetched ${formatAge(series.ageSeconds)}`}
    </span>
  );
}

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
