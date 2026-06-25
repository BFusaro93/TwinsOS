import type { ReactNode } from "react";

// Crew app uses its own stripped-down layout — no sidebar, mobile-first shell.
// The full CRM layout wrapping still applies (auth, realtime), but this nested
// layout replaces the sidebar + topbar with a minimal header.
export default function CrewAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col max-w-lg mx-auto">
      {children}
    </div>
  );
}
