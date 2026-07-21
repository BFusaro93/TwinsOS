import { Calendar, CalendarCheck, Smartphone, CheckCircle2, XCircle, CornerDownRight } from "lucide-react";
import type { VisitStatus } from "@/types/crm-jobs";

export function VisitStatusIcon({ status, className = "h-4 w-4" }: { status: VisitStatus; className?: string }) {
  switch (status) {
    case "scheduled":   return <Calendar className={`${className} text-slate-400`} />;
    case "dispatched":  return <Smartphone className={`${className} text-orange-400`} />;
    case "in_progress": return <CalendarCheck className={`${className} text-yellow-500`} />;
    case "completed":   return <CheckCircle2 className={`${className} text-green-500`} />;
    case "cancelled":   return <XCircle className={`${className} text-red-400`} />;
    case "skipped":     return <CornerDownRight className={`${className} text-blue-400`} />;
    default:            return <Calendar className={`${className} text-slate-300`} />;
  }
}
