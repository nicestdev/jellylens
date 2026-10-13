import Link from "next/link";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";

// Any address that isn't a page: over the whole window, without the nav but
// with the footer. Like the sign-in page, on the plain background: a big 404
// with the logo for its 0, which is the way back to the start page (/)
// (Next's default one is white).
export default function NotFound() {
  return (
    <div data-bare className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-sidebar px-safe">
      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-10 pb-10">
        <h1 className="sr-only">Page not found</h1>
        {/* The 404 with the logo for its 0, which is also the way home. The lens (not
            the handle) is the 0: as tall as the 4s, on their middle, the same space
            to both, the handle reaching into the one on the right. */}
        <div className="flex items-center gap-2 font-mono text-9xl leading-none font-medium text-primary">
          <span aria-hidden>4</span>
          <Link href="/" aria-label="Jellylens, home" className="-mr-[1.1rem] translate-y-[0.3rem]">
            <Logo className="size-[7.5rem]" />
          </Link>
          <span aria-hidden>4</span>
        </div>
      </main>
      <Footer />
    </div>
  );
}
