"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Leaf, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Step = "form" | "confirm";

export default function SignupPage() {
  const router = useRouter();

  const [companyName, setCompanyName] = useState("");
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [step, setStep]               = useState<Step>("form");

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!companyName.trim()) return "Company name is required.";
    if (!name.trim())        return "Your name is required.";
    if (!email.trim())       return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // Step 1: create the organization row via the API route (requires service role).
      const orgRes = await fetch("/api/orgs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: companyName.trim() }),
      });
      const orgData = await orgRes.json();
      if (!orgRes.ok) {
        setError(orgData.error ?? "Failed to create organization.");
        return;
      }
      const { orgId } = orgData as { orgId: string };

      // Step 2: sign up the user. The handle_new_user trigger reads org_id,
      // name, and role from user_metadata and creates an admin profile row.
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            org_id: orgId,
            name: name.trim(),
            role: "admin",
          },
        },
      });

      if (signUpError) {
        // Org was created but signup failed — inform the user so they can
        // try again or contact support. Orphaned orgs can be cleaned up
        // in the Supabase dashboard.
        setError(signUpError.message);
        return;
      }

      // Success — show confirmation screen.
      setStep("confirm");
    } finally {
      setLoading(false);
    }
  }

  // ── Confirmation screen ─────────────────────────────────────────────────────

  if (step === "confirm") {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
            <Leaf className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">TwinsOS</h1>
        </div>

        <div className="rounded-xl border bg-white p-8 shadow-sm text-center flex flex-col items-center gap-4">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
            <p className="mt-1 text-sm text-slate-500">
              We sent a confirmation link to <strong>{email}</strong>. Click it
              to activate your account, then sign in.
            </p>
          </div>
          <Button
            className="w-full bg-brand-500 hover:bg-brand-600"
            onClick={() => router.push("/login")}
          >
            Go to Sign In
          </Button>
        </div>
      </div>
    );
  }

  // ── Sign-up form ────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          <Leaf className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">TwinsOS</h1>
        <p className="text-sm text-slate-500">Create your organization</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          You&apos;ll be set up as the admin of your new workspace.
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Company */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company">Company Name</Label>
            <Input
              id="company"
              placeholder="Acme Landscaping"
              autoComplete="organization"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              placeholder="Jane Smith"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Work Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="jane@acme.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="border-t pt-1" />

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Confirm */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="Re-enter password"
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
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating workspace…
              </>
            ) : (
              "Create Workspace"
            )}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Already have an account?{" "}
        <a href="/login" className="text-brand-600 hover:underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
