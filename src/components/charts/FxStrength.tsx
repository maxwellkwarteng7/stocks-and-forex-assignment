"use client";

// USD/JPY and USD/GHS are flipped so every bar answers one question,
// did this currency gain on the dollar

import * as d3 from "d3";
import { useState } from "react";
import { formatPct } from "@/lib/client/format";
import { useSize } from "@/lib/client/hooks";

export interface StrengthRow {
  currency: string;
  name: string;
  pct: number;
}

const ROW_H = 34;
const LABEL_W = 46;
const VALUE_W = 64;
const MIN_W = 280;

export function FxStrength({ rows }: { rows: StrengthRow[] }) {
  const [wrapRef, { width: measured }] = useSize<HTMLDivElement>();
  const width = measured > 0 ? Math.max(MIN_W, measured) : 0;
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const maxAbs = d3.max(sorted, (r) => Math.abs(r.pct)) || 1;
  const plotW = Math.max(40, width - LABEL_W - VALUE_W * 2);
  const x = d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, plotW]);
  const height = sorted.length * ROW_H;

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto">
      {width > 0 && (
        <svg width={width} height={height + 4} role="img" aria-label="Currency moves against the US dollar">
          <g transform={`translate(${LABEL_W + VALUE_W},0)`}>
            <line x1={x(0)} x2={x(0)} y1={0} y2={height} style={{ stroke: "var(--axis)" }} />
            {sorted.map((r, i) => {
              const up = r.pct >= 0;
              const x0 = x(Math.min(0, r.pct));
              const w = Math.max(2, Math.abs(x(r.pct) - x(0)));
              const yMid = i * ROW_H + ROW_H / 2;
              const barH = Math.min(18, ROW_H - 12);
              const active = hover === r.currency;
              return (
                <g
                  key={r.currency}
                  onPointerEnter={() => setHover(r.currency)}
                  onPointerLeave={() => setHover(null)}
                >
                  <rect x={-LABEL_W - VALUE_W} y={i * ROW_H} width={width} height={ROW_H} style={{ fill: active ? "var(--surface-2)" : "transparent" }} />
                  <path d={roundedBar(x0, yMid - barH / 2, w, barH, up)} style={{ fill: up ? "var(--up)" : "var(--down)", fillOpacity: active ? 1 : 0.85 }} />
                  <text
                    x={-VALUE_W - 10}
                    y={yMid + 4}
                    textAnchor="end"
                    style={{ fill: "var(--ink)", font: "600 12px var(--font-mono)" }}
                  >
                    {r.currency}
                  </text>
                  <text
                    x={up ? x(r.pct) + 6 : x(r.pct) - 6}
                    y={yMid + 4}
                    textAnchor={up ? "start" : "end"}
                    className="tabular"
                    style={{ fill: "var(--ink-2)", font: "500 11px var(--font-mono)" }}
                  >
                    {up ? "▲" : "▼"} {formatPct(r.pct)}
                  </text>
                  <title>{`${r.name}: ${formatPct(r.pct)} vs USD`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

function roundedBar(x: number, y: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h / 2);
  if (up) {
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
}
