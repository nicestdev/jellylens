"use client";

import { useState } from "react";
import { loadRequests } from "@/components/request-tiles";
import {
  REQUESTS_CHANGED,
  apiFetch,
  jsonRequest,
  loadDownloads,
  loadOrganize,
  loadShowsAndIgnores,
} from "@/lib/api-client";
import type { IgnoreEntry, IgnoredResponse } from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { useWindowEvent } from "@/hooks/use-window-event";
import { MissingTable } from "./missing-table";
import { QueueTable, DisksTable, ImportsTable, WishlistTable } from "./rail";
import { sections } from "@/app/queue/logic";
import { usePoll } from "@/hooks/use-poll";
import { missingShows, openWishlist, recentImports } from "./logic";
import { ErrorAlert } from "@/components/error-alert";

// The admins' start page: what in the Queue needs a hand on top of
// the wide column when there's anything (on a phone too); every show with episodes
// missing (what's ignored of them is on Settings) and the last 7 days' imports in the wide
// column, the wishlist (when it has anything) and the library's disks in a
// narrow one beside it; on a phone one under the other, the Queue, then the wishlist.
export default function DashboardPage() {
  const missing = useLoad(loadShowsAndIgnores);
  const requests = useLoad(loadRequests);
  const organize = useLoad(loadOrganize);
  const downloads = useLoad(loadDownloads);
  usePoll(downloads.reload, 10000);
  useWindowEvent(REQUESTS_CHANGED, () => void requests.reload());
  const [actionError, setActionError] = useState("");

  async function ignore(entry: IgnoreEntry) {
    try {
      const res = await apiFetch<IgnoredResponse>("/api/ignored", jsonRequest("POST", entry));
      missing.setData((data) => data && { ...data, ignored: res.items });
      setActionError("");
    } catch (e) {
      setActionError(`Failed to update ignore list: ${(e as Error).message}`);
    }
  }

  const shows = missing.data?.shows ?? [];
  const ignores = missing.data?.ignored ?? [];
  const wishlist = openWishlist(requests.data?.items ?? []);
  // Only with something on it: on top of the narrow column, on a phone
  // (one column) on top of the page.
  const wishes = wishlist.length ? <WishlistTable items={wishlist.slice(0, 8)} total={wishlist.length} /> : null;
  // What needs a hand; Downloading and Done go on by themselves.
  const queue = downloads.data
    ? sections(downloads.data.packages, organize.data ?? null).filter(
        (s) => s.title === "Needs attention" || s.title === "Ready to organize",
      )
    : [];
  const error =
    actionError ||
    (missing.error && `Failed to load shows: ${missing.error}`) ||
    (requests.error && `Failed to load the wishlist: ${requests.error}`) ||
    (organize.error && `Failed to load the library: ${organize.error}`);

  return (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <h1 className="text-3xl font-semibold max-md:sr-only">Dashboard</h1>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <QueueTable parts={queue} />
          {wishes ? <div className="xl:hidden">{wishes}</div> : null}
          <MissingTable shows={missingShows(shows, ignores)} loading={missing.loading} onIgnore={ignore} />
          <ImportsTable moved={recentImports(organize.data?.moved ?? [])} loading={organize.loading} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {wishes ? <div className="max-xl:hidden">{wishes}</div> : null}
          <DisksTable disks={organize.data?.disks ?? []} loading={organize.loading} />
        </div>
      </div>
    </main>
  );
}
