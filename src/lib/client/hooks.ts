"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Interval, SeriesPayload } from "@/lib/market/types";

/** polls a url, pauses while the tab is hidden and keeps the last good data if a fetch fails */
export function usePoll<T>(url: string, every: number | ((data: T) => number), initial: T): T {
  const [data, setData] = useState<T>(initial);
  const latest = useRef({ data, every });
  useLayoutEffect(() => {
    latest.current = { data, every };
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const delay = () => {
      const { data: d, every: e } = latest.current;
      return typeof e === "function" ? e(d) : e;
    };

    let lastFetch = Date.now();

    const tick = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        lastFetch = Date.now();
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok && !cancelled) {
            const next = (await res.json()) as T;
            latest.current.data = next;
            setData(next);
          }
        } catch {
          // keep what we had, next tick tries again
        }
      }
      if (!cancelled) timer = setTimeout(tick, delay());
    };

    timer = setTimeout(tick, delay());
    // only refetch on return if we actually missed a poll, so tab switching costs nothing
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const due = lastFetch + delay() - Date.now();
      clearTimeout(timer);
      timer = due <= 0 ? (tick(), undefined) : setTimeout(tick, due);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url]);

  return data;
}

export function useSize<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}

// weekly series get shared for the whole session
const seriesCache = new Map<string, Promise<SeriesPayload>>();

function loadSeries(id: string, interval: Interval): Promise<SeriesPayload> {
  const key = `${id}.${interval}`;
  let p = seriesCache.get(key);
  if (!p) {
    p = fetch(`/api/series/${id}?interval=${interval}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<SeriesPayload>;
    });
    p.catch(() => seriesCache.delete(key));
    seriesCache.set(key, p);
  }
  return p;
}

/** while a new series loads we keep the old one so the chart doesn't flash empty */
export function useSeries(id: string, interval: Interval, preloaded?: SeriesPayload) {
  const [state, setState] = useState<{ key: string; series: SeriesPayload } | null>(null);
  const key = `${id}.${interval}`;

  useEffect(() => {
    if (preloaded) return;
    let live = true;
    loadSeries(id, interval)
      .then((series) => live && setState({ key, series }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, interval, key, preloaded]);

  if (preloaded) return { series: preloaded, loading: false };
  return { series: state?.series ?? null, loading: state?.key !== key };
}

export function useMultiSeries(ids: readonly string[], interval: Interval, board: Map<string, SeriesPayload>) {
  const [loaded, setLoaded] = useState<Map<string, SeriesPayload>>(new Map());
  const idsKey = ids.join(",");

  useEffect(() => {
    if (interval === "daily") return;
    let live = true;
    Promise.all(
      idsKey.split(",").filter(Boolean).map((id) => loadSeries(id, interval).catch(() => null)),
    ).then((list) => {
      if (!live) return;
      setLoaded(new Map(list.filter((s): s is SeriesPayload => !!s).map((s) => [s.id, s])));
    });
    return () => {
      live = false;
    };
  }, [idsKey, interval]);

  const source = interval === "daily" ? board : loaded;
  return ids.map((id) => source.get(id)).filter((s): s is SeriesPayload => !!s);
}
