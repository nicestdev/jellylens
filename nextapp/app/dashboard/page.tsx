"use client";

import { loadRequests } from "@/components/request-tiles";
import { IGNORES_CHANGED, REQUESTS_CHANGED, loadDownloads, loadOrganize, loadShowsAndIgnores } from "@/lib/api-client";
import { useLoad } from "@/hooks/use-load";
import { useWindowEvent } from "@/hooks/use-window-event";
import { MissingTable } from "./missing-table";
import { QueueTable, DisksTable, ImportsTable, WishlistTable } from "./rail";
import { isActive, queueLine, sections } from "@/app/queue/logic";
import { isMoving } from "@/app/queue/organize-logic";
import { usePoll } from "@/hooks/use-poll";
import { missingShows, openWishlist, queueRows, recentImports } from "./logic";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";

// The admins' start page: two columns, the left twice the right (which is
// never narrower than 18rem; a phone on its side has them equal). Left, what comes
// in: the Queue (what's in it but what's done) and the last 7 days' imports;
// right, how the library stands: its disks, the wishlist (when it has
// anything) and every show with episodes missing (what's ignored of them is
// on Settings). On a phone held upright one under the other: the Queue, the
// disks, the wishlist, incomplete shows, the imports last. With nothing
// coming in the right column moves into the left's place.
export default function DashboardPage() {
  const missing = useLoad(loadShowsAndIgnores);
  const requests = useLoad(loadRequests);
  const organize = useLoad(loadOrganize);
  const downloads = useLoad(loadDownloads);
  // As the Queue does: every second while something comes in or moves.
  usePoll(downloads.reload, downloads.data && isActive(downloads.data.packages) ? 1000 : 10000);
  usePoll(organize.reload, organize.data && isMoving(organize.data) ? 1000 : 10000);
  useWindowEvent(REQUESTS_CHANGED, () => void requests.reload());
  useWindowEvent(IGNORES_CHANGED, () => void missing.reload());
  const shows = missing.data?.shows ?? [];
  const ignores = missing.data?.ignored ?? [];
  const wishlist = openWishlist(requests.data?.items ?? []);
  // Only with something on it.
  const wishes = wishlist.length ? <WishlistTable items={wishlist.slice(0, 8)} total={wishlist.length} /> : null;
  // What's in the Queue, but what's done.
  const queue = downloads.data
    ? sections(downloads.data.packages, organize.data ?? null).filter((s) => s.title !== "Done")
    : [];
  // Only while something comes in: the Queue's Speed and Time left.
  const running = downloads.data
    ? queueLine(downloads.data)
        .filter((st) => st.label === "Speed" || st.label === "Time left")
        .map((st) => st.value)
    : [];
  const imports = recentImports(organize.data?.moved ?? []);
  // Nothing comes in (once both are loaded): the right column takes the left's place.
  const leftEmpty = Boolean(downloads.data && organize.data) && queueRows(queue).length === 0 && imports.length === 0;
  const error =
    (missing.error && `Failed to load shows: ${missing.error}`) ||
    (requests.error && `Failed to load the wishlist: ${requests.error}`) ||
    (organize.error && `Failed to load the library: ${organize.error}`);

  return (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      <h1 className="text-3xl font-semibold max-md:sr-only">Dashboard</h1>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {/* One column of sections on a phone held upright (order-*: Queue, disks,
          wishlist, incomplete shows, imports); from lg up two (2:1), on a phone on its
          side two of the same width, the wrappers turning from `contents` into
          the columns. */}
      <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-start phone-landscape:grid phone-landscape:grid-cols-2 phone-landscape:items-start">
        <div className="contents min-w-0 lg:flex lg:flex-col lg:gap-6 phone-landscape:flex phone-landscape:flex-col phone-landscape:gap-4">
          <div className="order-1 min-w-0 empty:hidden">
            <QueueTable parts={queue} running={running} />
          </div>
          <div className="order-5 min-w-0 empty:hidden lg:order-2 phone-landscape:order-2">
            <ImportsTable moved={imports} />
          </div>
        </div>
        <div
          className={cn(
            "contents min-w-0 lg:flex lg:flex-col lg:gap-6 phone-landscape:flex phone-landscape:flex-col phone-landscape:gap-4",
            leftEmpty && "lg:col-start-1 lg:row-start-1 phone-landscape:col-start-1 phone-landscape:row-start-1",
          )}
        >
          <div className="order-2 min-w-0">
            <DisksTable disks={organize.data?.disks ?? []} loading={organize.loading} />
          </div>
          {wishes ? <div className="order-3 min-w-0 empty:hidden">{wishes}</div> : null}
          <div className="order-4 min-w-0 empty:hidden">
            <MissingTable shows={missingShows(shows, ignores)} />
          </div>
        </div>
      </div>
    </main>
  );
}
