"use client";

import Link from "next/link";
import { BarChart2, Wrench, Leaf } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      {/* Logo / header */}
      <div className="mb-12 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-md">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">TwinsOS</h1>
        <p className="text-sm text-slate-500">Select a section to get started</p>
      </div>

      {/* Selector boxes */}
      <div className="grid w-full max-w-xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Link
          href="/dashboards/avb"
          className="group flex flex-col items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-10 shadow-sm transition-all duration-150 hover:border-brand-400 hover:shadow-lg"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <BarChart2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Dashboards</p>
            <p className="mt-1 text-sm text-slate-500">Custom reports &amp; analytics</p>
          </div>
        </Link>

        <Link
          href="/dashboard"
          className="group flex flex-col items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-10 shadow-sm transition-all duration-150 hover:border-brand-400 hover:shadow-lg"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <Wrench className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">CMMS System</p>
            <p className="mt-1 text-sm text-slate-500">Work orders, purchasing &amp; maintenance</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
