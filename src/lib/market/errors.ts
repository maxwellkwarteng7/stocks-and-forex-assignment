import type { ProviderErrorCode } from "./types.ts";

/** A failure talking to a data provider */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "ProviderError";
    this.code = code;
  }
}

const CODES = new Set<string>(["missing_key", "rate_limited", "throttled", "quota_exhausted", "premium", "bad_symbol", "bad_response", "network"]);

// error code or if the error is not affiliated with any of our error code then we assume it's a network error .
export function errorCode(err: unknown): ProviderErrorCode {
  if (err instanceof ProviderError) return err.code;
  const tagged = err instanceof Error ? /^\[(\w+)\]/.exec(err.message)?.[1] : undefined;
  return tagged && CODES.has(tagged) ? (tagged as ProviderErrorCode) : "network";
}

// the error messages . 
export const NOTICE_COPY: Record<ProviderErrorCode, string> = {
  missing_key: "No API key configured, so this is showing the bundled snapshot.",
  rate_limited: "The provider rate-limited this request; showing the bundled snapshot.",
  throttled: "Queued behind other requests to stay within the free tier; it will refresh shortly.",
  quota_exhausted: "Today's free-tier quota is used up; showing the bundled snapshot.",
  premium: "This data needs a paid plan with the provider.",
  bad_symbol: "The provider does not recognise this symbol.",
  bad_response: "The provider returned something unexpected.",
  network: "Could not reach the provider.",
};