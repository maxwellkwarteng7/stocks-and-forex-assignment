// live prices and profiles from Finnhub. 6 stocks every 15s is 24 a minute, the limit is 60.
// we poll instead of the websocket because the websocket would put the key in the browser

import { cacheLife, cacheTag } from "next/cache";
import { errorCode, ProviderError } from "@/lib/market/errors";
import {
  buildFinnhubUrl,
  classifyFinnhubStatus,
  parseFinnhubProfile,
  parseFinnhubQuote,
} from "@/lib/market/finnhub";
import { STOCKS } from "@/lib/market/instruments";
import type { CompanyProfile, ProviderErrorCode, Quote, QuotesPayload } from "@/lib/market/types";

async function finnhubJson(path: "quote" | "stock/profile2", symbol: string): Promise<unknown> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new ProviderError("missing_key", "FINNHUB_API_KEY is not set");
  const res = await fetch(buildFinnhubUrl(path, symbol, token), { cache: "no-store" });
  const failure = classifyFinnhubStatus(res.status, res.ok ? "" : await res.text());
  if (failure) throw failure;
  return res.json();
}

// same as series.ts, errors lose their class coming out of 'use cache'
let lastFailure: ProviderErrorCode | undefined;
// if a refresh fails we keep showing the last real price, marked stale
const lastGood = new Map<string, Quote>();

async function fetchQuote(id: string): Promise<Quote> {
  "use cache";
  // shared for 15s so every visitor costs one call per stock
  cacheLife({ stale: 10, revalidate: 15, expire: 60 });
  cacheTag("finnhub", `quote:${id}`);
  try {
    return parseFinnhubQuote(id, await finnhubJson("quote", id));
  } catch (err) {
    lastFailure = errorCode(err);
    throw err;
  }
}

// profiles barely change
async function fetchProfile(id: string): Promise<CompanyProfile> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("finnhub", `profile:${id}`);
  return parseFinnhubProfile(id, await finnhubJson("stock/profile2", id));
}

export async function getQuotes(): Promise<QuotesPayload> {
  if (!process.env.FINNHUB_API_KEY) {
    return { quotes: {}, source: "unavailable", notice: "missing_key", fetchedAt: Date.now() };
  }
  // so one refused stock doesn't fail the rest
  const settled = await Promise.allSettled(STOCKS.map((s) => fetchQuote(s.id)));
  const quotes: Record<string, Quote> = {};
  let failed = false;
  let stale = false;
  settled.forEach((result, i) => {
    const id = STOCKS[i].id;
    if (result.status === "fulfilled") {
      quotes[id] = result.value;
      lastGood.set(id, result.value);
    } else {
      failed = true;
      const previous = lastGood.get(id);
      if (previous) {
        quotes[id] = previous;
        stale = true;
      }
    }
  });
  const any = Object.keys(quotes).length > 0;
  return {
    quotes,
    source: any ? "provider" : "unavailable",
    notice: failed ? (lastFailure ?? "network") : undefined,
    stale: stale || undefined,
    fetchedAt: Date.now(),
  };
}

export async function getProfile(id: string): Promise<CompanyProfile | null> {
  try {
    return await fetchProfile(id);
  } catch {
    return null;
  }
}
