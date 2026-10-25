// refreshes the bundled snapshot, run it with `npm run snapshot`.
// one request every 13s because the free tier allows 5 a minute.
// if we hit the daily limit we keep the old files and run it again tomorrow

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAlphaVantageUrl, parseAlphaVantageSeries } from "../src/lib/market/alphaVantage.ts";
import { ProviderError } from "../src/lib/market/errors.ts";
import { INSTRUMENTS } from "../src/lib/market/instruments.ts";
import { readRaw, writeRaw } from "../src/lib/market/rawCache.ts";
import { encodeSnapshot } from "../src/lib/market/snapshotCodec.ts";
import type { Interval } from "../src/lib/market/types.ts";

const OUT_DIR = path.join(process.cwd(), "src", "data", "snapshot");
const SPACING_MS = 13_000;
const REUSE_MS = 20 * 3_600_000;

function readApiKey(): string {
  if (process.env.ALPHA_VANTAGE_API_KEY) return process.env.ALPHA_VANTAGE_API_KEY;
  try {
    const line = readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("ALPHA_VANTAGE_API_KEY="));
    if (line) return line.slice(line.indexOf("=") + 1).trim();
  } catch {}
  throw new Error("Set ALPHA_VANTAGE_API_KEY in .env.local first.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apiKey = readApiKey();
  await mkdir(OUT_DIR, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  let lastRequestAt = 0;
  let quotaHit = false;

  for (const inst of INSTRUMENTS) {
    for (const interval of ["daily", "weekly"] as Interval[]) {
      const key = `${inst.id}.${interval}`;
      let entry = await readRaw(key, REUSE_MS);

      if (!entry && !quotaHit) {
        await sleep(Math.max(0, lastRequestAt + SPACING_MS - Date.now()));
        lastRequestAt = Date.now();
        const body = await (await fetch(buildAlphaVantageUrl(inst, interval, apiKey))).json();
        try {
          parseAlphaVantageSeries(body); // make sure it is real data before we cache it
          await writeRaw(key, body);
          entry = { savedAt: Date.now(), body };
        } catch (err) {
          if (!(err instanceof ProviderError && err.code === "rate_limited")) throw err;
          console.error(`✗ ${key}: ${err.message}`);
          quotaHit = true;
        }
      }
      if (!entry) {
        skipped.push(key);
        continue;
      }

      const parsed = parseAlphaVantageSeries(entry.body);
      const file = encodeSnapshot({ id: inst.id, interval, fetchedAt: entry.savedAt, ...parsed });
      await writeFile(path.join(OUT_DIR, `${key}.json`), JSON.stringify(file));
      written.push(key);
      console.log(`✓ ${key.padEnd(16)} ${parsed.bars.length} bars, last ${parsed.lastRefreshed}`);
    }
  }

  console.log(`\n${written.length}/${INSTRUMENTS.length * 2} snapshot files written to ${OUT_DIR}`);
  if (skipped.length) {
    console.log(`Quota reached; kept previous files for: ${skipped.join(", ")}. Re-run later.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
