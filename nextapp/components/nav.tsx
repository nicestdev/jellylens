"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

const links: { href: string; label: string }[] = [
  { href: "/movies", label: "Movies" },
  { href: "/shows", label: "TV Shows" },
  { href: "/missing", label: "Missing" },
  { href: "/requests", label: "Requests" },
  { href: "/settings", label: "Settings" },
];

// Inline links from sm up. On phones, apple.com-style: a two-line button
// that morphs into an ×, opening a full-screen panel under the header with
// large links that fade in one after another.
export function Nav() {
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
