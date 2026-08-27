import { GuideSidebar } from "@/components/docs/GuideSidebar";
import { GuideBackButton } from "@/components/docs/GuideBackButton";

// Route group — doesn't affect URLs (guides still live at
// /settings/support/<slug>), just wraps every guide page in a persistent
// sidebar shell so navigating between guides feels like one app instead of
// separate pages. Does NOT wrap the Support index or the library page,
// which aren't in this group.
export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[75vh] max-h-[900px] min-h-[520px] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white shadow-sm print:block print:h-auto print:max-h-none print:min-h-0 print:overflow-visible print:rounded-none print:border-none print:shadow-none">
      <aside className="hidden w-64 shrink-0 border-r border-slate-100 lg:flex lg:flex-col print:hidden">
        <GuideSidebar />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <GuideBackButton />
        <div className="flex-1 overflow-hidden print:block print:h-auto print:overflow-visible">{children}</div>
      </div>
    </div>
  );
}
