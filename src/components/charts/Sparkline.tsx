"use client";

import * as d3 from "d3";
import { useMemo } from "react";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  up: boolean;
}

export function Sparkline({ values, width = 72, height = 26, up }: Props) {
  const paths = useMemo(() => {
    if (values.length < 2) return null;
    const x = d3.scaleLinear().domain([0, values.length - 1]).range([1, width - 4]);
    const [lo, hi] = d3.extent(values) as [number, number];
    const y = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([height - 2, 3]);
    const line = d3.line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
    const area = d3.area<number>().x((_, i) => x(i)).y0(height).y1((v) => y(v)).curve(d3.curveMonotoneX);
    return {
      line: line(values)!,
      area: area(values)!,
      end: [x(values.length - 1), y(values[values.length - 1])] as const,
    };
  }, [values, width, height]);

  if (!paths) return <svg width={width} height={height} aria-hidden />;
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={paths.area} style={{ fill: color, fillOpacity: 0.08 }} />
      <path d={paths.line} style={{ fill: "none", stroke: color, strokeWidth: 1.5 }} strokeLinejoin="round" />
      <circle cx={paths.end[0]} cy={paths.end[1]} r={2.5} style={{ fill: color }} />
    </svg>
  );
}
