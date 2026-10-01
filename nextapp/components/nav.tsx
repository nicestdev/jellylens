"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

// admin: only shown to Jellyfin administrators (proxy.ts enforces it).
const allLinks: { href: string; label: string; admin?: boolean }[] = [
  { href: "/movies", label: "Movies" },
  { href: "/shows", label: "TV Shows" },
  { href: "/requests", label: "Requests" },
  { href: "/missing", label: "Missing", admin: true },
  { href: "/releases", label: "Releases", admin: true },
  { href: "/settings", label: "Settings", admin: true },
];

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.replace("/login");
}

const roleLabel = (user: SessionUser) => (user.admin ? "Administrator" : "User");

// The signed-in user's initial in a round button; the menu has who and
// Sign out. Only with sign-in on (canSignOut).
function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Signed in as ${user.name}`}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary uppercase transition-colors hover:bg-primary/25"
      >
        {user.name.slice(0, 1)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-sm font-medium text-foreground">{user.name}</div>
            <div className="font-normal">{roleLabel(user)}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Inline links from sm up. On phones, apple.com-style: a two-line button
// that morphs into an ×, opening a full-screen panel under the header with
// large links that fade in one after another.
export function Nav({ user, canSignOut }: { user: SessionUser; canSignOut: boolean }) {
  const links = allLinks.filter((l) => !l.admin || user.admin);
  const pathname = usePathname();
  // The page the menu was opened on. Navigating anywhere (link, back
  // button) makes it stale, which closes the menu without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  // The panel is portaled to <body>: inside the header, whose backdrop blur
  // makes it the containing block, "fixed" would pin it to the header box.
  // The portal target only exists on the client.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  // While open: no scrolling the page behind it (phones only, so resizing
  // up to desktop never leaves the page locked), and Escape closes.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("max-sm:overflow-hidden");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("max-sm:overflow-hidden");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Starts at the very top, behind the (translucent) header, so the header
  // reads solid while the menu is open; the links clear it with top padding.
  const panel = (
    <div
      id="mobile-menu"
      inert={!open}
      className={cn(
        "fixed inset-0 z-30 overflow-y-auto bg-background transition-[opacity,visibility] duration-300 sm:hidden",
        open ? "visible opacity-100" : "invisible opacity-0"
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
              "py-2 text-[28px] leading-tight font-semibold tracking-tight transition-[opacity,transform] duration-300 ease-out",
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
              pathname === l.href ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {l.label}
          </Link>
        ))}
        {canSignOut ? (
          <div
            style={{ transitionDelay: open ? `${60 + links.length * 40}ms` : "0ms" }}
            className={cn(
              "mt-8 flex items-center justify-between gap-4 border-t pt-6 transition-[opacity,transform] duration-300 ease-out",
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{roleLabel(user)}</div>
            </div>
            <button type="button" onClick={signOut} className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}>
              <LogOut />
              Sign out
            </button>
          </div>
        ) : null}
      </nav>
    </div>
  );

  return (
    <>
      <nav className="hidden items-center gap-1 text-sm sm:flex">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              pathname === l.href && "bg-muted font-medium text-foreground"
            )}
          >
            {l.label}
          </Link>
        ))}
        {canSignOut ? (
          <div className="ml-2">
            <UserMenu user={user} />
          </div>
        ) : null}
      </nav>

      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => (open ? close() : setOpenOn(pathname))}
        className={cn(buttonVariants({ variant: "outline", size: "icon" }), "relative sm:hidden")}
      >
        {/* Two bars that slide to the middle and cross into an ×. */}
        <span
          className={cn(
            "absolute h-[1.5px] w-4 rounded-full bg-current transition-transform duration-300 ease-out",
            open ? "rotate-45" : "-translate-y-[3.5px]"
          )}
        />
        <span
          className={cn(
            "absolute h-[1.5px] w-4 rounded-full bg-current transition-transform duration-300 ease-out",
            open ? "-rotate-45" : "translate-y-[3.5px]"
          )}
        />
      </button>

      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
