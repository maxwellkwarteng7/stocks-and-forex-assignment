import type { Bar, Interval } from "./types.ts";

export const RANGES = ["1M", "3M", "6M", "1Y", "5Y", "MAX"] as const;

export type RangeKey = (typeof RANGES)[number];

const DAY = 86_400_000;

const RANGE_DAYS: Record<Exclude<RangeKey, "MAX">, number> = {
  "1M": 31,
  "3M": 92,
  "6M": 183,
  "1Y": 366,
  "5Y": 5 * 366,
};


export function intervalFor(range: RangeKey): Interval {
  return range === "1M" || range === "3M" ? "daily" : "weekly";
}

export function periodsPerYear(interval: Interval): number {
  return interval === "daily" ? 252 : 52;
}

export function rangeStart(range: RangeKey, lastT: number): number {
  return range === "MAX" ? Number.NEGATIVE_INFINITY : lastT - RANGE_DAYS[range] * DAY;
}

export function sliceRange(bars: readonly Bar[], range: RangeKey): Bar[] {
  if (bars.length === 0) return [];
  const from = rangeStart(range, bars[bars.length - 1].t);
  return bars.filter((b) => b.t >= from);
}

export function isRangeKey(value: string | null | undefined): value is RangeKey {
  return (RANGES as readonly string[]).includes(value ?? "");
}