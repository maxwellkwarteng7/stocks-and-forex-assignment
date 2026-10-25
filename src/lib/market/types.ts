
// stock or forex 
export type AssetClass = "stock" | "fx";

export type Interval = "daily" | "weekly";

/** The bar data template */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface Series {
  id: string;
  interval: Interval;
  bars: Bar[];
  lastRefreshed: string;
  fetchedAt: number;
}

/** The data source */
export type DataSource = "provider" | "snapshot";

export interface SeriesPayload extends Series {
  source: DataSource;
  ageSeconds: number;
  notice?: ProviderErrorCode;
}

export interface BoardPayload {
  series: SeriesPayload[];
  budget: { usedToday: number; limitPerDay: number };
}

export interface Quote {
  id: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  t: number;
}

export interface QuotesPayload {
  quotes: Record<string, Quote>;
  source: "provider" | "unavailable";
  notice?: ProviderErrorCode;
  stale?: boolean;
  fetchedAt: number;
}

export interface CompanyProfile {
  id: string;
  name: string;
  exchange: string;
  industry: string;
  logo: string | null;
  marketCapMillions: number | null;
  weburl: string | null;
}

export type ProviderErrorCode =
  | "missing_key"
  | "rate_limited"
  | "throttled"
  | "quota_exhausted"
  | "premium"
  | "bad_symbol"
  | "bad_response"
  | "network";