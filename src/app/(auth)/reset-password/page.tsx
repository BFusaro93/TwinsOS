"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  // Exchange the token_hash from the email link for a live session.
  // Handles both password reset (type=recovery) and new user invites (type=invite).
  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    if (!tokenHash || (type !== "recovery" && type !== "invite")) {
      setInvalidLink(true);
      setVerifying(false);
      return;
    }

    const supabase = createClient();
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "invite" })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError("This link has expired or is invalid. Please ask your admin to send a new invite.");
          setInvalidLink(true);
        }
        setVerifying(false);
      });
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      {verifying ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : invalidLink ? (
        <div className="flex flex-col gap-3 py-2 text-center">
          <p className="text-sm text-red-600">{error ?? "Invalid reset link."}</p>
          <Link
            href="/forgot-password"
            className="text-sm text-brand-600 hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="Repeat your new password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? "Updating…" : "Update Password"}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          <Leaf className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Set Your Password</h1>
        <p className="text-sm text-slate-500">Choose a password to activate your account</p>
      </div>

      <Suspense fallback={
        <div className="rounded-xl border bg-white p-6 shadow-sm flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>

      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
