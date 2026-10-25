// loaders for the recorded snapshot files, one per series. each file is only loaded when
// it's needed. we write every import path out in full so the bundler knows to ship them.
// to refresh the data run `npm run snapshot`

import type { SnapshotFile } from "@/lib/market/snapshotCodec";

type Loader = () => Promise<{ default: unknown }>;

export const SNAPSHOT_LOADERS: Record<string, Loader> = {
  "AAPL.daily": () => import("./AAPL.daily.json"),
  "AAPL.weekly": () => import("./AAPL.weekly.json"),
  "MSFT.daily": () => import("./MSFT.daily.json"),
  "MSFT.weekly": () => import("./MSFT.weekly.json"),
  "NVDA.daily": () => import("./NVDA.daily.json"),
  "NVDA.weekly": () => import("./NVDA.weekly.json"),
  "GOOGL.daily": () => import("./GOOGL.daily.json"),
  "GOOGL.weekly": () => import("./GOOGL.weekly.json"),
  "AMZN.daily": () => import("./AMZN.daily.json"),
  "AMZN.weekly": () => import("./AMZN.weekly.json"),
  "TSLA.daily": () => import("./TSLA.daily.json"),
  "TSLA.weekly": () => import("./TSLA.weekly.json"),
  "EURUSD.daily": () => import("./EURUSD.daily.json"),
  "EURUSD.weekly": () => import("./EURUSD.weekly.json"),
  "GBPUSD.daily": () => import("./GBPUSD.daily.json"),
  "GBPUSD.weekly": () => import("./GBPUSD.weekly.json"),
  "USDJPY.daily": () => import("./USDJPY.daily.json"),
  "USDJPY.weekly": () => import("./USDJPY.weekly.json"),
  "USDGHS.daily": () => import("./USDGHS.daily.json"),
  "USDGHS.weekly": () => import("./USDGHS.weekly.json"),
};

export async function loadSnapshotFile(key: string): Promise<SnapshotFile | null> {
  const load = SNAPSHOT_LOADERS[key];
  return load ? ((await load()).default as SnapshotFile) : null;
}
