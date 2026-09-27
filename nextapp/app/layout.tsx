import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jellylens",
  description: "Jellyfin library analyzer — missing episodes, mismatches, and library overview.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="flex min-h-svh flex-col bg-background text-foreground">
        <Providers>
          <header className="sticky top-0 z-40 shrink-0 border-b bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Logo className="size-7" />
                <span>Jellylens</span>
              </Link>
              <Nav />
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
