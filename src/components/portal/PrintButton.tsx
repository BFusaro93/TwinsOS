"use client";

interface PrintButtonProps {
  accent: string;
  backHref: string;
}

export default function PrintButton({ accent, backHref }: PrintButtonProps) {
  return (
    <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
      <a
        href={backHref}
        className="h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 flex items-center transition"
      >
        ← Back
      </a>
      <button
        onClick={() => window.print()}
        className="h-9 px-4 rounded-lg text-white text-sm font-medium flex items-center gap-2 transition"
        style={{ backgroundColor: accent }}
      >
        Download / Print
      </button>
    </div>
  );
}
