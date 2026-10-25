// every Alpha Vantage request goes through here so we stay inside the free tier:


import { ProviderError } from "@/lib/market/errors";

const MIN_SPACING_MS = 1_200;
const PER_MINUTE = 5;
const PER_DAY = 25;

const reserved: number[] = []; // slot times booked in the last minute
let lastSlot = 0;
let day = "";
let usedToday = 0;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// reset the daily counter when the date changes
function rollDay(now: number) {
  const today = utcDay(now);
  if (today !== day) {
    day = today;
    usedToday = 0;
  }
}

export async function scheduleAlphaVantage<T>(task: () => Promise<T>, maxWaitMs: number): Promise<T> {
  const now = Date.now();
  rollDay(now);
  if (usedToday >= PER_DAY) {
    throw new ProviderError("quota_exhausted", "Alpha Vantage daily quota used");
  }

  // find the earliest slot we're allowed
  while (reserved.length && reserved[0] <= now - 60_000) reserved.shift();
  let slot = Math.max(now, lastSlot + MIN_SPACING_MS);
  if (reserved.length >= PER_MINUTE) {
    slot = Math.max(slot, reserved[reserved.length - PER_MINUTE] + 60_000);
  }
  if (slot - now > maxWaitMs) {
    throw new ProviderError("throttled", `Next Alpha Vantage slot is ${Math.ceil((slot - now) / 1000)}s away`);
  }

  reserved.push(slot);
  lastSlot = slot;
  usedToday++;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return task();
}

export interface AlphaVantageBudget {
  usedToday: number;
  limitPerDay: number;
}

// what the Data popover shows "this server has made X of 25 requests today"
export function alphaVantageBudget(): AlphaVantageBudget {
  rollDay(Date.now());
  return { usedToday, limitPerDay: PER_DAY };
}

