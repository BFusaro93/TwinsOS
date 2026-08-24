"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

interface AccessDeniedProps {
  title: string;
  message: string;
  href?: string;
  linkLabel?: string;
}

/** Shared "you can't be here" screen for role/permission-gated pages. */
export function AccessDenied({ title, message, href = "/home", linkLabel = "Go to Home" }: AccessDeniedProps) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <Link href={href} className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          {linkLabel} &rarr;
        </Link>
      </div>
    </div>
  );
}
