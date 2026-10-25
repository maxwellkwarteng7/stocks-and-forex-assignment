"use client";

// blue moves together, red moves opposite, grey means no relationship.
// we only draw the bottom half, the top is a mirror

import { useState } from "react";
import { useSize } from "@/lib/client/hooks";

interface Props {
  labels: string[];
  matrix: number[][];
}

export function CorrelationHeatmap({ labels, matrix }: Props) {
  const [wrapRef, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const n = labels.length;
  const labelW = 64;
  const overhang = 40;
  const cell = Math.max(18, Math.min(40, Math.floor((width - labelW - overhang) / n)));
  const size = labelW + cell * n;

  const fill = (r: number) => {
    if (!Number.isFinite(r)) return "var(--surface-2)";
    const pct = Math.round(Math.abs(r) * 100);
    const pole = r >= 0 ? "var(--div-pos)" : "var(--div-neg)";
    return `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))`;
  };

  const hv = hover ? matrix[hover.i][hover.j] : null;

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-3 h-5 text-xs text-ink-2" aria-live="polite">
        {hover && hv !== null ? (
          <>
            <span className="font-medium text-ink">{labels[hover.i]}</span> vs{" "}
            <span className="font-medium text-ink">{labels[hover.j]}</span>:{" "}
            <span className="tabular font-mono text-ink">{Number.isFinite(hv) ? hv.toFixed(2) : "n/a"}</span>{" "}
            <span className="text-muted">{describe(hv)}</span>
          </>
        ) : (
          <span className="text-muted">Hover a cell to read the pair.</span>
        )}
      </div>
      {width > 0 && (
        <div className="overflow-x-auto">
          <svg width={size + overhang} height={size} role="img" aria-label="Correlation matrix of daily returns">
            {labels.map((label, i) => (
              <text
                key={`r${label}`}
                x={labelW - 8}
                y={labelW + i * cell + cell / 2 + 4}
                textAnchor="end"
                className="tabular"
                style={{ fill: hover?.i === i || hover?.j === i ? "var(--ink)" : "var(--muted)", font: "500 10.5px var(--font-mono)" }}
              >
                {label}
              </text>
            ))}
            {labels.map((label, j) => (
              <text
                key={`c${label}`}
                transform={`translate(${labelW + j * cell + cell / 2 + 4},${labelW - 8}) rotate(-60)`}
                style={{ fill: hover?.i === j || hover?.j === j ? "var(--ink)" : "var(--muted)", font: "500 10.5px var(--font-mono)" }}
              >
                {label}
              </text>
            ))}
            {matrix.map((row, i) =>
              row.map((r, j) =>
                j > i ? null : (
                  <rect
                    key={`${i}-${j}`}
                    x={labelW + j * cell + 1}
                    y={labelW + i * cell + 1}
                    width={cell - 2}
                    height={cell - 2}
                    rx={3}
                    tabIndex={i === j ? -1 : 0}
                    aria-label={`${labels[i]} vs ${labels[j]}: ${Number.isFinite(r) ? r.toFixed(2) : "not available"}`}
                    style={{
                      // the diagonal is always 1 so keep it neutral
                      fill: i === j ? "var(--surface-2)" : fill(r),
                      stroke: hover?.i === i && hover?.j === j ? "var(--ink)" : "none",
                      strokeWidth: 1.5,
                      outline: "none",
                    }}
                    onPointerEnter={() => i !== j && setHover({ i, j })}
                    onFocus={() => i !== j && setHover({ i, j })}
                    onPointerLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                ),
              ),
            )}
          </svg>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
        <span>−1 opposite</span>
        <span
          className="h-2 w-28 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))" }}
        />
        <span>+1 together</span>
      </div>
    </div>
  );
}

function describe(r: number): string {
  if (!Number.isFinite(r)) return "";
  const a = Math.abs(r);
  const strength = a > 0.7 ? "strong" : a > 0.4 ? "moderate" : a > 0.2 ? "weak" : "little to no";
  if (strength === "little to no") return "· little to no relationship";
  return `· ${strength} ${r > 0 ? "positive" : "negative"}`;
}
