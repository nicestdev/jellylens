"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// A page's data: loaded on mount, again whenever reload() is called (it can
// be awaited, e.g. after a sync), and replaced locally with setData after a
// change the server answered. load must be stable (defined outside the
// component, or memoized): a new function loads again. error: the last
// load's message, "" once one succeeds; data stays what it was until then.
// Only the latest counts: a load answered after a newer one started, or
// after setData (a poll asked before an action, answered after it), is
// dropped, so an older answer never overwrites a newer one.
export function useLoad<T>(load: () => Promise<T>): {
  data: T | null;
  setData: Dispatch<SetStateAction<T | null>>;
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [data, setState] = useState<T | null>(null);
  const seq = useRef(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // What the server answered an action with: loaded, even if the load it
  // drops was the first.
  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((value) => {
    seq.current++;
    setState(value);
    setLoading(false);
  }, []);

  const settle = useCallback((promise: Promise<T>, mounted: () => boolean) => {
    const n = ++seq.current;
    const isCurrent = () => mounted() && n === seq.current;
    return promise.then(
      (value) => {
        if (!isCurrent()) return;
        setState(value);
        setError("");
        setLoading(false);
      },
      (e: unknown) => {
        if (!isCurrent()) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
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
