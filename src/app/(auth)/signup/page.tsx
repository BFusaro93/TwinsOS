"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, CheckCircle2, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { BillablePlan } from "@/lib/stripe/plans";
import { getHighlightsForPlan } from "@/lib/stripe/plan-features";
import type { BillingPlanInfo } from "@/app/api/billing/plans/route";

type Step = "plan" | "form" | "confirm";

function formatPrice(amountCents: number | null, currency: string | null, interval: string | null): string | null {
  if (amountCents == null || !currency) return null;
  const amount = (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  return interval ? `${amount}/${interval}` : amount;
}

export default function SignupPage() {
  const router = useRouter();

  const [plans, setPlans] = useState<BillingPlanInfo[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<BillablePlan | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [step, setStep]               = useState<Step>("plan");

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.stripeEnabled) setPlans(body.plans);
      })
      .catch(() => {
        // Plan pricing is a nice-to-have here — signup still works with the
        // default "start free trial" option if this fails.
      });
  }, []);

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
        body: JSON.stringify({ companyName: companyName.trim(), plan: selectedPlan }),
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

  // ── Plan picker ─────────────────────────────────────────────────────────────

  if (step === "plan") {
    return (
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-2">
          <BrandMark variant="color" className="h-12 w-12 rounded-xl" />
          <h1 className="text-2xl font-extrabold tracking-tight text-[#005642]">landscapt</h1>
          <p className="text-sm text-slate-500">Choose how you&apos;d like to get started</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => setSelectedPlan(null)}
            className={`flex flex-col rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-colors ${
              selectedPlan === null ? "border-brand-500" : "border-transparent hover:border-slate-200"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Recommended</p>
            <p className="mt-1 text-lg font-bold text-slate-900">30-Day Free Trial</p>
            <p className="mt-1 text-xs text-slate-500">Full access to Landscapt and Equipt — no card required. Pick a plan any time.</p>
          </button>

          {plans.map((p) => {
            const priceLabel = p.configured ? formatPrice(p.amountCents, p.currency, p.interval) : null;
            return (
              <button
                key={p.plan}
                type="button"
                onClick={() => setSelectedPlan(p.plan as BillablePlan)}
                className={`flex flex-col rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-colors ${
                  selectedPlan === p.plan ? "border-brand-500" : "border-transparent hover:border-slate-200"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{priceLabel ?? "Contact us"}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {getHighlightsForPlan(p.plan as BillablePlan)
                    .slice(0, 3)
                    .map((h) => (
                      <li key={h} className="flex items-start gap-1 text-xs text-slate-600">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" />
                        {h}
                      </li>
                    ))}
                </ul>
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          {selectedPlan
            ? "You'll create your account first, then confirm your email and check out."
            : "You can subscribe to a paid plan any time from Settings → Subscription."}
        </p>

        <Button className="mt-4 w-full bg-brand-500 hover:bg-brand-600" onClick={() => setStep("form")}>
          Continue
        </Button>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <a href="/login" className="text-brand-600 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    );
  }

  // ── Confirmation screen ─────────────────────────────────────────────────────

  if (step === "confirm") {
    return (
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <BrandMark variant="color" className="h-12 w-12 rounded-xl" />
          <h1 className="text-2xl font-extrabold tracking-tight text-[#005642]">landscapt</h1>
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
        <BrandMark variant="color" className="h-12 w-12 rounded-xl" />
        <h1 className="text-2xl font-extrabold tracking-tight text-[#005642]">landscapt</h1>
        <p className="text-sm text-slate-500">Create your organization</p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          You&apos;ll be set up as the admin of your new workspace.
        </div>

        <button
          type="button"
          onClick={() => setStep("plan")}
          className="mb-4 text-xs font-medium text-brand-600 hover:underline"
        >
          &larr; {selectedPlan ? `Change plan (${plans.find((p) => p.plan === selectedPlan)?.label ?? selectedPlan})` : "Change plan (30-day free trial)"}
        </button>

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
