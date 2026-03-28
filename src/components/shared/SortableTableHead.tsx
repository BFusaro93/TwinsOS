import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortDir: "asc" | "desc";
  onToggle: (key: string) => void;
  className?: string;
}

export function SortableTableHead({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onToggle,
  className,
}: SortableTableHeadProps) {
  const isActive = sortKey === activeSortKey;

  return (
    <TableHead className={cn("select-none", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 text-xs font-medium hover:text-slate-900"
      >
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-slate-300" />
        )}
      </button>
    </TableHead>
  );
}
