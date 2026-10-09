import Link from "next/link";
import { Film } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

// Any address that isn't a page: over the whole window, without the nav,
// with the sign-in page's bare header and the way back to the library in
// the middle (Next's default one is white).
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      <header className="shrink-0 border-b">
        <div className="flex h-12 items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Logo className="size-6" />
            Jellylens
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="font-num text-8xl font-medium text-muted-foreground/40 tabular-nums sm:text-9xl">404</p>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">The link may be old, or the page has moved.</p>
        <Link href="/movies" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          <Film />
          Go to Movies
        </Link>
      </main>
    </div>
  );
}
