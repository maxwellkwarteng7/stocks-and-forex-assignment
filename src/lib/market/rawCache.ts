// a small cache on disk (.cache/av) for raw Alpha Vantage responses,we only use that  in development.
// next dev wipes its memory cache every time we save a file, without this we'd burn through the 25 requests a day in one afternoon of coding. the snapshot script reuses it too so we don't burn it out .. this is a design decision . 

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), ".cache", "av");

interface Entry {
  savedAt: number;
  body: unknown;
}

const file = (key: string) => path.join(DIR, `${key.replace(/[^\w.-]/g, "_")}.json`);

// returns the saved response if it's younger than maxAgeMs, otherwise null
export async function readRaw(key: string, maxAgeMs: number): Promise<Entry | null> {
  try {
    const entry = JSON.parse(await readFile(file(key), "utf8")) as Entry;
    return Date.now() - entry.savedAt <= maxAgeMs ? entry : null;
  } catch {
    return null;
  }
}

export async function writeRaw(key: string, body: unknown): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(file(key), JSON.stringify({ savedAt: Date.now(), body } satisfies Entry));
}
