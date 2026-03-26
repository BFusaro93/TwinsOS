import { cn } from "@/lib/utils";

interface MasterDetailLayoutProps {
  listPanel: React.ReactNode;
  detailPanel: React.ReactNode;
  emptyState: React.ReactNode;
  hasSelection: boolean;
  className?: string;
}

export function MasterDetailLayout({
  listPanel,
  detailPanel,
  emptyState,
  hasSelection,
  className,
}: MasterDetailLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-full overflow-hidden rounded-lg border bg-white shadow-sm",
        className
      )}
    >
      {/* List panel */}
      <div className="flex w-[380px] shrink-0 flex-col border-r">
        {listPanel}
      </div>

      {/* Detail panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {hasSelection ? detailPanel : emptyState}
      </div>
    </div>
  );
}
