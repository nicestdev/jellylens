"use client";

import { useSyncExternalStore } from "react";
import { BellRing, FlaskConical, ShieldCheck } from "lucide-react";
import { DEV_NON_ADMIN_COOKIE } from "@/lib/dev-cookie";
import { installMockFetch, mockOn, setMock } from "@/lib/mock/fetch";
import { toast, type ToastTone } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Only in `next dev`: answers the Queue's and Settings' data from
// lib/mock/fetch.ts while Mock data is on. Installed as the sidebar loads,
// before any page asks for its data.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") installMockFetch();

// Every note the app shows, as it shows it (the client's toast() calls and
// lib/events.ts' notify() ones), with made-up text.
const SAMPLES: [
  string,
  { description?: string; mono?: boolean; tone: ToastTone; action?: { label: string; href: string } },
][] = [
  [
    "Download started",
    {
      description: "Heat.1995.German.DL.1080p.BluRay.x264-GROUP",
      mono: true,
      tone: "success",
      action: { label: "View", href: "/queue" },
    },
  ],
  [
    "Needs attention",
    {
      description: "Arrival.2016.German.DL.1080p.BluRay.x264-SPiCY",
      mono: true,
      tone: "warning",
      action: { label: "View", href: "/queue" },
    },
  ],
  [
    "Behind a captcha: the lock opens it",
    { description: "Nosferatu.2024.German.DL.1080p.WEB.H264-ZeroTwo", mono: true, tone: "warning" },
  ],
  ["No mirror online", { description: "Flow.2024.German.DL.1080p.BluRay.x264-ROCKEFELLER", mono: true, tone: "error" }],
  ["Ready to organize", { description: "Dune: Part Two (2024)", mono: true, tone: "success" }],
  ["Download failed", { description: "Anora (2024): Wrong archive password", mono: true, tone: "error" }],
  ["Not moved", { description: "Conclave (2024): the library has it already", tone: "warning" }],
  ["Move failed", { description: "Wicked (2024): No space left on device", tone: "error" }],
  ["TMDB sync failed", { description: "fetch failed", tone: "error" }],
  ["Couldn't check its mirrors", { description: "Request timed out", tone: "error" }],
  ["Couldn't change the match", { description: "TMDB has no movie 974576", tone: "error" }],
];

// One after another, so each is seen (three show at a time).
function testToasts() {
  SAMPLES.forEach(([title, options], i) => setTimeout(() => toast(title, options), i * 700));
}

// Off on the server; the browser's choice once it's there (it only
// changes with a reload, setMock).
function useMockOn() {
  return useSyncExternalStore(
    () => () => {},
    mockOn,
    () => null,
  );
}

// Admin on or off: a cookie the server reads in `next dev` (lib/auth.ts,
// proxy.ts), so the page loads again as the other kind of user.
const adminOff = () => document.cookie.split("; ").includes(`${DEV_NON_ADMIN_COOKIE}=1`);
function setAdmin(on: boolean) {
  document.cookie = `${DEV_NON_ADMIN_COOKIE}=${on ? "; max-age=0" : "1"}; path=/`;
  location.reload();
}
function useAdminOn() {
  return useSyncExternalStore(
    () => () => {},
    () => !adminOff(),
    () => null,
  );
}

// The sidebar's Dev section, above Sign out: Mock data on or off (the page
// loads again) and Test toasts. Nothing in a production build.
export function DevTools({ itemClass }: { itemClass: string }) {
  const on = useMockOn();
  const admin = useAdminOn();
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="flex flex-col gap-px">
      <span className="px-2 pb-1 text-xs text-muted-foreground">Dev</span>
      <button
        type="button"
        disabled={on === null}
        onClick={() => setMock(!on)}
        className={cn(itemClass, "w-full text-left")}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <FlaskConical className="size-4 shrink-0 opacity-70" />
          Mock data
        </span>
        <span className="text-xs text-muted-foreground">{on ? "On" : "Off"}</span>
      </button>
      <button
        type="button"
        disabled={admin === null}
        onClick={() => setAdmin(!admin)}
        className={cn(itemClass, "w-full text-left")}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="size-4 shrink-0 opacity-70" />
          Admin
        </span>
        <span className="text-xs text-muted-foreground">{admin ? "On" : "Off"}</span>
      </button>
      <button type="button" onClick={testToasts} className={cn(itemClass, "w-full justify-start gap-2.5 text-left")}>
        <BellRing className="size-4 shrink-0 opacity-70" />
        Test toasts
      </button>
    </div>
  );
}

// The same in the phone menu, without a heading: three more buttons above
// Sign out, read like it and spaced like it.
export function MobileDevTools({ itemClass }: { itemClass: string }) {
  const on = useMockOn();
  const admin = useAdminOn();
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <>
      <button type="button" disabled={on === null} onClick={() => setMock(!on)} className={itemClass}>
        Mock data <span className="text-base font-normal">{on ? "On" : "Off"}</span>
      </button>
      <button type="button" disabled={admin === null} onClick={() => setAdmin(!admin)} className={itemClass}>
        Admin <span className="text-base font-normal">{admin ? "On" : "Off"}</span>
      </button>
      <button type="button" onClick={testToasts} className={itemClass}>
        Test toasts
      </button>
    </>
  );
}
