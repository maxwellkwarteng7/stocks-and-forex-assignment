import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bollinger, correlationMatrix, ema, pearson, rangeStats, rebase, returns, sma } from "./analytics.ts";
import { intervalFor, sliceRange } from "./ranges.ts";
import { fxSession, usEquitySession } from "./sessions.ts";
import type { Bar } from "./types.ts";

const DAY = 86_400_000;
const bars = (closes: number[], startT = Date.UTC(2026, 0, 1)): Bar[] =>
  closes.map((c, i) => ({ t: startT + i * DAY, o: c, h: c + 1, l: c - 1, c, v: null }));

const close = (a: number | null | undefined, b: number) =>
  assert.ok(a !== null && a !== undefined && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe("moving averages", () => {
  it("sma leaves the warm-up window empty", () => {
    assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  });

  it("ema seeds with the first window's mean, then weights recent values", () => {
    const out = ema([1, 2, 3, 4], 3);
    assert.deepEqual(out.slice(0, 2), [null, null]);
    close(out[2], 2);
    close(out[3], 4 * 0.5 + 2 * 0.5);
  });

  it("bollinger bands collapse onto the mean for a flat series", () => {
    const band = bollinger([5, 5, 5, 5], 3)[3]!;
    assert.deepEqual(band, { mid: 5, upper: 5, lower: 5 });
  });
});

describe("returns and correlation", () => {
  it("computes simple returns", () => {
    const r = returns([100, 110, 99]);
    close(r[0], 0.1);
    close(r[1], -0.1);
  });

  it("pearson is 1 for perfectly related series and -1 for opposite ones", () => {
    close(pearson([1, 2, 3], [2, 4, 6]), 1);
    close(pearson([1, 2, 3], [3, 2, 1]), -1);
    assert.ok(Number.isNaN(pearson([1, 1, 1], [1, 2, 3])));
  });

  it("aligns series on shared dates before correlating", () => {
    const a = bars([100, 101, 103, 102, 105]);
    // b skips day 2 (a holiday) and otherwise moves exactly with a
    const b = bars([10, 10.1, 10.3, 10.2, 10.5]).filter((_, i) => i !== 2);
    const m = correlationMatrix([a, b]);
    assert.equal(m[0][0], 1);
    close(m[0][1], 1);
    assert.equal(m[0][1], m[1][0]);
  });
});

describe("rebase and range stats", () => {
  it("rebases to percent change from the first bar in range", () => {
    const series = bars([50, 100, 150, 200]);
    const out = rebase(series, series[1].t);
    assert.deepEqual(out.map((p) => p.pct), [0, 50, 100]);
  });

  it("summarises a range", () => {
    const s = rangeStats(bars([100, 110, 121]), 252)!;
    close(s.changePct, 21);
    assert.equal(s.high, 122);
    assert.equal(s.low, 99);
    close(s.volatilityPct, 0); // constant 10% returns have no dispersion
  });
});

describe("ranges", () => {
  it("uses daily bars for short ranges and weekly beyond the 100-day free window", () => {
    assert.equal(intervalFor("3M"), "daily");
    assert.equal(intervalFor("6M"), "weekly");
  });

  it("slices from the latest bar, not from today", () => {
    const series = bars(Array.from({ length: 60 }, (_, i) => i + 1));
    const month = sliceRange(series, "1M");
    assert.equal(month.at(-1), series.at(-1));
    assert.equal(month.length, 32);
  });
});

describe("sessions", () => {
  // 2026-10-21 is a Wednesday; New York is UTC-4 in October.
  const at = (iso: string) => new Date(iso);

  it("knows US regular, pre- and after-hours", () => {
    assert.equal(usEquitySession(at("2026-10-21T14:00:00Z")).state, "open");
    assert.equal(usEquitySession(at("2026-10-21T12:00:00Z")).state, "pre");
    assert.equal(usEquitySession(at("2026-10-21T21:00:00Z")).state, "after");
    assert.equal(usEquitySession(at("2026-10-24T15:00:00Z")).state, "closed");
  });

  it("keeps FX open through the week and closed on Saturday", () => {
    assert.equal(fxSession(at("2026-10-21T03:00:00Z")).state, "open");
    assert.equal(fxSession(at("2026-10-24T15:00:00Z")).state, "closed");
  });
});
