import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("border font-medium text-xs", {
  variants: {
    variant: {
      // Approval / Requisition
      draft: "border-border bg-muted text-slate-600 dark:text-neutral-400",
      pending_approval: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      approved: "border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
      rejected: "border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
      ordered: "border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",       // in-flight
      closed: "border-slate-300 dark:border-neutral-700 bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-400",
      // PO Status
      requested: "border-border bg-muted text-slate-700 dark:text-neutral-300",
      pending: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      completed: "border-emerald-200 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300", // done
      canceled: "border-slate-300 dark:border-neutral-700 bg-slate-200 dark:bg-neutral-700 text-muted-foreground",
      partially_fulfilled: "border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300",
      // Work Order Status
      open: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400",
      on_hold: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
      in_progress: "border-brand-200 dark:border-brand-800 bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300",
      done: "border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
      skipped: "border-border bg-muted text-muted-foreground",
      // Priority
      low: "border-border bg-muted text-slate-600 dark:text-neutral-400",
      medium: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400",
      high: "border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
      critical: "border-red-300 dark:border-red-700 bg-red-200 dark:bg-red-800/50 text-red-900 dark:text-red-200",
      // Product Category
      maintenance_part: "border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
      stocked_material: "border-teal-200 dark:border-teal-800 bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400",
      project_material: "border-orange-200 dark:border-orange-800 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
      // Project Status
      active: "border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
      on_hold_project: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      sold: "border-purple-200 dark:border-purple-800 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
      scheduled: "border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
      complete: "border-teal-200 dark:border-teal-800 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300",
      // Asset Status
      inactive: "border-border bg-muted text-slate-600 dark:text-neutral-400",
      in_shop: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      out_of_service: "border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
      disposed: "border-slate-300 dark:border-neutral-700 bg-slate-200 dark:bg-neutral-700 text-muted-foreground",
      // Maintenance Request Status
      in_review: "border-yellow-200 dark:border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
      converted: "border-green-200 dark:border-green-800 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
      // Damage Case Status
      resolved: "border-teal-200 dark:border-teal-800 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300",
    },
  },
});

interface StatusBadgeProps
  extends VariantProps<typeof statusBadgeVariants> {
  label: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(statusBadgeVariants({ variant }), className)}
    >
      {label}
    </Badge>
  );
}
