import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MasterDetailLayoutProps {
  listPanel: React.ReactNode;
  detailPanel: React.ReactNode;
  emptyState: React.ReactNode;
  hasSelection: boolean;
  expanded?: boolean;
  onBack?: () => void;
  className?: string;
}

export function MasterDetailLayout({
  listPanel,
  detailPanel,
  emptyState,
  hasSelection,
  expanded = false,
  onBack,
  className,
}: MasterDetailLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-full overflow-hidden rounded-lg border bg-white shadow-sm",
        className
      )}
    >
      {/* List panel — hidden on mobile when an item is selected, hidden when expanded */}
      <div
        className={cn(
          "flex w-full flex-col md:w-[440px] md:shrink-0 md:border-r transition-all duration-200",
          (hasSelection && "hidden md:flex"),
          expanded && "!hidden"
        )}
      >
        {listPanel}
      </div>

      {/* Detail panel — hidden on mobile when no item is selected */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          !hasSelection && "hidden md:flex"
        )}
      >
        {hasSelection ? (
          <>
            {/* Mobile back button */}
            {onBack && (
              <div className="border-b px-3 py-2 md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="gap-1.5 text-slate-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to list
                </Button>
              </div>
            )}
            {detailPanel}
          </>
        ) : (
          emptyState
        )}
      </div>
    </div>
  );
}
