"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { ChartPie, Compass, Film, Heart, Layers, Lock, Rocket, Settings, Tv, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { SearchIcon } from "@/components/design-icons";
import { setPageActionsSlot, setPageToolsSlot, usePageTools } from "@/components/page-tools";
import { DevTools, MobileDevTools } from "@/components/dev-tools";
import { COUNTS_STALE, DOWNLOADS_CHANGED, REQUESTS_CHANGED, apiFetch, loadDownloads } from "@/lib/api-client";
import type { DownloadsResponse, RequestsResponse, StatusResponse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/session";
import { useLoad } from "@/hooks/use-load";
import { useWindowEvent } from "@/hooks/use-window-event";
import { loadRequests } from "@/components/request-tiles";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

// icon: in the sidebar, before the label. count: which number goes next to
// the link, only when it's more than 0. admin: only for admins (proxy.ts enforces it).
type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: "movies" | "shows" | "requests" | "downloads";
  admin?: boolean;
};
type NavSection = { label: string; links: NavLink[] };

// What an admin works with daily on top (no heading): the Dashboard and
// the Queue; then the titles (what you have, find and want), and the
// admins' tools. A section with none of the user's pages isn't shown.
const sections: NavSection[] = [
  {
    label: "",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: Layers, admin: true },
      { href: "/queue", label: "Queue", icon: Rocket, count: "downloads", admin: true },
    ],
  },
  {
    label: "Library",
    links: [
      { href: "/movies", label: "Movies", icon: Film, count: "movies" },
      { href: "/shows", label: "Shows", icon: Tv, count: "shows" },
      { href: "/discover", label: "Discover", icon: Compass },
      { href: "/wishlist", label: "Wishlist", icon: Heart, count: "requests" },
    ],
  },
  {
    label: "Administration",
    links: [
      { href: "/analytics", label: "Analytics", icon: ChartPie, admin: true },
      { href: "/settings", label: "Settings", icon: Settings, admin: true },
    ],
  },
];

// Where the logo goes: the start page, as / redirects (app/page.tsx).
const homeOf = (user: SessionUser) => (user.admin ? "/dashboard" : "/movies");

const sectionsFor = (user: SessionUser) =>
  sections
    .map((s) => ({ ...s, links: s.links.filter((l) => user.admin || !l.admin) }))
    .filter((s) => s.links.length > 0);

const loadStatus = () => apiFetch<StatusResponse>("/api/status");
// Admins' packages, for the Queue's count; nothing to ask for anyone else.
const noDownloads = () => Promise.resolve(null);

// Requests still open: not in the library yet. An admin's are everyone's
// (the overview), anyone else's their own.
function openRequests(list: RequestsResponse): number {
  return (list.all ? list.items : list.items.filter((r) => r.mine)).filter((r) => !r.library).length;
}

// Queue's count: every package not in the library yet, the Queue's
// sections but Done.
const openDownloads = (list: DownloadsResponse) => list.packages.filter((p) => !p.movedTo).length;

function countOf(
  status: StatusResponse | null,
  requests: RequestsResponse | null,
  downloads: DownloadsResponse | null,
  key: NavLink["count"],
): number | null {
  if (key === "requests") return requests && openRequests(requests);
  if (key === "downloads") return downloads && openDownloads(downloads);
  if (!status || !key) return null;
  return key === "movies" ? status.library.movies : status.library.shows;
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.replace("/login");
}

// Muted like an inactive label; the picked page's follows its text.
const NAV_ICON = "size-4 shrink-0 opacity-70";

const linkClass = (active: boolean) =>
  cn(
    "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors",
    active
      ? "bg-sidebar-accent text-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
  );

// Sign out at the bottom of the sidebar, like a link. Always there, so the
// sidebar looks the same; with sign-in off (not canSignOut) it does nothing.
function SignOutButton({ canSignOut }: { canSignOut: boolean }) {
  return (
    <button
      type="button"
      onClick={canSignOut ? signOut : undefined}
      className={cn(linkClass(false), "w-full justify-start gap-2.5 text-left")}
    >
      <Lock className={NAV_ICON} />
      Sign out
    </button>
  );
}

