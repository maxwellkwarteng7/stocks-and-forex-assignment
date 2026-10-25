import type { AssetClass } from "./types";

export interface Instrument {
    id: string, 
    kind: AssetClass; 
    label: string, 
    name: string, 
    decimals: number, 
    base?: string; 
    quote?: string 
}


const stock = (id: string, name: string): Instrument => ({
    id,
    kind: "stock",
    label: id,
    name,
    decimals: 2
});

const pair = (base: string, quote: string, name: string, decimals: number): Instrument => ({
    id: `${base}${quote}`,
    kind: 'fx',
    label: `${base}/${quote}`,
    name,
    decimals,
    base,
    quote
});


// Ten instruments keeps the whole board inside Alpha Vantage's free tier:
// 10 daily series refreshed twice a day = 20 of the 25 requests allowed.
export const INSTRUMENTS: readonly Instrument[] = [
  stock("AAPL", "Apple"),
  stock("MSFT", "Microsoft"),
  stock("NVDA", "NVIDIA"),
  stock("GOOGL", "Alphabet"),
  stock("AMZN", "Amazon"),
  stock("TSLA", "Tesla"),
  pair("EUR", "USD", "Euro / US Dollar", 4),
  pair("GBP", "USD", "British Pound / US Dollar", 4),
  pair("USD", "JPY", "US Dollar / Japanese Yen", 2),
  pair("USD", "GHS", "US Dollar / Ghanaian Cedi", 3),
];

// we create a hashmap for faster reference . 
const BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));


export function getInstrument(id: string): Instrument | undefined {
  return BY_ID.get(id.toUpperCase());
}

export const STOCKS = INSTRUMENTS.filter((i) => i.kind === "stock");
export const FX_PAIRS = INSTRUMENTS.filter((i) => i.kind === "fx");


