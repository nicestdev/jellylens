"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ChartPie,
  CircleArrowDown,
  CircleArrowUp,
  Compass,
  Film,
  FolderInput,
  Heart,
  Lock,
  Puzzle,
  Rss,
  Settings,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { COUNTS_STALE, DOWNLOADS_CHANGED, REQUESTS_CHANGED, apiFetch } from "@/lib/api-client";
import type { DownloadsResponse, RequestsResponse, StatusResponse } from "@/lib/api-types";
import type { SessionUser } from "@/lib/session";
import { useLoad } from "@/hooks/use-load";
import { useWindowEvent } from "@/hooks/use-window-event";
import { loadRequests } from "@/components/request-tiles";
import { cn } from "@/lib/utils";
import pkg from "@/package.json";

const noSubscribe = () => () => {};

// icon: in the sidebar, before the label. count: which number goes next to
// the link. admin: only for admins (proxy.ts enforces it).
type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: "movies" | "shows" | "missing" | "requests" | "downloads" | "organize";
  admin?: boolean;
};
type NavSection = { label: string; links: NavLink[] };

// What you have, what you want, and the admins' tools (Missing among
// them), A–Z. A section with none of the user's pages
// isn't shown.
const sections: NavSection[] = [
  {
    label: "Library",
    links: [
      { href: "/movies", label: "Movies", icon: Film, count: "movies" },
      { href: "/shows", label: "TV Shows", icon: Tv, count: "shows" },
    ],
  },
  {
    label: "Explore",
    links: [
      { href: "/discover", label: "Discover", icon: Compass },
      { href: "/wishlist", label: "Wishlist", icon: Heart, count: "requests" },
    ],
  },
  {
    label: "Administration",
    links: [
      { href: "/analytics", label: "Analytics", icon: ChartPie, admin: true },
      { href: "/downloads", label: "Downloads", icon: CircleArrowDown, count: "downloads", admin: true },
      { href: "/missing", label: "Missing", icon: Puzzle, count: "missing", admin: true },
      { href: "/organize", label: "Organize", icon: FolderInput, count: "organize", admin: true },
      { href: "/releases", label: "Releases", icon: Rss, admin: true },
      { href: "/settings", label: "Settings", icon: Settings, admin: true },
      { href: "/upgrades", label: "Upgrades", icon: CircleArrowUp, admin: true },
    ],
  },
];

const sectionsFor = (user: SessionUser) =>
  sections
    .map((s) => ({ ...s, links: s.links.filter((l) => user.admin || !l.admin) }))
    .filter((s) => s.links.length > 0);

const loadStatus = () => apiFetch<StatusResponse>("/api/status");
// Admins' packages, for Downloads' count; nothing to ask for anyone else.
const loadDownloads = () => apiFetch<DownloadsResponse>("/api/downloads");
const noDownloads = () => Promise.resolve(null);

// Requests still open: not in the library yet. An admin's are everyone's
// (the overview), anyone else's their own.
function openRequests(list: RequestsResponse): number {
  return (list.all ? list.Items : list.Items.filter((r) => r.mine)).filter((r) => !r.library).length;
}

// Downloads' count: the packages in New and Running, not the finished ones.
const openDownloads = (list: DownloadsResponse) => list.packages.filter((p) => p.status !== "done").length;

// Organize's count: finished packages not moved into the library yet.
const toOrganize = (list: DownloadsResponse) => list.packages.filter((p) => p.status === "done" && !p.movedTo).length;

