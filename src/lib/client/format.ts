// formatting numbers and dates for display. Intl formatters are slow to create
// so we build each one once and reuse it

const priceFormats = new Map<number, Intl.NumberFormat>();

export function formatPrice(value: number, decimals = 2): string {
  let f = priceFormats.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    priceFormats.set(decimals, f);
  }
  return f.format(value);
}

// +1.24 or −1.24, we use a proper minus sign (−) not a hyphen so it lines up with the +
export function formatSigned(value: number, decimals = 2): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + formatPrice(Math.abs(value), decimals);
}

export function formatPct(value: number, decimals = 2): string {
  return `${formatSigned(value, decimals)}%`;
}

// 52300000 -> 52.3M , this is an example of the compact .
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export const formatCompact = (value: number) => compact.format(value);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "23 Oct 2026". we read the UTC date because our bars are stored at UTC midnight
export function formatDay(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const formatClock = (t: number) => timeFmt.format(t);

// "just now", "4 min ago", "3 h ago", "2 d ago"
export function formatAge(seconds: number): string {
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

// small helpers so every component picks up/down colours and arrows the same way
export type Direction = "up" | "down" | "flat";
export const direction = (value: number): Direction => (value > 0 ? "up" : value < 0 ? "down" : "flat");
export const arrow = (d: Direction) => (d === "up" ? "▲" : d === "down" ? "▼" : "■");
export const toneClass = (d: Direction) => (d === "up" ? "text-up" : d === "down" ? "text-down" : "text-muted");


//charle this part wasn't easy