"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { ErrorAlert } from "@/components/error-alert";
import { cn, QUIET_FOCUS } from "@/lib/utils";

// As tall as a page's own search box (a finger's height on a phone).
const FIELD = "h-9 bg-transparent placeholder:text-muted-foreground/60 max-sm:h-11 dark:bg-transparent";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", jsonRequest("POST", { username, password }));
      // A full load, so the server-rendered header picks up the new session.
      window.location.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    // Placeholders instead of labels, like every other field in the app.
    <form onSubmit={submit} className="space-y-3">
      {error ? <ErrorAlert className="mb-4">{error}</ErrorAlert> : null}
      <Input
        name="username"
        placeholder="Username"
        aria-label="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        required
        className={cn(FIELD, QUIET_FOCUS)}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <div className="relative">
        <Input
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          className={cn(FIELD, "pr-9", QUIET_FOCUS)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      <Button
        type="submit"
        className="mt-1 h-9 w-full bg-clip-border font-bold max-sm:h-11 max-sm:text-base"
        disabled={busy}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" />
            <span className="sr-only">Signing in</span>
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
