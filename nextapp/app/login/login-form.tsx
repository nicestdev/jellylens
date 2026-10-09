"use client";

import { useState } from "react";
import { AlertCircle, LockOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, jsonRequest } from "@/lib/api-client";

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">Username</span>
        <Input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">Password</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <Button type="submit" className="w-full" disabled={busy || !username.trim()}>
        <LockOpen />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