function countOf(
  status: StatusResponse | null,
  requests: RequestsResponse | null,
  downloads: DownloadsResponse | null,
  key: NavLink["count"],
): number | null {
  if (key === "requests") return requests && openRequests(requests);
  if (key === "downloads") return downloads && openDownloads(downloads);
  if (key === "organize") return downloads && toOrganize(downloads);
  if (!status || !key) return null;
  if (key === "movies") return status.library.movies;
  if (key === "shows") return status.library.shows;
  return status.missing.incompleteCount + status.missing.incompleteCollectionCount;
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
function SignOutButton({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  return (
    <button
      type="button"
      onClick={canSignOut ? signOut : undefined}
      title={canSignOut ? `Signed in as ${user.name}` : "Sign-in is off"}
      className={cn(linkClass(false), "w-full justify-start gap-2.5 text-left")}
    >
      <Lock className={NAV_ICON} />
      Sign out
    </button>
  );
}

// The left column from md up: the pages in sections, each with its count
// where there is one (all muted), and at the bottom Sign out. Sticks while the page scrolls.
export function Sidebar({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  const pathname = usePathname();
  const { data: status, reload: reloadStatus } = useLoad(loadStatus);
  const { data: requests, setData: setRequests } = useLoad(loadRequests);
  const downloads = useLoad(user.admin ? loadDownloads : noDownloads);
  const { setData: setDownloads, reload: reloadDownloads } = downloads;
  // Fresh on every page change; the Downloads page tells as it changes.
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
      <Link href="/" className="flex items-center gap-2 px-2 py-1 font-semibold">
        <Logo className="size-5" />
        Jellylens
        <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{pkg.version}</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-5">
        {sectionsFor(user).map((section) => (
          <div key={section.label} className="flex flex-col gap-px">
            <span className="px-2 pb-1 text-xs text-muted-foreground">{section.label}</span>
            {section.links.map((l) => {
              const count = countOf(status, requests, downloads.data, l.count);
              return (
                <Link key={l.href} href={l.href} className={linkClass(pathname === l.href)}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <l.icon className={NAV_ICON} />
                    {l.label}
                  </span>
                  {count !== null ? (
                    <span className="font-num text-xs text-muted-foreground tabular-nums">{count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t pt-3">
        <SignOutButton user={user} canSignOut={canSignOut} />
      </div>
    </aside>
  );
}

// Below md: a slim bar with the logo and a two-line button that morphs
// into an ×, opening a full-screen panel with large links that fade in one
// after another.
export function MobileBar({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  // The panel has room for every link in one list.
  const links = sectionsFor(user).flatMap((s) => s.links);
  const pathname = usePathname();
  // The page the menu was opened on. Navigating anywhere (link, back
  // button) makes it stale, which closes the menu without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  // The panel is portaled to <body>: inside the header, whose backdrop blur
  // makes it the containing block, "fixed" would pin it to the header box.
  // The portal target only exists on the client.
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

  // Starts at the very top, behind the (translucent) bar, so the bar reads
  // solid while the menu is open; the links clear it with top padding.
  const panel = (
    <div
      id="mobile-menu"
      inert={!open}
      className={cn(
        "fixed inset-0 z-30 overflow-y-auto bg-background transition-[opacity,visibility] duration-300 md:hidden",
        open ? "visible opacity-100" : "invisible opacity-0",
      )}
    >
      <nav className="flex flex-col px-8 pt-20 pb-10">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={close}
            // Staggered on the way in; all at once on the way out.
            style={{ transitionDelay: open ? `${60 + i * 40}ms` : "0ms" }}
            className={cn(
              "py-2 text-[1.75rem] leading-tight font-semibold tracking-tight transition-[opacity,transform] duration-300 ease-out",
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
              pathname === l.href ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
        <div
          style={{ transitionDelay: open ? `${60 + links.length * 40}ms` : "0ms" }}
          className={cn(
            "mt-8 border-t pt-6 transition-[opacity,transform] duration-300 ease-out",
            open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          {/* Reads like the links above, one size down. */}
          <button
            type="button"
            onClick={canSignOut ? signOut : undefined}
            className="-my-2 py-2 text-xl font-semibold tracking-tight text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );

  return (
    <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:hidden">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
        <Logo className="size-6" />
        Jellylens
      </Link>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => (open ? close() : setOpenOn(pathname))}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "relative")}
      >
        {/* Two bars that slide to the middle and cross into an ×. */}
        <span
          className={cn(
            "absolute h-[1.5px] w-4 rounded-full bg-current transition-transform duration-300 ease-out",
            open ? "rotate-45" : "-translate-y-[3.5px]",
          )}
        />
        <span
          className={cn(
            "absolute h-[1.5px] w-4 rounded-full bg-current transition-transform duration-300 ease-out",
            open ? "-rotate-45" : "translate-y-[3.5px]",
          )}
        />
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </header>
  );
}
