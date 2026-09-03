"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Only ever follow `redirectTo` back into our own app — a same-origin
 *  relative path set by middleware.ts. Rejects absolute/protocol-relative
 *  URLs so a crafted `?redirectTo=` can't be used as an open redirect. */
function safeRedirectTarget(redirectTo: string | null): string {
  if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }
  return "/home";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    router.push(safeRedirectTarget(searchParams.get("redirectTo")));
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-2">
        <BrandMark variant="color" className="h-12 w-12 rounded-xl" />
        <h1 className="text-2xl font-extrabold tracking-tight text-[#005642]">landscapt</h1>
        <p className="text-sm text-slate-500">Sign in to your account</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <a href="/forgot-password" className="text-xs text-brand-600 hover:underline">
                Forgot password?
              </a>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="mt-1 w-full bg-brand-500 hover:bg-brand-600"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Need access?{" "}
        <a href="/signup" className="text-brand-600 hover:underline">
          Create a new organization
        </a>{" "}
        or contact your administrator.
      </p>
    </div>
  );
}
