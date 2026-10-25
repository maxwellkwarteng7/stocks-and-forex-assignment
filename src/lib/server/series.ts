// price history. we try the shared cache, then the disk cache in dev, then Alpha Vantage,
// and if all that fails we use the bundled snapshot. failures throw so a rate limit
// message never gets cached as if it was data

import { cacheLife, cacheTag } from "next/cache";
import { loadSnapshotFile } from "@/data/snapshot";
import { buildAlphaVantageUrl, parseAlphaVantageSeries } from "@/lib/market/alphaVantage";
import { errorCode, ProviderError } from "@/lib/market/errors";
import { getInstrument, INSTRUMENTS } from "@/lib/market/instruments";
import { readRaw, writeRaw } from "@/lib/market/rawCache";
import { decodeSnapshot } from "@/lib/market/snapshotCodec";
import type { Interval, ProviderErrorCode, Series, SeriesPayload } from "@/lib/market/types";
import { scheduleAlphaVantage } from "./alphaVantageQueue";

const HOUR = 3_600;
const DEV_DISK_TTL_MS = 12 * HOUR * 1000;
// how long a page request can wait for a queue slot before we just use the snapshot
const MAX_QUEUE_WAIT_MS = 6_000;

// errors lose their class coming out of 'use cache', so we note the reason here
const lastFailure = new Map<string, ProviderErrorCode>();

async function fetchFromAlphaVantage(id: string, interval: Interval): Promise<Series> {
  "use cache: remote";
  // 10 series every 12h is 20 requests a day, under the 25 limit
  cacheLife(
    interval === "daily"
      ? { stale: 300, revalidate: 12 * HOUR, expire: 7 * 24 * HOUR }
      : { stale: 300, revalidate: 24 * HOUR, expire: 14 * 24 * HOUR },
  );
  cacheTag("alpha-vantage", `series:${id}`);

  const inst = getInstrument(id);
  if (!inst) throw new ProviderError("bad_symbol", `Unknown instrument ${id}`);
  const key = `${id}.${interval}`;

  if (process.env.NODE_ENV === "development") {
    const hit = await readRaw(key, DEV_DISK_TTL_MS);
    if (hit) return { id, interval, fetchedAt: hit.savedAt, ...parseAlphaVantageSeries(hit.body) };
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY!; // getSeries already checked it exists

  try {
    const body = await scheduleAlphaVantage(async () => {
      const res = await fetch(buildAlphaVantageUrl(inst, interval, apiKey), { cache: "no-store" });
      if (!res.ok) throw new ProviderError("network", `Alpha Vantage answered HTTP ${res.status}`);
      return res.json();
    }, MAX_QUEUE_WAIT_MS);

    const parsed = parseAlphaVantageSeries(body);
    if (process.env.NODE_ENV === "development") await writeRaw(key, body);
    lastFailure.delete(key);
    return { id, interval, fetchedAt: Date.now(), ...parsed };
  } catch (err) {
    lastFailure.set(key, errorCode(err));
    throw err;
  }
}

export async function getSeries(id: string, interval: Interval): Promise<SeriesPayload> {
  const key = `${id}.${interval}`;
  try {
    // no key, straight to the snapshot
    if (!process.env.ALPHA_VANTAGE_API_KEY) {
      throw new ProviderError("missing_key", "ALPHA_VANTAGE_API_KEY is not set");
    }
    const series = await fetchFromAlphaVantage(id, interval);
    return { ...series, source: "provider", ageSeconds: ageOf(series) };
  } catch (err) {
    const file = await loadSnapshotFile(key);
    if (!file) throw err;
    const series = decodeSnapshot(file);
    const notice = err instanceof ProviderError ? err.code : (lastFailure.get(key) ?? errorCode(err));
    return { ...series, source: "snapshot", ageSeconds: ageOf(series), notice };
  }
}

export async function getBoard(): Promise<SeriesPayload[]> {
  return Promise.all(INSTRUMENTS.map((inst) => getSeries(inst.id, "daily")));
}

function ageOf(series: Series): number {
  return Math.max(0, Math.round((Date.now() - series.fetchedAt) / 1000));
}
