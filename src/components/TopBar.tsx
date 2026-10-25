"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatClock } from "@/lib/client/format";
import { NOTICE_COPY } from "@/lib/market/errors";
import { fxSession, usEquitySession, type SessionStatus } from "@/lib/market/sessions";
import type { BoardPayload, QuotesPayload } from "@/lib/market/types";

export function TopBar({ board, quotes }: { board: BoardPayload; quotes: QuotesPayload }) {
  const now = useNow();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-page/90 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2.5">
        <PulseMark />
        <span className="text-[15px] font-semibold tracking-tight">Market Pulse</span>
      </div>

      <div className="ml-2 hidden items-center gap-2 md:flex">
        {now && (
          <>
            <Session label="NYSE" status={usEquitySession(now)} />
            <Session label="FX" status={fxSession(now)} />
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {now && <span className="tabular hidden font-mono text-xs text-muted sm:inline">{formatClock(now.getTime())}</span>}
        <DataStatus board={board} quotes={quotes} />
        <ThemeToggle />
      </div>
    </header>
  );
}

function PulseMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect width="22" height="22" rx="6" style={{ fill: "var(--ink)" }} />
      <path
        d="M4 12h3.5l2-5 3 9 2-4H18"
        style={{ fill: "none", stroke: "var(--page)", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}
      />
    </svg>
  );
}

function Session({ label, status }: { label: string; status: SessionStatus }) {
  const open = status.state === "open";
  const extended = status.state === "pre" || status.state === "after";
  const word = open ? "Open" : status.state === "pre" ? "Pre-market" : status.state === "after" ? "After-hours" : "Closed";
  return (
    <span
      title={status.detail}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${open ? "animate-pulse" : ""}`}
        style={{ background: open ? "var(--up)" : extended ? "var(--series-4)" : "var(--muted)" }}
        aria-hidden
      />
      <span className="font-medium text-ink">{label}</span> {word}
    </span>
  );
}

function DataStatus({ board, quotes }: { board: BoardPayload; quotes: QuotesPayload }) {
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

  const fromProvider = board.series.filter((s) => s.source === "provider").length;
  const total = board.series.length;
  const snapshotNotices = [...new Set(board.series.flatMap((s) => (s.notice ? [s.notice] : [])))];
  const quotesLive = quotes.source === "provider";
  const healthy = quotesLive && !quotes.stale && fromProvider === total;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="press inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2"
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: healthy ? "var(--up)" : "var(--series-4)" }}
          aria-hidden
        />
        Data
      </button>
      <div
        data-open={open}
        className="popover fixed inset-x-4 top-16 z-40 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 border border-line bg-surface p-4 text-xs shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
      >
          <p className="eyebrow mb-3">Data sources</p>
          <dl className="space-y-3">
            <div>
              <dt className="flex justify-between font-medium text-ink">
                Finnhub · live US quotes
                <span className={quotesLive ? "text-up" : "text-down"}>{quotesLive ? "● Live" : "● Unavailable"}</span>
              </dt>
              <dd className="mt-1 text-ink-2">
                {quotesLive && quotes.stale
                  ? "Finnhub refused the latest refresh, so prices show the last trades received. They update on the next successful poll."
                  : quotesLive
                  ? `${Object.keys(quotes.quotes).length} stocks, refreshed every 15 s in market hours.`
                  : `${quotes.notice === "missing_key" ? "No Finnhub API key configured." : quotes.notice ? NOTICE_COPY[quotes.notice] : "No quotes yet."} Stock prices show the latest daily close instead.`}
              </dd>
            </div>
            <div>
              <dt className="flex justify-between font-medium text-ink">
                Alpha Vantage · daily & weekly history
                <span className="tabular font-mono text-ink-2">
                  {fromProvider}/{total}
                </span>
              </dt>
              <dd className="mt-1 text-ink-2">
                {fromProvider === total
                  ? "Every series came from the provider, cached on the server for several hours."
                  : `${total - fromProvider} series are showing the bundled snapshot.`}
                {snapshotNotices.map((n) => (
                  <span key={n} className="mt-1 block text-muted">
                    {NOTICE_COPY[n]}
                  </span>
                ))}
              </dd>
            </div>
          </dl>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => null);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
      aria-label={`Switch to ${next} theme`}
      className="press grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 hover:bg-surface-2"
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

const readTheme = () => document.documentElement.dataset.theme ?? "dark";
function subscribeTheme(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** null on the server so the html matches */
function useNow(): Date | null {
  const seconds = useSyncExternalStore(subscribeClock, readClock, () => null);
  return seconds === null ? null : new Date(seconds * 1000);
}
const readClock = () => Math.floor(Date.now() / 1000);
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}
