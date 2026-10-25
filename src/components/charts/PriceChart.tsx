"use client";

// the main price chart. React owns the <svg>, D3 draws everything inside it.
// the x axis counts bars not dates, so weekends don't leave gaps

import * as d3 from "d3";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Band } from "@/lib/market/analytics";
import type { Bar } from "@/lib/market/types";
import { formatDay, formatPrice } from "@/lib/client/format";
import { useSize } from "@/lib/client/hooks";

export type ChartKind = "candles" | "line" | "area";

export interface Overlays {
  sma20: (number | null)[] | null;
  sma50: (number | null)[] | null;
  bands: (Band | null)[] | null;
}

interface Props {
  bars: Bar[];
  initialStart: number;
  /** when this changes the zoom resets */
  viewKey: string;
  kind: ChartKind;
  log: boolean;
  overlays: Overlays;
  showVolume: boolean;
  decimals: number;
  onHover: (index: number | null) => void;
  onView: (start: number, end: number) => void;
  dimmed?: boolean;
  onWheelHint?: () => void;
}

const M = { top: 12, right: 64, bottom: 22, left: 8 };
const VOLUME_H = 64;
const NAV_H = 44;
const GAP = 10;

export function PriceChart(props: Props) {
  const [wrapRef, { width }] = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  // keeps the zoom when we re-render for a theme change or an indicator toggle
  const viewRef = useRef<{ key: string; domain: [number, number] } | null>(null);
  // so D3's handlers always see the latest props
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const { bars, initialStart, viewKey, kind, log, overlays, showVolume, decimals } = props;
  const hasVolume = showVolume && bars.some((b) => b.v !== null && b.v > 0);
  const mainH = 300;
  const height = M.top + mainH + (hasVolume ? GAP + VOLUME_H : 0) + M.bottom + GAP + NAV_H + 4;

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width === 0 || bars.length < 2) return;

    const n = bars.length;
    const innerW = width - M.left - M.right;
    const mainTop = M.top;
    const volTop = mainTop + mainH + GAP;
    const axisY = hasVolume ? volTop + VOLUME_H : mainTop + mainH;
    const navTop = axisY + M.bottom + GAP;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const clipId = `clip-${viewKey.replace(/\W/g, "")}`;
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", clipId)
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", axisY - mainTop);

    const root = svg.append("g").attr("transform", `translate(${M.left},0)`);

    const x0 = d3.scaleLinear().domain([-0.5, n - 0.5]).range([0, innerW]);
    const y = (log ? d3.scaleLog() : d3.scaleLinear()).range([mainTop + mainH, mainTop]);
    const yVol = d3.scaleLinear().range([volTop + VOLUME_H, volTop]);
    const xNav = d3.scaleLinear().domain([-0.5, n - 0.5]).range([0, innerW]);
    const yNav = d3
      .scaleLinear()
      .domain(d3.extent(bars, (b) => b.c) as [number, number])
      .range([navTop + NAV_H - 2, navTop + 4]);

    const gridG = root.append("g").attr("class", "gridlines");
    const yAxisG = root
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${innerW},0)`);
    const xAxisG = root.append("g").attr("class", "axis").attr("transform", `translate(0,${axisY})`);

    const plot = root.append("g").attr("clip-path", `url(#${clipId})`);
    const bandG = plot.append("g");
    const volG = plot.append("g");
    const priceG = plot.append("g");
    const overlayG = plot.append("g");
    const lastG = root.append("g");
    const crossG = root.append("g").style("pointer-events", "none").style("display", "none");

    // the strip at the bottom with the brush
    const navG = root.append("g");
    navG
      .append("rect")
      .attr("x", 0)
      .attr("y", navTop)
      .attr("width", innerW)
      .attr("height", NAV_H)
      .attr("rx", 4)
      .style("fill", "var(--surface-2)");
    navG
      .append("path")
      .datum(bars)
      .attr(
        "d",
        d3
          .area<Bar>()
          .x((_, i) => xNav(i))
          .y0(navTop + NAV_H)
          .y1((b) => yNav(b.c))
          .curve(d3.curveMonotoneX),
      )
      .style("fill", "var(--accent)")
      .style("fill-opacity", 0.12);
    navG
      .append("path")
      .datum(bars)
      .attr(
        "d",
        d3
          .line<Bar>()
          .x((_, i) => xNav(i))
          .y((b) => yNav(b.c))
          .curve(d3.curveMonotoneX),
      )
      .style("fill", "none")
      .style("stroke", "var(--accent)")
      .style("stroke-width", 1);

    const crossV = crossG.append("line").attr("y1", mainTop).attr("y2", axisY);
    const crossH = crossG.append("line").attr("x1", 0).attr("x2", innerW);
    crossG.selectAll("line").style("stroke", "var(--ink-2)").style("stroke-width", 1).style("stroke-dasharray", "3 3");
    const priceTag = crossG.append("g");
    priceTag.append("rect").attr("width", M.right - 4).attr("height", 18).attr("rx", 3).style("fill", "var(--ink)");
    const priceTagText = priceTag
      .append("text")
      .attr("x", 6)
      .attr("y", 13)
      .attr("class", "tabular")
      .style("fill", "var(--page)")
      .style("font", "500 10.5px var(--font-mono)");
    const dateTag = crossG.append("g");
    dateTag.append("rect").attr("width", 92).attr("height", 18).attr("rx", 3).style("fill", "var(--ink)");
    const dateTagText = dateTag
      .append("text")
      .attr("x", 46)
      .attr("y", 13)
      .attr("text-anchor", "middle")
      .style("fill", "var(--page)")
      .style("font", "500 10.5px var(--font-mono)");

    let x = x0.copy();
    let hoverIndex: number | null = null;

    function dateTicks(lo: number, hi: number): number[] {
      const span = bars[Math.min(n - 1, Math.floor(hi))].t - bars[Math.max(0, Math.ceil(lo))].t;
      const day = 86_400_000;
      const unit: (d: Date) => number =
        span > 3 * 365 * day
          ? (d) => d.getUTCFullYear()
          : span > 120 * day
            ? (d) => d.getUTCFullYear() * 12 + d.getUTCMonth()
            : (d) => Math.floor(d.getTime() / (7 * day));
      const out: number[] = [];
      for (let i = Math.max(1, Math.ceil(lo)); i <= Math.min(n - 1, Math.floor(hi)); i++) {
        if (unit(new Date(bars[i].t)) !== unit(new Date(bars[i - 1].t))) out.push(i);
      }
      const maxTicks = Math.max(2, Math.floor(innerW / 80));
      const step = Math.ceil(out.length / maxTicks);
      return out.filter((_, k) => k % step === 0);
    }

    function tickLabel(i: number, lo: number, hi: number): string {
      const span = bars[Math.min(n - 1, Math.floor(hi))].t - bars[Math.max(0, Math.ceil(lo))].t;
      const d = new Date(bars[i].t);
      if (span > 3 * 365 * 86_400_000) return d3.utcFormat("%Y")(d);
      if (span > 120 * 86_400_000) return d.getUTCMonth() === 0 ? d3.utcFormat("%Y")(d) : d3.utcFormat("%b")(d);
      return d3.utcFormat("%d %b")(d);
    }

    function draw() {
      const { overlays: ov, kind: k } = propsRef.current;
      const [lo, hi] = x.domain();
      const i0 = Math.max(0, Math.floor(lo));
      const i1 = Math.min(n - 1, Math.ceil(hi));
      const visible = d3.range(i0, i1 + 1);

      let yMin = d3.min(visible, (i) => (k === "candles" ? bars[i].l : bars[i].c))!;
      let yMax = d3.max(visible, (i) => (k === "candles" ? bars[i].h : bars[i].c))!;
      if (log) yMin = Math.max(yMin, 1e-6);
      if (ov.bands) {
        for (const i of visible) {
          const b = ov.bands[i];
          if (b) {
            yMin = Math.min(yMin, b.lower);
            yMax = Math.max(yMax, b.upper);
          }
        }
      }
      let yTicks: number[];
      if (log) {
        y.domain([yMin / 1.04, yMax * 1.04]);
        // only keep the 1, 2 and 5 log ticks so the axis isn't crowded
        const lead = (v: number) => Number(v.toExponential(0)[0]);
        let picked = y.ticks(8).filter((v) => [1, 2, 5].includes(lead(v)));
        if (picked.length < 3) picked = y.ticks(8);
        const stride = Math.ceil(picked.length / 7);
        yTicks = picked.filter((_, i) => i % stride === 0);
      } else {
        const pad = (yMax - yMin) * 0.08 || yMax * 0.01;
        y.domain([yMin >= 0 ? Math.max(0, yMin - pad) : yMin - pad, yMax + pad]).nice(6);
        yTicks = y.ticks(6);
      }

      gridG.call(
        d3
          .axisRight(y)
          .tickValues(yTicks)
          .tickSize(innerW)
          .tickFormat(() => ""),
      );
      yAxisG.call(
        d3
          .axisRight(y)
          .tickValues(yTicks)
          .tickSize(0)
          .tickPadding(8)
          .tickFormat((v) => formatPrice(v as number, decimals)),
      );
      yAxisG.select(".domain").remove();

      const ticks = dateTicks(lo, hi);
      xAxisG.call(
        d3
          .axisBottom(x)
          .tickValues(ticks)
          .tickSize(4)
          .tickPadding(5)
          .tickFormat((i) => tickLabel(i as number, lo, hi)),
      );
      xAxisG.select(".domain").style("stroke", "var(--axis)");

      const step = Math.abs(x(1) - x(0));
      const bodyW = Math.max(1, Math.min(14, step * 0.7));
      // too thin to read as candles, so we draw a line
      const asCandles = k === "candles" && step >= 2.5;
      const data = visible.map((i) => ({ i, b: bars[i] }));

      bandG.selectAll("*").remove();
      if (ov.bands) {
        const pts = visible.filter((i) => ov.bands![i]);
        bandG
          .append("path")
          .datum(pts)
          .attr(
            "d",
            d3
              .area<number>()
              .x((i) => x(i))
              .y0((i) => y(ov.bands![i]!.lower))
              .y1((i) => y(ov.bands![i]!.upper)),
          )
          .style("fill", "var(--ink)")
          .style("fill-opacity", 0.05);
        for (const edge of ["upper", "lower"] as const) {
          bandG
            .append("path")
            .datum(pts)
            .attr(
              "d",
              d3
                .line<number>()
                .x((i) => x(i))
                .y((i) => y(ov.bands![i]![edge])),
            )
            .style("fill", "none")
            .style("stroke", "var(--muted)")
            .style("stroke-width", 1);
        }
      }

      volG.selectAll("*").remove();
      if (hasVolume) {
        yVol.domain([0, d3.max(visible, (i) => bars[i].v ?? 0) || 1]);
        volG
          .selectAll("rect")
          .data(data)
          .join("rect")
          .attr("x", (d) => x(d.i) - bodyW / 2)
          .attr("width", bodyW)
          .attr("y", (d) => yVol(d.b.v ?? 0))
          .attr("height", (d) => Math.max(0, yVol(0) - yVol(d.b.v ?? 0)))
          .style("fill", (d) => (d.b.c >= d.b.o ? "var(--up)" : "var(--down)"))
          .style("fill-opacity", 0.35);
      }

      priceG.selectAll("*").remove();
      if (asCandles) {
        const g = priceG.selectAll("g").data(data).join("g");
        g.append("line")
          .attr("x1", (d) => x(d.i))
          .attr("x2", (d) => x(d.i))
          .attr("y1", (d) => y(d.b.h))
          .attr("y2", (d) => y(d.b.l))
          .style("stroke", (d) => (d.b.c >= d.b.o ? "var(--up)" : "var(--down)"))
          .style("stroke-width", 1);
        g.append("rect")
          .attr("x", (d) => x(d.i) - bodyW / 2)
          .attr("width", bodyW)
          .attr("y", (d) => y(Math.max(d.b.o, d.b.c)))
          .attr("height", (d) => Math.max(1, Math.abs(y(d.b.o) - y(d.b.c))))
          .attr("rx", bodyW > 6 ? 1 : 0)
          .style("fill", (d) => (d.b.c >= d.b.o ? "var(--up)" : "var(--down)"));
      } else {
        if (k === "area") {
          priceG
            .append("path")
            .datum(visible)
            .attr(
              "d",
              d3
                .area<number>()
                .x((i) => x(i))
                .y0(mainTop + mainH)
                .y1((i) => y(bars[i].c)),
            )
            .style("fill", "var(--accent)")
            .style("fill-opacity", 0.1);
        }
        priceG
          .append("path")
          .datum(visible)
          .attr(
            "d",
            d3
              .line<number>()
              .x((i) => x(i))
              .y((i) => y(bars[i].c)),
          )
          .style("fill", "none")
          .style("stroke", "var(--accent)")
          .style("stroke-width", 2)
          .style("stroke-linejoin", "round")
          .style("stroke-linecap", "round");
      }

      overlayG.selectAll("*").remove();
      const maLine = (values: (number | null)[], color: string) => {
        overlayG
          .append("path")
          .datum(visible.filter((i) => values[i] !== null))
          .attr(
            "d",
            d3
              .line<number>()
              .x((i) => x(i))
              .y((i) => y(values[i]!)),
          )
          .style("fill", "none")
          .style("stroke", color)
          .style("stroke-width", 1.5);
      };
      if (ov.sma20) maLine(ov.sma20, "var(--series-2)");
      if (ov.sma50) maLine(ov.sma50, "var(--series-5)");

      lastG.selectAll("*").remove();
      const last = bars[n - 1];
      const ly = y(last.c);
      if (ly >= mainTop && ly <= mainTop + mainH) {
        const up = last.c >= (bars[n - 2]?.c ?? last.c);
        lastG
          .append("line")
          .attr("x1", 0)
          .attr("x2", innerW)
          .attr("y1", ly)
          .attr("y2", ly)
          .style("stroke", up ? "var(--up)" : "var(--down)")
          .style("stroke-width", 1)
          .style("stroke-opacity", 0.6);
        const tag = lastG.append("g").attr("transform", `translate(${innerW + 2},${ly - 9})`);
        tag.append("rect").attr("width", M.right - 4).attr("height", 18).attr("rx", 3).style("fill", up ? "var(--up)" : "var(--down)");
        tag
          .append("text")
          .attr("x", 6)
          .attr("y", 13)
          .text(formatPrice(last.c, decimals))
          .style("fill", "#fff")
          .style("font", "600 10.5px var(--font-mono)");
      }

      if (hoverIndex !== null) placeCrosshair(hoverIndex, null);
    }

    function placeCrosshair(i: number, pointerY: number | null) {
      const cx = x(i);
      if (cx < 0 || cx > innerW) {
        crossG.style("display", "none");
        return;
      }
      crossG.style("display", null);
      crossV.attr("x1", cx).attr("x2", cx);
      const py = pointerY ?? y(bars[i].c);
      const inMain = py >= mainTop && py <= mainTop + mainH;
      crossH.style("display", inMain ? "" : "none").attr("y1", py).attr("y2", py);
      priceTag.style("display", inMain ? "" : "none").attr("transform", `translate(${innerW + 2},${py - 9})`);
      priceTagText.text(formatPrice(y.invert(py), decimals));
      const tx = Math.max(0, Math.min(innerW - 92, cx - 46));
      dateTag.attr("transform", `translate(${tx},${axisY + 2})`);
      dateTagText.text(formatDay(bars[i].t));
    }

    function setHover(i: number | null, pointerY: number | null = null) {
      hoverIndex = i;
      if (i === null) crossG.style("display", "none");
      else placeCrosshair(i, pointerY);
      propsRef.current.onHover(i);
    }

    // zoom and brush update each other, these flags stop the loop
    let fromBrush = false;
    let syncingBrush = false;
    const minBars = Math.min(n, 12);
    const zoom = d3
      .zoom<SVGRectElement, unknown>()
      // a plain scroll scrolls the page, only ctrl + scroll or a pinch zooms
      .filter((event: Event) =>
        event.type === "wheel"
          ? (event as WheelEvent).ctrlKey || (event as WheelEvent).metaKey
          : !(event as MouseEvent).button,
      )
      .scaleExtent([1, n / minBars])
      .translateExtent([
        [0, 0],
        [innerW, 0],
      ])
      .extent([
        [0, 0],
        [innerW, 0],
      ])
      .on("zoom", (event: d3.D3ZoomEvent<SVGRectElement, unknown>) => {
        x = event.transform.rescaleX(x0);
        const [a, b] = x.domain();
        viewRef.current = { key: viewKey, domain: [a, b] };
        draw();
        if (!fromBrush) {
          syncingBrush = true;
          brushG.call(brush.move, [xNav(a), xNav(b)]);
          syncingBrush = false;
        }
        propsRef.current.onView(Math.max(0, Math.round(a + 0.5)), Math.min(n - 1, Math.round(b - 0.5)));
      });

    const brush = d3
      .brushX<unknown>()
      .extent([
        [0, navTop],
        [innerW, navTop + NAV_H],
      ])
      .on("brush end", (event: d3.D3BrushEvent<unknown>) => {
        if (syncingBrush || !event.selection) return;
        const [s0, s1] = event.selection as [number, number];
        const a = xNav.invert(s0);
        const b = xNav.invert(s1);
        if (b - a < minBars - 1) return;
        const k = innerW / (x0(b) - x0(a));
        fromBrush = true;
        zoomRect.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-x0(a), 0));
        fromBrush = false;
      });

    const brushG = root.append("g").attr("class", "nav-brush").call(brush);
    brushG.select(".selection").style("fill", "var(--accent)").style("fill-opacity", 0.14).style("stroke", "var(--accent)").attr("rx", 4);
    brushG.selectAll(".handle").style("fill", "var(--accent)").attr("rx", 2);

    const zoomRect = root
      .append("rect")
      .attr("x", 0)
      .attr("y", mainTop)
      .attr("width", innerW)
      .attr("height", axisY - mainTop)
      .attr("tabindex", 0)
      .attr("role", "img")
      .attr("aria-label", "Price chart. Use arrow keys to move between bars, plus and minus to zoom.")
      .style("fill", "transparent")
      .style("cursor", "crosshair")
      .style("touch-action", "pan-y")
      .style("outline", "none")
      .call(zoom)
      .on("pointermove", (event: PointerEvent) => {
        const [mx, my] = d3.pointer(event);
        const i = Math.max(0, Math.min(n - 1, Math.round(x.invert(mx))));
        setHover(i, my);
      })
      .on("pointerleave", () => setHover(null))
      .on("wheel.hint", (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) propsRef.current.onWheelHint?.();
      })
      .on("keydown", (event: KeyboardEvent) => {
        const [lo, hi] = x.domain();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const start = hoverIndex ?? Math.min(n - 1, Math.floor(hi));
          const next = Math.max(Math.ceil(lo), Math.min(Math.floor(hi), start + (event.key === "ArrowRight" ? 1 : -1)));
          setHover(next);
        } else if (event.key === "+" || event.key === "=" || event.key === "-") {
          event.preventDefault();
          zoomRect.transition().duration(200).call(zoom.scaleBy, event.key === "-" ? 0.75 : 1.33);
        } else if (event.key === "Escape") {
          setHover(null);
        }
      })
      .on("blur", () => setHover(null));

    // reuse the saved zoom if it's the same view, clamped so it can't point past the end
    const saved = viewRef.current?.key === viewKey ? viewRef.current.domain : null;
    const a = Math.max(-0.5, Math.min(saved?.[0] ?? initialStart - 0.5, n - minBars - 0.5));
    const b = Math.max(a + minBars, Math.min(saved?.[1] ?? n - 0.5, n - 0.5));
    const k = innerW / (x0(b) - x0(a));
    zoomRect.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-x0(a), 0));

    return () => {
      svg.on(".zoom", null);
    };
    // overlays and kind are here so their layers get redrawn
  }, [bars, width, initialStart, viewKey, kind, log, overlays, hasVolume, decimals, mainH]);

  return (
    <div
      ref={wrapRef}
      className="relative w-full transition-opacity duration-300"
      style={{ opacity: props.dimmed ? 0.55 : 1 }}
    >
      <svg ref={svgRef} width={width} height={height} className="block select-none" />
    </div>
  );
}

