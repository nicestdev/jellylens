import type { Metadata, Viewport } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/toaster";
import { EventToasts } from "@/components/event-toasts";
import { MobileBar, Sidebar } from "@/components/nav";
import { currentUser } from "@/lib/auth";
import { AUTH_ENABLED } from "@/lib/env";

// The fonts are downloaded once at build time and served by Jellylens itself
// (the CSP allows fonts only from 'self'); browsers never ask Google.
// Google Sans and Google Sans Code, the Mono drawn from the Sans, so the
// Mono data beside the text doesn't stand out.
// next/font has no metrics to size a fallback like them (it warns at
// build), so a plain one while they load.
const uiSans = Google_Sans({
  variable: "--font-ui-sans",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});
const uiMono = Google_Sans_Code({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Jellylens",
  description: "See what's missing from your Jellyfin library: missing episodes and seasons, wishlists and releases.",
};

// The browser's own bars (Android, iOS before 26) in the sidebar's color,
// like the phone's top bar (--p-mantle in app/themes.css).
// cover: on a phone on its side the bars' colors run into the rounded
// corners and past the notch; px-safe keeps what's on them clear of both.
export const viewport: Viewport = { themeColor: "#13101c", viewportFit: "cover" };

// modal: a title's page opened over a list (app/@modal), null otherwise.
export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // null only on the sign-in page, which has no nav (its card has the logo).
  const user = await currentUser();
  return (
    <html lang="en" className={`dark ${uiSans.variable} ${uiMono.variable} antialiased`}>
      <body className="min-h-svh bg-background text-foreground">
        {user ? (
          <div className="flex min-h-svh">
            <Sidebar user={user} canSignOut={AUTH_ENABLED} />
            <div className="flex min-w-0 flex-1 flex-col px-safe">
              <MobileBar user={user} canSignOut={AUTH_ENABLED} />
              {children}
              <Footer />
            </div>
            {modal}
            <Toaster />
            {user.admin ? <EventToasts /> : null}
          </div>
        ) : (
          <div className="flex min-h-svh flex-col">
            {children}
            <Footer />
          </div>
        )}
      </body>
    </html>
  );
}
