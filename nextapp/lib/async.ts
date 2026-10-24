// Runs fn over items with at most `limit` calls in flight at once; results
// keep the items' order. A rejection rejects the whole run.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Gives up on a service once `limit` calls in a row failed: `down` is then
// the error, and a caller skips what's left. For syncs over many titles, so
// an outage ends them in seconds instead of a timeout per title.
export function outage(limit = 5) {
  let streak = 0;
  let down: Error | null = null;
  return {
    get down() {
      return down;
    },
    ok() {
      streak = 0;
    },
    failed(e: unknown) {
      if (++streak >= limit) down ??= new Error(`unreachable, ${limit} calls in a row failed: ${(e as Error).message}`);
    },
  };
}
