import Link from "next/link";

/** Full-shell lockout for an ended trial or a canceled org past its read-only window — see useTrialStatus. */
export function AccessLockedScreen({ reason }: { reason: "trial" | "canceled" }) {
  const title = reason === "canceled" ? "Your subscription has ended" : "Your trial has ended";
  const body =
    reason === "canceled"
      ? "Your read-only access after canceling has run out. Resubscribe to keep using Landscapt and Equipt — your data is all still here."
      : "Your 30-day trial is over. Subscribe to a plan to keep using Landscapt and Equipt — your data is all still here.";

  return (
    <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{body}</p>
        <Link
          href="/settings?tab=subscription"
          className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Choose a plan
        </Link>
      </div>
    </div>
  );
}
