// Finnhub url building and parsing

import { ProviderError } from "./errors.ts";
import type { CompanyProfile, Quote } from "./types.ts";

const BASE_URL = "https://finnhub.io/api/v1";

export function buildFinnhubUrl(path: "quote" | "stock/profile2", symbol: string, token: string) {
  return `${BASE_URL}/${path}?${new URLSearchParams({ symbol, token })}`;
}

// unlike Alpha Vantage, Finnhub uses real http status codes so we map them straight to our error codes
export function classifyFinnhubStatus(status: number, body: string): ProviderError | null {
  if (status === 200) return null;
  if (status === 429) return new ProviderError("rate_limited", "Finnhub rate limit reached");
  if (status === 401) return new ProviderError("missing_key", "Finnhub rejected the API key");
  if (status === 403) return new ProviderError("premium", `Finnhub: ${body.slice(0, 120)}`);
  return new ProviderError("network", `Finnhub answered HTTP ${status}`);
}

export function parseFinnhubQuote(id: string, json: unknown): Quote {
  const q = json as Record<string, number | null> | null;
  if (!q || typeof q.c !== "number" || (q.c === 0 && !q.t)) {
    throw new ProviderError("bad_symbol", `Finnhub has no quote for ${id}`);
  }
  return {
    id,
    price: q.c,
    change: q.d ?? 0,
    changePct: q.dp ?? 0,
    open: q.o ?? q.c,
    high: q.h ?? q.c,
    low: q.l ?? q.c,
    prevClose: q.pc ?? q.c,
    // finnhub sends seconds, we use milliseconds everywhere
    t: (q.t ?? 0) * 1000,
  };
}

export function parseFinnhubProfile(id: string, json: unknown): CompanyProfile {
  const p = json as Record<string, string | number | undefined> | null;
  if (!p || !p.name) throw new ProviderError("bad_symbol", `Finnhub has no profile for ${id}`);
  return {
    id,
    name: String(p.name),
    exchange: String(p.exchange ?? ""),
    industry: String(p.finnhubIndustry ?? ""),
    logo: p.logo ? String(p.logo) : null,
    marketCapMillions: typeof p.marketCapitalization === "number" ? p.marketCapitalization : null,
    weburl: p.weburl ? String(p.weburl) : null,
  };
}
