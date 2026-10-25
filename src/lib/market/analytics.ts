

import type { Bar } from "./types.ts";

// running sum so we don't re-add the whole window every time
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// ema weights recent prices more, we seed it with the sma of the first window
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface Band {
  mid: number;
  upper: number;
  lower: number;
}

// the sma with a band k standard deviations either side
export function bollinger(values: readonly number[], period = 20, k = 2): (Band | null)[] {
  const mids = sma(values, period);
  return mids.map((mid, i) => {
    if (mid === null) return null;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mid) ** 2;
    const sd = Math.sqrt(variance / period);
    return { mid, upper: mid + k * sd, lower: mid - k * sd };
  });
}

// one item shorter than the input
export function returns(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) out.push(values[i] / values[i - 1] - 1);
  return out;
}

//1 = move together, -1 = move opposite, 0 = no relationship.
export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return Number.NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va === 0 || vb === 0 ? Number.NaN : cov / Math.sqrt(va * vb);
}

export function correlationMatrix(series: readonly (readonly Bar[])[]): number[][] {
  const dateSets = series.map((bars) => new Set(bars.map((b) => b.t)));
  const shared = series[0]?.map((b) => b.t).filter((t) => dateSets.every((s) => s.has(t))) ?? [];
  const closesOnShared = series.map((bars) => {
    const byT = new Map(bars.map((b) => [b.t, b.c]));
    return shared.map((t) => byT.get(t)!);
  });
  const rets = closesOnShared.map(returns);
  return rets.map((a, i) => rets.map((b, j) => (i === j ? 1 : pearson(a, b))));
}

// % change from a start date so different instruments can share one chart
export function rebase(bars: readonly Bar[], fromT: number): { t: number; pct: number }[] {
  const start = bars.findIndex((b) => b.t >= fromT);
  if (start === -1) return [];
  const base = bars[start].c;
  return bars.slice(start).map((b) => ({ t: b.t, pct: (b.c / base - 1) * 100 }));
}

export interface RangeStats {
  first: number;
  last: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volatilityPct: number;
}

export function rangeStats(bars: readonly Bar[], periodsPerYear: number): RangeStats | null {
  if (bars.length < 2) return null;
  const closes = bars.map((b) => b.c);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const r = returns(closes);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, r.length - 1));
  return {
    first,
    last,
    change: last - first,
    changePct: (last / first - 1) * 100,
    high: Math.max(...bars.map((b) => b.h)),
    low: Math.min(...bars.map((b) => b.l)),
    // daily volatility x √252 trading days gives the yearly number
    volatilityPct: sd * Math.sqrt(periodsPerYear) * 100,
  };
}
