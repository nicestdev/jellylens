import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/toaster";
import { Logo } from "@/components/logo";
import { MobileBar, Sidebar } from "@/components/nav";
import { currentUser } from "@/lib/auth";
import { AUTH_ENABLED } from "@/lib/env";

// The fonts are downloaded once at build time and served by Jellylens itself
// (the CSP allows fonts only from 'self'); browsers never ask Google.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Jellylens",
  description:
    "See what's missing from your Jellyfin library: missing episodes, incomplete movie collections, mismatches, wishlists and releases.",
};

// modal: a title's page opened over a list (app/@modal), null otherwise.
export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  // null only on the sign-in page, which gets the bare header.
  const user = await currentUser();
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-svh bg-background text-foreground">
        {user ? (
          <div className="flex min-h-svh">
            <Sidebar user={user} canSignOut={AUTH_ENABLED} />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileBar user={user} canSignOut={AUTH_ENABLED} />
              {children}
              <Footer />
            </div>
            {modal}
            <Toaster />
          </div>
        ) : (
          <div className="flex min-h-svh flex-col">
            <header className="shrink-0 border-b">
              <div className="flex h-12 items-center px-4 sm:px-6">
                <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
                  <Logo className="size-6" />
                  Jellylens
                </Link>
              </div>
            </header>
            {children}
            <Footer />
          </div>
        )}
      </body>
    </html>
  );
}
