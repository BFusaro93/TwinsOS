"use client";

import Link from "next/link";
import { BarChart2, Wrench, Leaf, FileText, Truck, Users, ExternalLink, ClipboardList } from "lucide-react";

const INTERNAL_BOX =
  "group flex flex-col items-center gap-5 rounded-2xl border-2 border-slate-200 bg-white p-10 shadow-sm transition-all duration-150 hover:border-brand-400 hover:shadow-lg";

const EXTERNAL_BOX =
  "group flex flex-col items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm transition-all duration-150 hover:border-slate-400 hover:shadow-lg";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 p-6">
      {/* Logo / header */}
      <div className="mb-12 flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-md">
          <Leaf className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Equipt</h1>
        <p className="text-sm text-slate-500">Select a section to get started</p>
      </div>

      {/* Primary app boxes */}
      <div className="grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        <Link href="/dashboards/avb" className={INTERNAL_BOX}>
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <BarChart2 className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Dashboards</p>
            <p className="mt-1 text-sm text-slate-500">Custom reports &amp; analytics</p>
          </div>
        </Link>

        <Link href="/dashboard" className={INTERNAL_BOX}>
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <Wrench className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Equipt</p>
            <p className="mt-1 text-sm text-slate-500">Work orders, purchasing &amp; asset management</p>
          </div>
        </Link>

        <a
          href="https://claude.ai/artifacts/latest/d640bf7c-8328-40e7-8255-f780f6055a19"
          target="_blank"
          rel="noopener noreferrer"
          className={INTERNAL_BOX}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-100">
            <FileText className="h-8 w-8" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-900">Estimate Writer</p>
            <p className="mt-1 text-sm text-slate-500">Generate estimate text &amp; language</p>
          </div>
        </a>
      </div>

      {/* External app shortcuts */}
      <div className="mt-5 grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
        <a
          href="https://my.serviceautopilot.com/UserLogin.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_BOX}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold text-slate-700">Service Autopilot</p>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">CRM &amp; job management</p>
          </div>
        </a>

        <a
          href="https://launcher.myapps.microsoft.com/api/signin/f92a2fea-344f-41bc-9293-72562ec4ee57?tenantId=c32bfd53-52c9-4186-989f-1985ff7eb8ae"
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_BOX}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <Truck className="h-6 w-6" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold text-slate-700">Samsara</p>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Fleet &amp; driver safety</p>
          </div>
        </a>

        <a
          href="https://app.gusto.com/login"
          target="_blank"
          rel="noopener noreferrer"
          className={EXTERNAL_BOX}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-slate-200">
            <Users className="h-6 w-6" />
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <p className="text-base font-semibold text-slate-700">Gusto</p>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Payroll &amp; HR</p>
          </div>
        </a>
      </div>
    </div>
  );
}
