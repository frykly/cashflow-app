"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const raw = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !raw.ok) {
        setError(raw.error ?? "Logowanie nie powiodło się.");
        return;
      }
      const dest =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Logowanie</h1>
        <p className="mt-1 text-sm text-zinc-500">Wprowadź email i hasło konta administratora.</p>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Field label="Email">
        <Input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          required
        />
      </Field>
      <Field label="Hasło">
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Logowanie…" : "Zaloguj"}
      </Button>
    </form>
  );
}
