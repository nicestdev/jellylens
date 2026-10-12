"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { ErrorAlert } from "@/components/error-alert";

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
    <form onSubmit={submit} className="space-y-2">
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
          className="pr-8"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((s) => !s)}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      <Button type="submit" variant="outline" className="mt-2 w-full" disabled={busy || !username.trim()}>
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
