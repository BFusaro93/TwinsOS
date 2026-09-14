"use client";

import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared visual language for docs/support surfaces, pulled from the Landscapt
// brand guidelines (deep green / lime / grass green) — the same palette and
// heading face used on the public marketing site (src/app/help/page.tsx,
// src/components/marketing/*), so in-app docs read as the same product.

export const docsHeading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

/** Wrap any docs page in this to load the heading font as `var(--font-heading)`. */
export function DocsFontScope({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(docsHeading.variable, className)}>{children}</div>;
}

export function DownloadPdfButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 print:hidden",
        className
      )}
    >
      <Download className="h-3.5 w-3.5" />
      Download PDF
    </button>
  );
}

export function DocsHero({
  kicker,
  title,
  description,
  action,
  hideDownload,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Set true to omit the default "Download PDF" button (e.g. on the library index, which isn't a single-guide page). */
  hideDownload?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#005642] px-6 py-8 md:px-10 md:py-10 print:rounded-none print:px-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">
        {kicker}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold text-white sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#cfe6d8]">{description}</p>
          )}
        </div>
        {(action || !hideDownload) && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {action}
            {!hideDownload && <DownloadPdfButton />}
          </div>
        )}
      </div>
    </div>
  );
}

export function DocsEyebrow({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-[family-name:var(--font-heading)] text-xs font-bold uppercase tracking-wide text-[#60ab45]">
      {children}
    </h2>
  );
}

export function TOCLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="block text-sm text-[#60ab45] hover:text-[#4a8a33] hover:underline">
      {children}
    </a>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-[#e6e6e0] bg-white p-6 shadow-sm">
      <h2 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#4a4a46]">{children}</div>
    </section>
  );
}

export function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export function Chip({ instant }: { instant: boolean }) {
  return (
    <span
      className={
        instant
          ? "inline-flex rounded-full bg-[#e2f6d8] px-2 py-0.5 text-xs font-medium text-[#396927]"
          : "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
      }
    >
      {instant ? "Instant" : "Polling"}
    </span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#e6e6e0]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TableHeadRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-[#e6e6e0] bg-[#f4f6f0] text-left text-xs uppercase tracking-wide text-[#5a5a56]">
      {children}
    </tr>
  );
}
