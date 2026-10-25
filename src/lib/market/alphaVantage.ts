// Alpha Vantage request building and response parsing

import { ProviderError } from "./errors.ts";
import type { Instrument } from "./instruments.ts";
import type { Bar, Interval } from "./types.ts";

const BASE_URL = "https://www.alphavantage.co/query";

export function buildAlphaVantageUrl(inst: Instrument, interval: Interval, apiKey: string): string {
  const params = new URLSearchParams({ apikey: apiKey });
  if (inst.kind === "stock") {
    params.set("function", interval === "daily" ? "TIME_SERIES_DAILY" : "TIME_SERIES_WEEKLY_ADJUSTED");
    params.set("symbol", inst.id);
  } else {
    params.set("function", interval === "daily" ? "FX_DAILY" : "FX_WEEKLY");
    params.set("from_symbol", inst.base!);
    params.set("to_symbol", inst.quote!);
  }
  return `${BASE_URL}?${params}`;
}

export interface ParsedSeries {
  bars: Bar[];
  lastRefreshed: string;
}

/**
 * Alpha Vantage answers HTTP 200 even when it refuses a request; the refusal
 * is an "Information" or "Note" string in place of the data so we are going to  Classify those
 * so they are never cached as if they were data with might be misleading.
 */
export function parseAlphaVantageSeries(json: unknown): ParsedSeries {
  if (!json || typeof json !== "object") {
    throw new ProviderError("bad_response", "Alpha Vantage returned a non-object body");
  }
  const body = json as Record<string, unknown>;

  const raw = body["Information"] ?? body["Note"];
  if (typeof raw === "string") {
    // Quota messages quote the caller's API key back; keep it out of logs.
    const refusal = raw.replace(/API key as \S+/i, "API key as [redacted]");
    if (/premium endpoint/i.test(refusal)) throw new ProviderError("premium", refusal);
    throw new ProviderError("rate_limited", refusal);
  }
  if (typeof body["Error Message"] === "string") {
    throw new ProviderError("bad_symbol", body["Error Message"] as string);
  }

  const seriesKey = Object.keys(body).find((k) => k.includes("Time Series"));
  const meta = body["Meta Data"] as Record<string, string> | undefined;
  if (!seriesKey || !meta) {
    throw new ProviderError("bad_response", "Alpha Vantage response has no time series");
  }

  const rows = body[seriesKey] as Record<string, Record<string, string>>;
  const bars: Bar[] = [];
  for (const [date, row] of Object.entries(rows)) {
    const close = Number(row["4. close"]);
    const adjusted = row["5. adjusted close"];
    const k = adjusted === undefined ? 1 : Number(adjusted) / close;
    const volume = row["6. volume"] ?? row["5. volume"];
    const bar: Bar = {
      t: Date.parse(`${date}T00:00:00Z`),
      o: Number(row["1. open"]) * k,
      h: Number(row["2. high"]) * k,
      l: Number(row["3. low"]) * k,
      c: close * k,
      v: volume === undefined ? null : Math.round(Number(volume) / k),
    };
    if ([bar.t, bar.o, bar.h, bar.l, bar.c].every(Number.isFinite)) bars.push(bar);
  }
  // The API lists newest first; charts want oldest first so we sort it ourselves here . 
  bars.sort((a, b) => a.t - b.t);

  const refreshedKey = Object.keys(meta).find((k) => k.includes("Last Refreshed"));
  const lastRefreshed = refreshedKey ? meta[refreshedKey].slice(0, 10) : "";

  return { bars, lastRefreshed };
}