// the snapshot files store each bar as an array [t, o, h, l, c, v] instead of an object,
// that cuts the file size roughly in half. this is the only file that knows that layout

import type { Bar, Series } from "./types.ts";

type BarTuple = [t: number, o: number, h: number, l: number, c: number, v: number | null];

export interface SnapshotFile {
  id: string;
  interval: Series["interval"];
  lastRefreshed: string;
  fetchedAt: number;
  bars: BarTuple[];
}

export function encodeSnapshot(series: Series): SnapshotFile {
  return {
    id: series.id,
    interval: series.interval,
    lastRefreshed: series.lastRefreshed,
    fetchedAt: series.fetchedAt,
    bars: series.bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]),
  };
}

export function decodeSnapshot(file: SnapshotFile): Series {
  return {
    id: file.id,
    interval: file.interval,
    lastRefreshed: file.lastRefreshed,
    fetchedAt: file.fetchedAt,
    bars: file.bars.map(([t, o, h, l, c, v]): Bar => ({ t, o, h, l, c, v })),
  };
}
