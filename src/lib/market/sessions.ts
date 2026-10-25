
// regular hours only, we don't track holidays so a holiday weekday will still say open

export type SessionState = "open" | "pre" | "after" | "closed";

export interface SessionStatus {
  state: SessionState;
  detail: string; // e.g. "Closes 16:00 ET"
}

interface NyClock {
  weekday: number; 
  minutes: number;
}

// we work out New York's time with Intl instead of doing timezone maths ourselves
function newYorkClock(now: Date): NyClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const PRE = 4 * 60;
const AFTER = 20 * 60;

export function usEquitySession(now: Date): SessionStatus {
  const { weekday, minutes } = newYorkClock(now);
  if (weekday === 0 || weekday === 6) return { state: "closed", detail: "Opens Mon 09:30 ET" };
  if (minutes >= OPEN && minutes < CLOSE) return { state: "open", detail: "Closes 16:00 ET" };
  if (minutes >= PRE && minutes < OPEN) return { state: "pre", detail: "Opens 09:30 ET" };
  if (minutes >= CLOSE && minutes < AFTER) return { state: "after", detail: "After-hours until 20:00 ET" };
  return { state: "closed", detail: weekday === 5 && minutes >= AFTER ? "Opens Mon 09:30 ET" : "Opens 09:30 ET" };
}

// forex runs from Sunday 5pm to Friday 5pm New York time
export function fxSession(now: Date): SessionStatus {
  const { weekday, minutes } = newYorkClock(now);
  const fivePm = 17 * 60;
  const closed =
    weekday === 6 || (weekday === 5 && minutes >= fivePm) || (weekday === 0 && minutes < fivePm);
  return closed
    ? { state: "closed", detail: "Opens Sun 17:00 ET" }
    : { state: "open", detail: "Closes Fri 17:00 ET" };
}
