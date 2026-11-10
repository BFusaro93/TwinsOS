"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@/lib/hooks/use-query";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  // An invite link (type=invite, or a re-sent invite that fell back to a
  // recovery link — marked invite=1) carries the invitee's user id, so an
  // already-used link can say "you're already set up" instead of "ask your
  // admin for a new invite".
  const isInviteLink = searchParams.get("type") === "invite" || searchParams.get("invite") === "1";
  const inviteUid = searchParams.get("uid");
  const { data: inviteStatus, isLoading: inviteStatusLoading } = useQuery<{ active: boolean }>({
    queryKey: ["invite-status", inviteUid],
    queryFn: async () => {
      const res = await fetch(`/api/auth/invite-status?uid=${encodeURIComponent(inviteUid ?? "")}`);
      if (!res.ok) return { active: false };
      return (await res.json()) as { active: boolean };
    },
    enabled: invalidLink && isInviteLink && !!inviteUid,
    retry: false,
  });
  const alreadySetUp = isInviteLink && (signedIn || inviteStatus?.active === true);

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
      .then(async ({ error: verifyError }) => {
        if (verifyError) {
          const invite = type === "invite" || searchParams.get("invite") === "1";
          setError(
            invite
              ? "This invite link has expired or was already used. If you haven't set up your account yet, ask your admin to send a new invite."
              : "This reset link has expired or was already used. Request a new one below."
          );
          setInvalidLink(true);
          // Opened again in the browser they set up their account in: they are
          // signed in already.
          const { data } = await supabase.auth.getUser();
          if (data.user) setSignedIn(true);
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
    const { data: updated, error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Client-portal users have no staff app to land in — /home would bounce
    // them straight back out. Read it off the account rather than the link, so
    // this holds however they got here.
    const isPortalUser = !!updated?.user?.user_metadata?.portal;
    router.push(isPortalUser ? "/portal" : "/home");
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      {verifying || (invalidLink && isInviteLink && !!inviteUid && inviteStatusLoading) ? (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : invalidLink && alreadySetUp ? (
        <div className="flex flex-col gap-3 py-2 text-center">
          <p className="text-sm text-slate-700">You&apos;re already set up — this invite link has been used.</p>
          <Link href={signedIn ? "/home" : "/login"} className="text-sm font-medium text-brand-600 hover:underline">
            {signedIn ? "Go to the app" : "Sign in"}
          </Link>
          <Link href="/forgot-password" className="text-xs text-slate-500 hover:underline">
            Forgot your password?
          </Link>
        </div>
      ) : invalidLink ? (
        <div className="flex flex-col gap-3 py-2 text-center">
          <p className="text-sm text-red-600">{error ?? "Invalid reset link."}</p>
          {isInviteLink ? (
            <Link href="/login" className="text-sm text-brand-600 hover:underline">
              Already set your password? Sign in
            </Link>
          ) : (
            <Link
              href="/forgot-password"
              className="text-sm text-brand-600 hover:underline"
            >
              Request a new reset link
            </Link>
          )}
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
        <BrandMark variant="color" className="h-12 w-12 rounded-xl" />
        <h1 className="text-2xl font-extrabold tracking-tight text-[#005642]">landscapt</h1>
        <p className="text-sm font-medium text-slate-700">Set Your Password</p>
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
