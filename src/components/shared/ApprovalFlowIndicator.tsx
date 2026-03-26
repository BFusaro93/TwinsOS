import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPROVAL_FLOW_STEPS } from "@/lib/constants";
import type { ApprovalStatus } from "@/types";

interface ApprovalFlowIndicatorProps {
  currentStatus: ApprovalStatus;
}

const STATUS_ORDER: Record<ApprovalStatus, number> = {
  draft: 0,
  pending_approval: 1,
  approved: 2,
  rejected: 2,
  ordered: 3,
  closed: 3,
};

export function ApprovalFlowIndicator({ currentStatus }: ApprovalFlowIndicatorProps) {
  const currentIndex = STATUS_ORDER[currentStatus] ?? 0;

  return (
    <div className="flex items-center gap-0">
      {APPROVAL_FLOW_STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === APPROVAL_FLOW_STEPS.length - 1;

        return (
          <div key={step.label} className="flex flex-1 items-center">
            {/* Step */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  isCompleted &&
                    "border-brand-500 bg-brand-500 text-white",
                  isCurrent &&
                    "border-brand-500 bg-white text-brand-600",
                  !isCompleted &&
                    !isCurrent &&
                    "border-slate-200 bg-white text-slate-400"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium",
                  isCurrent ? "text-brand-600" : "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                className={cn(
                  "mb-4 h-0.5 flex-1",
                  i < currentIndex ? "bg-brand-500" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
