import { GuideSidebar } from "@/components/docs/GuideSidebar";
import { GuideBackButton } from "@/components/docs/GuideBackButton";

/**
 * Chrome around a single guide — persistent guide sidebar plus a Back bar —
 * shared by the guide route in every product shell (Equipt /docs/<slug>,
 * Landscapt /crm/docs/<slug>, Settings /settings/support/<slug>) so a guide
 * reads the same everywhere without leaving the app you opened it from.
 */
export function GuideShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[520px] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white shadow-sm print:block print:h-auto print:min-h-0 print:overflow-visible print:rounded-none print:border-none print:shadow-none">
      <aside className="hidden w-80 shrink-0 border-r border-slate-100 lg:flex lg:flex-col print:hidden">
        <GuideSidebar />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <GuideBackButton />
        <div className="flex-1 overflow-hidden print:block print:h-auto print:overflow-visible">{children}</div>
      </div>
    </div>
  );
}
