import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
}

interface StatusFlowIndicatorProps {
  steps: Step[];
  currentIndex: number;
  /** If true, the current step is shown in red (rejected/cancelled state) */
  isTerminalError?: boolean;
}

export function StatusFlowIndicator({
  steps,
  currentIndex,
  isTerminalError = false,
}: StatusFlowIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isLast = i === steps.length - 1;
        const isError = isCurrent && isTerminalError;

        return (
          <div key={step.label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  isCompleted && "border-brand-500 bg-brand-500 text-white",
                  isCurrent && !isError && "border-brand-500 bg-white text-brand-600",
                  isError && "border-red-500 bg-red-500 text-white",
                  !isCompleted && !isCurrent && "border-slate-200 bg-white text-slate-400"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isError ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium",
                  isCurrent && !isError && "text-brand-600",
                  isError && "text-red-600",
                  !isCurrent && "text-slate-400"
                )}
              >
                {step.label}
              </span>
            </div>

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
