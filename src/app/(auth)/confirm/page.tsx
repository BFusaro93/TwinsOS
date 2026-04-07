"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Leaf, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;

    if (!tokenHash || !type) {
      setStatus("error");
      setMessage("Invalid confirmation link.");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(async ({ error }) => {
        if (error) {
          setStatus("error");
          setMessage("This link has expired or is invalid. Please try again.");
          return;
        }

        // For email_change, sync the new email from auth.users → profiles table.
        if (type === "email_change") {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.email) {
            await supabase
              .from("profiles")
              .update({ email: user.email })
              .eq("id", user.id);
          }
          setMessage("Your email address has been updated successfully.");
        } else if (type === "signup") {
          setMessage("Your email has been confirmed. Taking you to the app…");
        } else {
          setMessage("Confirmed. Taking you to the app…");
        }

        setStatus("success");
        setTimeout(() => router.push("/dashboard"), 2500);
      });
  }, [searchParams, router]);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm text-center flex flex-col items-center gap-4">
      {status === "verifying" && (
        <>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Confirming your request…</p>
        </>
      )}

      {status === "success" && (
        <>
          <CheckCircle className="h-10 w-10 text-green-500" />
          <p className="text-sm text-slate-700">{message}</p>
          <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
            Go to dashboard
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <XCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm text-red-600">{message}</p>
          <Link href="/settings" className="text-sm text-brand-600 hover:underline">
            Back to settings
          </Link>
        </>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          <Leaf className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Confirming…</h1>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border bg-white p-6 shadow-sm flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        }
      >
        <ConfirmContent />
      </Suspense>
    </div>
  );
}
