import { redirect } from "next/navigation";
import { AUTH_ENABLED } from "@/lib/env";
import { currentUser } from "@/lib/auth";
import { safeNext } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (!AUTH_ENABLED || (await currentUser())) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">With your Jellyfin account.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