// The left column from md up: the pages in sections, each with its count
// where there is one (all muted), and at the bottom Sign out (in next dev
// with the Dev section above it). Sticks while the page scrolls.
export function Sidebar({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  const pathname = usePathname();
  const { data: status, reload: reloadStatus } = useLoad(loadStatus);
  const { data: requests, setData: setRequests } = useLoad(loadRequests);
  const downloads = useLoad(user.admin ? loadDownloads : noDownloads);
  const { setData: setDownloads, reload: reloadDownloads } = downloads;
  // Fresh on every page change; the Queue page tells as it changes.
  useEffect(() => {
    void reloadDownloads();
  }, [pathname, reloadDownloads]);
  useWindowEvent<DownloadsResponse>(DOWNLOADS_CHANGED, setDownloads);
  // A download, move or sync done, or Organize changed: the counts again.
  useWindowEvent(COUNTS_STALE, () => {
    void reloadStatus();
    void reloadDownloads();
  });
  // Discover and the Wishlist tell when the list changes.
  useWindowEvent<RequestsResponse>(REQUESTS_CHANGED, setRequests);
  return (
    <aside className="sticky top-0 hidden h-svh w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r bg-sidebar px-2.5 py-3.5 text-sm md:flex">
      <Link href={homeOf(user)} className="flex items-center gap-2 px-2 py-1 font-semibold">
        <Logo className="size-7" />
        <span className="text-base">Jellylens</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-5">
        {sectionsFor(user).map((section) => (
          <div key={section.label} className="flex flex-col gap-px">
            {section.label ? <span className="px-2 pb-1 text-xs text-muted-foreground">{section.label}</span> : null}
            {section.links.map((l) => {
              const count = countOf(status, requests, downloads.data, l.count);
              return (
                <Link key={l.href} href={l.href} className={linkClass(pathname === l.href)}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <l.icon className={NAV_ICON} />
                    {l.label}
                  </span>
                  {count ? <span className="font-mono text-xs text-muted-foreground">{count}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <DevTools itemClass={linkClass(false)} />
        <div className="border-t pt-3">
          <SignOutButton canSignOut={canSignOut} />
        </div>
      </div>
    </aside>
  );
}

// The phone menu's buttons below the links (Sign out, in next dev the Dev
// section's), read like the links, one size down.
const MOBILE_ITEM =
  "py-1 text-left text-xl font-semibold tracking-tight text-muted-foreground transition-colors hover:text-foreground";

// Below md: a slim bar with the logo, a page's search button and a
// two-line button that morphs into an ×. The two lines open a full-screen
// panel with large links that fade in one after another; the search button
// folds the page's search, filters and sort down from under the bar
// (`PageTools`), like Apple's search.
export function MobileBar({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  // The panel has room for every link in one list.
  const links = sectionsFor(user).flatMap((s) => s.links);
  const pathname = usePathname();
  const tools = usePageTools();
  // A nav page's name, or a title page's "Releases", is here beside the
  // logo instead of a heading on the page.
  const title = pathname.startsWith("/title/") ? "Releases" : links.find((l) => l.href === pathname)?.label;
  // What's open, and the page it was opened on. Navigating anywhere (link,
  // back button) makes it stale, which closes it without an effect.
  const [openOn, setOpenOn] = useState<{ what: "menu" | "search"; path: string } | null>(null);
  const what = openOn?.path === pathname ? openOn.what : null;
  const menuOpen = what === "menu";
  // Only while the page has tools: a page without them closes it.
  const searchOpen = what === "search" && tools.present;
  const open = menuOpen || searchOpen;
  const close = () => setOpenOn(null);
  // The panels are portaled to <body>, out of the header's stacking. The
  // portal target only exists on the client.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  // While open: no scrolling the page behind it (phones only, so resizing
  // up to desktop never leaves the page locked), and Escape closes.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("max-md:overflow-hidden");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("max-md:overflow-hidden");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Rendered at once, so the field can take focus in the tap itself: iOS
  // only brings up the keyboard for a focus there.
  const openSearch = (e: React.MouseEvent<HTMLButtonElement>) => {
    flushSync(() => setOpenOn({ what: "search", path: pathname }));
    const panel = document.getElementById(e.currentTarget.getAttribute("aria-controls") ?? "");
    panel?.querySelector("input")?.focus({ preventScroll: true });
  };

  // Starts at the very top, behind the bar; the links clear it with top
  // padding.
  const menu = (
    <div
      id="mobile-menu"
      inert={!menuOpen}
      className={cn(
        "fixed inset-0 z-30 overflow-y-auto bg-sidebar px-safe transition-[opacity,visibility] duration-300 md:hidden",
        menuOpen ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <nav className="flex flex-col px-12 pt-12 pb-10">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={close}
            // Staggered on the way in; all at once on the way out.
            style={{ transitionDelay: menuOpen ? `${60 + i * 40}ms` : "0ms" }}
            className={cn(
              "py-[0.5625rem] text-[1.75rem] leading-none font-semibold tracking-tight transition-[opacity,transform] duration-300 ease-out",
              menuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
              pathname === l.href ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
        <div
          style={{ transitionDelay: menuOpen ? `${60 + links.length * 40}ms` : "0ms" }}
          className={cn(
            "mt-8 flex flex-col items-start border-t pt-5 transition-[opacity,transform] duration-300 ease-out",
            menuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <MobileDevTools itemClass={MOBILE_ITEM} />
          {/* Reads like the links above, one size down. */}
          <button type="button" onClick={canSignOut ? signOut : undefined} className={MOBILE_ITEM}>
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );

  // Under the bar, over the page dimmed behind it; a tap on the page or
  // Enter in the search closes it, the page then showing what was found.
  const search = (
    <>
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 top-12 z-20 bg-background/70 transition-[opacity,visibility] duration-300 md:hidden",
          searchOpen ? "visible opacity-100" : "invisible opacity-0",
        )}
      />
      <div
        id="mobile-search"
        inert={!searchOpen}
        onKeyDown={(e) => e.key === "Enter" && e.target instanceof HTMLInputElement && close()}
        className={cn(
          "fixed inset-x-0 top-12 z-30 max-h-[calc(100dvh-3rem)] overflow-y-auto border-b bg-sidebar pt-2 pr-[calc(1rem+env(safe-area-inset-right))] pb-4 pl-[calc(1rem+env(safe-area-inset-left))] duration-300 ease-out md:hidden",
          // Visible at once on the way in, so the field takes focus in the tap.
          searchOpen
            ? "visible translate-y-0 opacity-100 transition-[opacity,transform]"
            : "invisible -translate-y-2 opacity-0 transition-[opacity,visibility,transform]",
          // The page's own spacing above its toolbar isn't needed here.
          "[&>*:first-child]:mt-0",
          // Under the search, the filters share a line however wide what's
          // picked is, so the sort never wraps; a picked one shows only its
          // value ("English", not "Audio: English"), as its chip does.
          "[&_[data-facet]]:min-w-0 [&_[data-facet]]:flex-[1_1_0] [&_[data-facet]]:justify-between",
          "[&_[data-facet][data-picked]_[data-facet-label]]:hidden",
        )}
        ref={setPageToolsSlot}
      />
    </>
  );

  return (
    <header
      // Solid, not see-through: iOS 26 Safari tints the status bar above it
      // with the color of a sticky bar at the top, but only an opaque one
      // (a translucent bar gets the page's color there instead).
      className={cn(
        "sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-sidebar transition-colors duration-300 md:hidden",
        // Out of the column's px-safe to the screen's edges, its color with it.
        "-mr-[env(safe-area-inset-right)] -ml-[env(safe-area-inset-left)] pr-[calc(1rem+env(safe-area-inset-right))] pl-[calc(1rem+env(safe-area-inset-left))]",
        // An open panel is the bar's color, so no line between them.
        open && "border-transparent",
      )}
    >
      {/* The logo and the page's name. Gone while something is open,
          leaving the × alone on the bar. */}
      <div
        inert={open}
        className={cn(
          "flex min-w-0 items-center gap-2.5 transition-[opacity,visibility] duration-300",
          open ? "invisible opacity-0" : "visible opacity-100",
        )}
      >
        <Link href={homeOf(user)} aria-label="Jellylens" className="flex shrink-0 items-center">
          <Logo className="size-7" />
        </Link>
        {title ? (
          <span aria-hidden className="truncate text-lg font-semibold">
            {title}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {/* A page's ⋯ (the Queue's), its heading being up here too. */}
        <div
          ref={setPageActionsSlot}
          inert={open}
          className={cn(
            "flex items-center transition-[opacity,visibility] duration-300",
            open ? "invisible opacity-0" : "visible opacity-100",
          )}
        />
        {tools.present ? (
          <button
            type="button"
            aria-label="Search and filter"
            aria-expanded={searchOpen}
            aria-controls="mobile-search"
            inert={open}
            onClick={openSearch}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "relative transition-[opacity,visibility] duration-300",
              open ? "invisible opacity-0" : "visible opacity-100",
            )}
          >
            <SearchIcon className="size-[1.125rem]" />
            {/* The page shows less than it has: a search or filter is on. */}
            {tools.active ? <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" /> : null}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={open ? (searchOpen ? "Close search" : "Close menu") : "Open menu"}
          aria-expanded={open}
          aria-controls={searchOpen ? "mobile-search" : "mobile-menu"}
          onClick={() => (open ? close() : setOpenOn({ what: "menu", path: pathname }))}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative aria-expanded:bg-transparent")}
        >
          {/* Two bars that slide to the middle and cross into an ×, growing so
              it is as wide as the bars were (Apple's menu). */}
          <span
            className={cn(
              "absolute h-[1.2px] rounded-full bg-current transition-[transform,width] duration-300 ease-out",
              open ? "w-[1.0625rem] rotate-45" : "w-[0.875rem] -translate-y-[3.5px]",
            )}
          />
          <span
            className={cn(
              "absolute h-[1.2px] rounded-full bg-current transition-[transform,width] duration-300 ease-out",
              open ? "w-[1.0625rem] -rotate-45" : "w-[0.875rem] translate-y-[3.5px]",
            )}
          />
        </button>
      </div>
      {mounted ? createPortal(menu, document.body) : null}
      {mounted ? createPortal(search, document.body) : null}
    </header>
  );
}
