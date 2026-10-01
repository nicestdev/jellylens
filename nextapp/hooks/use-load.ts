"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

// A page's data: loaded on mount, again whenever reload() is called (it can
// be awaited, e.g. after a sync), and replaced locally with setData after a
// change the server answered. load must be stable (defined outside the
// component, or memoized): a new function loads again. error: the last
// load's message, "" once one succeeds; data stays what it was until then.
export function useLoad<T>(load: () => Promise<T>): {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const settle = useCallback((promise: Promise<T>, isCurrent: () => boolean) => {
    return promise.then(
      (value) => {
        if (!isCurrent()) return;
        setData(value);
        setError("");
        setLoading(false);
      },
      (e: unknown) => {
        if (!isCurrent()) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    let current = true;
    settle(load(), () => current);
    return () => {
      current = false;
    };
  }, [load, settle]);

  const reload = useCallback(() => settle(load(), () => true), [load, settle]);

  return { data, setData, error, loading, reload };
}
