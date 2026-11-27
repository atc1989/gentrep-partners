"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { messageOf } from "./api";

export type Loaded<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** One load per screen with the three states the playbook asks for: loading, error with retry, data. Stale answers are dropped. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadRef.current().then(
      (data) => id === latest.current && setState({ data, error: null, loading: false }),
      (e) => id === latest.current && setState((s) => ({ ...s, error: messageOf(e), loading: false })),
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { ...state, reload: run };
}

/** Debounced copy of a value, for search boxes (about 300 ms). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
