import { cva, type VariantProps } from "class-variance-authority";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("border font-medium text-xs", {
  variants: {
    variant: {
      // Approval / Requisition
      draft: "border-slate-200 bg-slate-100 text-slate-600",
      pending_approval: "border-yellow-200 bg-yellow-100 text-yellow-800",
      approved: "border-green-200 bg-green-100 text-green-800",
      rejected: "border-red-200 bg-red-100 text-red-800",
      ordered: "border-blue-200 bg-blue-100 text-blue-800",       // in-flight
      closed: "border-slate-300 bg-slate-200 text-slate-600",
      // PO Status
      requested: "border-slate-200 bg-slate-100 text-slate-700",
      pending: "border-yellow-200 bg-yellow-100 text-yellow-800",
      completed: "border-emerald-200 bg-emerald-100 text-emerald-800", // done
      canceled: "border-slate-300 bg-slate-200 text-slate-500",
      partially_fulfilled: "border-orange-200 bg-orange-100 text-orange-800",
      // Work Order Status
      open: "border-blue-200 bg-blue-50 text-blue-700",
      on_hold: "border-yellow-200 bg-yellow-100 text-yellow-700",
      in_progress: "border-brand-200 bg-brand-100 text-brand-800",
      done: "border-green-200 bg-green-100 text-green-800",
      // Priority
      low: "border-slate-200 bg-slate-100 text-slate-600",
      medium: "border-yellow-200 bg-yellow-100 text-yellow-700",
      high: "border-red-200 bg-red-100 text-red-700",
      critical: "border-red-300 bg-red-200 text-red-900",
      // Product Category
      maintenance_part: "border-purple-200 bg-purple-100 text-purple-700",
      stocked_material: "border-teal-200 bg-teal-100 text-teal-700",
      project_material: "border-orange-200 bg-orange-100 text-orange-700",
      // Project Status
      active: "border-green-200 bg-green-100 text-green-800",
      on_hold_project: "border-yellow-200 bg-yellow-100 text-yellow-800",
      sold: "border-purple-200 bg-purple-100 text-purple-700",
      scheduled: "border-blue-200 bg-blue-100 text-blue-700",
      complete: "border-teal-200 bg-teal-100 text-teal-800",
      // Asset Status
      inactive: "border-slate-200 bg-slate-100 text-slate-600",
      in_shop: "border-yellow-200 bg-yellow-100 text-yellow-800",
      out_of_service: "border-red-200 bg-red-100 text-red-700",
      disposed: "border-slate-300 bg-slate-200 text-slate-500",
      // Maintenance Request Status
      in_review: "border-yellow-200 bg-yellow-100 text-yellow-800",
      converted: "border-green-200 bg-green-100 text-green-800",
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
