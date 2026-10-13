import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { safeNext } from "@/lib/session";
import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

// No nav here: the logo and name on top of the form, on the plain background. In `next dev` it
// stays open signed in and with sign-in off too, to look at; the layout's
// nav is there then, so it goes over the whole window like the 404.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  const preview = process.env.NODE_ENV === "development";
  if (user && !preview) redirect(next);

  const page = (
    <main className="flex flex-1 flex-col items-center justify-center px-4 pt-10 pb-10">
      <div className="w-full max-w-[20rem] sm:max-w-[15rem]">
        <div className="flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-5 text-2xl font-medium">Sign in to Jellylens</h1>
          <p className="mt-1 text-sm text-muted-foreground">With your Jellyfin account</p>
        </div>
        <div className="mt-8">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
  // Signed out, the layout has no nav and adds the footer itself.
  if (!user) return page;
  return (
    <div data-bare className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-sidebar px-safe">
      {page}
      <Footer />
    </div>
  );
}
