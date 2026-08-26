export function BrowserFrame({
  tabs,
  activeTab,
  children,
}: {
  tabs: string[];
  activeTab: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-5 bg-[#0a0a0a] px-4 py-3 text-xs text-[#8a8a84]">
        <div className="mr-1 flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a36]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a36]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a36]" />
        </div>
        {tabs.map((t) => (
          <span key={t} className={t === activeTab ? "font-semibold text-white" : ""}>
            {t}
          </span>
        ))}
      </div>
      <div className="max-h-[460px] overflow-hidden bg-white">{children}</div>
    </div>
  );
}
