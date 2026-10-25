import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildAlphaVantageUrl, parseAlphaVantageSeries } from "./alphaVantage.ts";
import { errorCode, ProviderError } from "./errors.ts";
import { classifyFinnhubStatus, parseFinnhubQuote } from "./finnhub.ts";
import { getInstrument } from "./instruments.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

const rejectsWith = (code: string) => (err: unknown) =>
  err instanceof ProviderError && err.code === code;

describe("Alpha Vantage", () => {
  it("builds stock and FX URLs", () => {
    const stock = new URL(buildAlphaVantageUrl(getInstrument("AAPL")!, "weekly", "k"));
    assert.equal(stock.searchParams.get("function"), "TIME_SERIES_WEEKLY_ADJUSTED");
    assert.equal(stock.searchParams.get("symbol"), "AAPL");

    const fx = new URL(buildAlphaVantageUrl(getInstrument("usdghs")!, "daily", "k"));
    assert.equal(fx.searchParams.get("function"), "FX_DAILY");
    assert.equal(fx.searchParams.get("from_symbol"), "USD");
    assert.equal(fx.searchParams.get("to_symbol"), "GHS");
  });

  it("parses a stock series oldest-first with volume", () => {
    const { bars, lastRefreshed } = parseAlphaVantageSeries(fixture("av-stock-daily.json"));
    assert.equal(bars.length, 5);
    assert.equal(lastRefreshed, "2026-10-23");
    assert.ok(bars.every((b, i) => i === 0 || b.t > bars[i - 1].t));
    const last = bars.at(-1)!;
    assert.equal(last.t, Date.UTC(2026, 9, 23));
    assert.equal(last.c, 347.725);
    assert.equal(last.v, 39539690);
  });

  it("parses an FX series with null volume", () => {
    const { bars } = parseAlphaVantageSeries(fixture("av-fx-daily.json"));
    assert.equal(bars.length, 5);
    assert.ok(bars.every((b) => b.v === null && b.h >= b.l));
  });

  it("rescales adjusted series so a stock split is not a price cliff", () => {
    // A 10:1 split between the two weeks: raw closes 1200 -> 130.
    const row = (close: string, adj: string, volume: string) => ({
      "1. open": close, "2. high": close, "3. low": close, "4. close": close,
      "5. adjusted close": adj, "6. volume": volume, "7. dividend amount": "0.0000",
    });
    const { bars } = parseAlphaVantageSeries({
      "Meta Data": { "3. Last Refreshed": "2024-06-14" },
      "Weekly Adjusted Time Series": {
        "2024-06-14": row("130.00", "130.00", "1000"),
        "2024-06-07": row("1200.00", "120.00", "100"),
      },
    });
    assert.equal(bars[0].c, 120);
    assert.equal(bars[0].v, 1000);
    assert.equal(bars[1].c, 130);
  });

  it("redacts the API key Alpha Vantage echoes in quota messages", () => {
    const body = { Information: "We have detected your API key as SECRET123 and our limit is 25 requests per day." };
    assert.throws(
      () => parseAlphaVantageSeries(body),
      (err: unknown) => err instanceof ProviderError && !err.message.includes("SECRET123"),
    );
  });

  it("treats a 200 'Information' refusal as a rate limit, never as data", () => {
    const body = {
      Information:
        "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.",
    };
    assert.throws(() => parseAlphaVantageSeries(body), rejectsWith("rate_limited"));
  });

  it("distinguishes premium endpoints and bad symbols", () => {
    assert.throws(
      () => parseAlphaVantageSeries({ Information: "This is a premium endpoint." }),
      rejectsWith("premium"),
    );
    assert.throws(
      () => parseAlphaVantageSeries({ "Error Message": "Invalid API call." }),
      rejectsWith("bad_symbol"),
    );
    assert.throws(() => parseAlphaVantageSeries({}), rejectsWith("bad_response"));
  });
});

describe("Finnhub", () => {
  it("parses a quote into a Quote with ms timestamps", () => {
    const q = parseFinnhubQuote("AAPL", fixture("finnhub-quote.json"));
    assert.equal(q.price, 347.725);
    assert.equal(q.prevClose, 348.22);
    assert.equal(q.t, 1792785600_000);
  });

  it("rejects the all-zero quote Finnhub returns for unknown symbols", () => {
    const zero = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 };
    assert.throws(() => parseFinnhubQuote("NOPE", zero), rejectsWith("bad_symbol"));
  });

  it("maps HTTP failures to error codes", () => {
    assert.equal(classifyFinnhubStatus(200, ""), null);
    assert.equal(classifyFinnhubStatus(403, "no access")?.code, "premium");
    assert.equal(classifyFinnhubStatus(429, "")?.code, "rate_limited");
  });
});

describe("errorCode", () => {
  it("recovers the code from an error that lost its class crossing a cache boundary", () => {
    const original = new ProviderError("missing_key", "no key");
    const rebuilt = new Error(original.message);
    assert.equal(errorCode(original), "missing_key");
    assert.equal(errorCode(rebuilt), "missing_key");
    assert.equal(errorCode(new Error("socket hang up")), "network");
  });
});
