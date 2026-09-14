"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Returns to wherever the user came from — the Docs list in whichever shell (Settings, Equipt, Landscapt) they started in. */
export function GuideBackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 print:hidden"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back
    </button>
  );
}
