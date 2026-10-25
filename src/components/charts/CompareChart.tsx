"use client";

// every line starts at 0% so a $350 stock and a 1.12 pair can share one axis

import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";
import { formatDay, formatPct } from "@/lib/client/format";
import { useSize } from "@/lib/client/hooks";

export interface CompareLine {
  id: string;
  label: string;
  color: string;
  points: { t: number; pct: number }[];
}

const M = { top: 14, right: 96, bottom: 24, left: 48 };
const HEIGHT = 280;
const MIN_W = 320;

export function CompareChart({ lines }: { lines: CompareLine[] }) {
  const [wrapRef, { width: measured }] = useSize<HTMLDivElement>();
  const width = measured > 0 ? Math.max(MIN_W, measured) : 0;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ t: number; left: number; rows: { line: CompareLine; pct: number }[] } | null>(
    null,
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width === 0) return;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    const drawable = lines.filter((l) => l.points.length > 1);
    if (drawable.length === 0) return;

    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const all = drawable.flatMap((l) => l.points);
    const x = d3
      .scaleUtc()
      .domain(d3.extent(all, (p) => p.t) as [number, number])
      .range([0, innerW]);
    const [lo, hi] = d3.extent(all, (p) => p.pct) as [number, number];
    const y = d3
      .scaleLinear()
      .domain([Math.min(lo, 0), Math.max(hi, 0)])
      .nice(5)
      .range([innerH, 0]);

    const g = svg.append("g").attr("transform", `translate(${M.left},${M.top})`);
    g.append("g")
      .attr("class", "gridlines")
      .call(d3.axisRight(y).ticks(5).tickSize(innerW).tickFormat(() => ""));
    // the 0% line is darker since everything is compared to it
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .style("stroke", "var(--axis)");
    g.append("g")
      .attr("class", "axis")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(0)
          .tickPadding(8)
          .tickFormat((v) => `${(v as number) > 0 ? "+" : ""}${v}%`),
      )
      .select(".domain")
      .remove();
    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(innerW / 90))).tickSize(4))
      .select(".domain")
      .style("stroke", "var(--axis)");

    const line = d3
      .line<{ t: number; pct: number }>()
      .x((p) => x(p.t))
      .y((p) => y(p.pct));
    for (const l of drawable) {
      g.append("path")
        .datum(l.points)
        .attr("d", line)
        .style("fill", "none")
        .style("stroke", l.color)
        .style("stroke-width", 2)
        .style("stroke-linejoin", "round")
        .style("stroke-linecap", "round");
    }

    // end labels, pushed apart only if they overlap
    const ends = drawable
      .map((l) => ({ l, p: l.points[l.points.length - 1] }))
      .map((e) => ({ ...e, y: y(e.p.pct) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
    for (const e of ends) {
      const ex = x(e.p.t);
      const ey = y(e.p.pct);
      if (Math.abs(e.y - ey) > 2) {
        g.append("path")
          .attr("d", `M${ex + 5},${ey}L${ex + 12},${e.y}`)
          .style("fill", "none")
          .style("stroke", "var(--axis)");
      }
      g.append("text")
        .attr("x", ex + 14)
        .attr("y", e.y + 4)
        .text(`${e.l.label} ${formatPct(e.p.pct, 1)}`)
        .style("fill", "var(--ink-2)")
        .style("font", "500 10.5px var(--font-mono)");
      g.append("circle")
        .attr("cx", ex)
        .attr("cy", ey)
        .attr("r", 4)
        .style("fill", e.l.color)
        .style("stroke", "var(--surface)")
        .style("stroke-width", 2);
    }

    const cross = g.append("line").attr("y1", 0).attr("y2", innerH).style("stroke", "var(--ink-2)").style("stroke-dasharray", "3 3").style("display", "none");
    const dots = g.append("g").style("display", "none");
    g.append("rect")
      .attr("width", innerW)
      .attr("height", innerH)
      .style("fill", "transparent")
      .on("pointermove", (event: PointerEvent) => {
        const [mx] = d3.pointer(event);
        const t = x.invert(mx).getTime();
        const rows = drawable.map((l) => {
          const i = d3.bisector((p: { t: number }) => p.t).center(l.points, t);
          return { line: l, p: l.points[i] };
        });
        const ct = rows[0].p.t;
        cross.style("display", null).attr("x1", x(ct)).attr("x2", x(ct));
        dots
          .style("display", null)
          .selectAll("circle")
          .data(rows)
          .join("circle")
          .attr("cx", (r) => x(r.p.t))
          .attr("cy", (r) => y(r.p.pct))
          .attr("r", 4)
          .style("fill", (r) => r.line.color)
          .style("stroke", "var(--surface)")
          .style("stroke-width", 2);
        setHover({
          t: ct,
          left: x(ct) + M.left,
          rows: rows.map((r) => ({ line: r.line, pct: r.p.pct })).sort((a, b) => b.pct - a.pct),
        });
      })
      .on("pointerleave", () => {
        cross.style("display", "none");
        dots.style("display", "none");
        setHover(null);
      });
  }, [lines, width]);

  const endRows = lines
    .filter((l) => l.points.length > 1)
    .map((l) => ({ line: l, pct: l.points[l.points.length - 1].pct }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <div ref={wrapRef} className="relative w-full overflow-x-auto overflow-y-hidden">
      <svg ref={svgRef} width={width} height={HEIGHT} className="block select-none" role="img" aria-label="Relative performance of the selected instruments" />
      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={hover.left > width / 2 ? { right: width - hover.left + 12 } : { left: hover.left + 12 }}
        >
          <div className="mb-1.5 text-muted">{formatDay(hover.t)}</div>
          {hover.rows.map((r) => (
            <Row key={r.line.id} label={r.line.label} color={r.line.color} pct={r.pct} />
          ))}
        </div>
      )}
      <div className="sr-only">
        {endRows.map((r) => `${r.line.label} ${formatPct(r.pct)}`).join(", ")}
      </div>
    </div>
  );
}

function Row({ label, color, pct }: { label: string; color: string; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-ink-2">
        <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular font-mono font-medium text-ink">{formatPct(pct)}</span>
    </div>
  );
}
