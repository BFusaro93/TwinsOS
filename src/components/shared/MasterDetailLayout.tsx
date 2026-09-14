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
      {/* List panel — hidden on single-pane widths when an item is selected,
          hidden when expanded. The split only starts at lg: below that the
          440px list would leave the detail pane a sliver (portrait tablets),
          and it stays narrower until there's real room for both. */}
      <div
        className={cn(
          "flex w-full flex-col lg:w-[340px] xl:w-[400px] 2xl:w-[440px] lg:shrink-0 lg:border-r transition-all duration-200",
          (hasSelection && "hidden lg:flex"),
          expanded && "!hidden"
        )}
      >
        {listPanel}
      </div>

      {/* Detail panel — hidden at single-pane widths when no item is selected */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          !hasSelection && "hidden lg:flex"
        )}
      >
        {hasSelection ? (
          <>
            {/* Back button — single-pane widths only */}
            {onBack && (
              <div className="border-b px-3 py-2 lg:hidden">
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
