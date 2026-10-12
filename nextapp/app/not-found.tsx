import Link from "next/link";
import { House } from "lucide-react";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

// Any address that isn't a page: over the whole window, without the nav but
// with the footer. The sign-in page's card, with the 404 and the way back to
// the start page, / (Next's default one is white).
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-safe">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-[26rem] flex-col items-center rounded-lg border bg-card px-8 py-10 text-center shadow-2xl shadow-black/40">
          <Link href="/" aria-label="Jellylens">
            <Logo className="size-12" />
          </Link>
          <h1 className="sr-only">Page not found</h1>
          <p className="mt-4 font-mono text-7xl font-medium text-muted-foreground/40">404</p>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-8 w-full" })}>
            <House />
            Go to home
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
