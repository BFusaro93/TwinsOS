"use client";

import { useState } from "react";
import { Check, X, Clock, SkipForward, Minus, ChevronDown, ChevronUp, Users, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApprovalRequests, useDecideApproval } from "@/lib/hooks/use-approval-requests";
import { useCurrentUserStore } from "@/stores";
import type { ApprovalRequest, ApprovalRequestStatus } from "@/types";

interface ApprovalChainProps {
  entityId: string;
  onApproved?: () => void;
  onRejected?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type StepGroup = {
  flowStepId: string;
  order: number;
  requests: ApprovalRequest[];
};

function groupByStep(requests: ApprovalRequest[]): StepGroup[] {
  const map = new Map<string, StepGroup>();
  for (const r of requests) {
    if (!map.has(r.flowStepId)) {
      map.set(r.flowStepId, { flowStepId: r.flowStepId, order: r.order, requests: [] });
    }
    map.get(r.flowStepId)!.requests.push(r);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

function isGroupResolved(group: StepGroup): boolean {
  const { requests } = group;
  if (requests.every((r) => r.status === "skipped")) return true;
  if (requests.some((r) => r.status === "approved")) return true;
  const active = requests.filter((r) => r.status !== "skipped");
  if (
    active.length > 0 &&
    active.some((r) => r.status === "rejected") &&
    active.every((r) => r.status === "rejected" || r.status === "superseded")
  )
    return true;
  return false;
}

function groupOverallStatus(group: StepGroup): "approved" | "rejected" | "skipped" | "pending" {
  const { requests } = group;
  if (requests.every((r) => r.status === "skipped")) return "skipped";
  if (requests.some((r) => r.status === "approved")) return "approved";
  const active = requests.filter((r) => r.status !== "skipped");
  if (active.some((r) => r.status === "rejected")) return "rejected";
  return "pending";
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusIcon(status: ApprovalRequestStatus) {
  switch (status) {
    case "approved":    return <Check className="h-3.5 w-3.5" />;
    case "rejected":    return <X className="h-3.5 w-3.5" />;
    case "skipped":     return <SkipForward className="h-3.5 w-3.5" />;
    case "superseded":  return <Minus className="h-3.5 w-3.5" />;
    default:            return <Clock className="h-3.5 w-3.5" />;
  }
}

function bubbleClass(status: ApprovalRequestStatus) {
  switch (status) {
    case "approved":   return "border-emerald-500 bg-emerald-500 text-white";
    case "rejected":   return "border-red-400 bg-red-400 text-white";
    case "skipped":    return "border-slate-200 bg-slate-100 text-slate-400";
    case "superseded": return "border-slate-200 bg-white text-slate-300";
    default:           return "border-amber-400 bg-amber-50 text-amber-600";
  }
}

function statusText(status: ApprovalRequestStatus) {
  switch (status) {
    case "approved":   return "Approved";
    case "rejected":   return "Rejected";
    case "skipped":    return "Not required";
    case "superseded": return "Superseded";
    default:           return "Awaiting";
  }
}

function statusTextClass(status: ApprovalRequestStatus) {
  switch (status) {
    case "approved":   return "text-emerald-600";
    case "rejected":   return "text-red-500";
    case "superseded": return "text-slate-300";
    case "skipped":    return "text-slate-400";
    default:           return "text-amber-600";
  }
}

// ── Individual approver row ───────────────────────────────────────────────────

function ApproverRow({
  request,
  isActiveStep,
  isCurrentUser,
  isAdmin,
  onDecide,
  deciding,
}: {
  request: ApprovalRequest;
  isActiveStep: boolean;
  isCurrentUser: boolean;
  isAdmin: boolean;
  onDecide: (status: "approved" | "rejected", comment: string) => void;
  deciding: boolean;
}) {
  const isOverride = isAdmin && !isCurrentUser && isActiveStep && request.status === "pending";
  const canAct = isActiveStep && request.status === "pending" && (isCurrentUser || isAdmin);
  const [expanded, setExpanded] = useState(isActiveStep && (isCurrentUser || isAdmin) && request.status === "pending");
  const [comment, setComment] = useState("");

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md px-3 py-2.5",
        canAct ? "bg-amber-50 ring-1 ring-amber-200" : "bg-white"
      )}
    >
      {/* Status bubble */}
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs",
          bubbleClass(request.status)
        )}
      >
        {statusIcon(request.status)}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              request.status === "superseded" ? "text-slate-400 line-through" : "text-slate-900"
            )}
          >
            {request.approverName}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-medium", statusTextClass(request.status))}>
              {statusText(request.status)}
            </span>
            {request.decidedAt && request.status !== "skipped" && request.status !== "superseded" && (
              <span className="text-xs text-slate-400">{formatDate(request.decidedAt)}</span>
            )}
          </div>
        </div>

        {request.comment && request.status !== "superseded" && (
          <p className="text-xs italic text-slate-500">&quot;{request.comment}&quot;</p>
        )}

        {/* Action area */}
        {canAct && (
          <div className="mt-2">
            {expanded ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder={isOverride ? "Reason for override (required)…" : "Add a comment (optional)..."}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-14 resize-none text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                    disabled={deciding}
                    onClick={() => onDecide("approved", comment)}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    {isOverride ? "Override & Approve" : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-200 text-xs text-red-600 hover:border-red-300 hover:text-red-700"
                    disabled={deciding}
                    onClick={() => onDecide("rejected", comment)}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 text-xs text-slate-400"
                    onClick={() => setExpanded(false)}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 gap-1 text-xs",
                  isOverride
                    ? "border-amber-300 text-amber-700 hover:border-amber-400 hover:bg-amber-50"
                    : "border-amber-200 text-amber-700 hover:border-amber-300 hover:bg-amber-50"
                )}
                onClick={() => setExpanded(true)}
              >
                {isOverride ? (
                  <>
                    <ShieldAlert className="h-3 w-3" />
                    Admin Override
                  </>
                ) : (
                  <>
                    Review & Decide
                    <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {isActiveStep && !isCurrentUser && !isAdmin && request.status === "pending" && (
          <p className="mt-0.5 text-xs text-slate-400">
            Waiting for {request.approverName} to review
          </p>
        )}
      </div>
    </div>
  );
}

// ── Step group card ───────────────────────────────────────────────────────────

function StepGroupCard({
  group,
  stepNumber,
  isActive,
  isLast,
  currentUserId,
  isAdmin,
  onDecide,
  deciding,
}: {
  group: StepGroup;
  stepNumber: number;
  isActive: boolean;
  isLast: boolean;
  currentUserId: string;
  isAdmin: boolean;
  onDecide: (request: ApprovalRequest, status: "approved" | "rejected", comment: string) => void;
  deciding: boolean;
}) {
  const overall = groupOverallStatus(group);
  const isMultiApprover = group.requests.filter((r) => r.status !== "skipped").length > 1;
  const firstRequest = group.requests[0];
  const stepLabel = `Step ${stepNumber} · ${firstRequest.approverRole.charAt(0).toUpperCase()}${firstRequest.approverRole.slice(1)} Approval`;

  return (
    <div className="flex gap-3">
      {/* Left gutter: step number + connector */}
      <div className="flex flex-col items-center gap-0">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
            overall === "approved" && "border-emerald-500 bg-emerald-500 text-white",
            overall === "rejected" && "border-red-400 bg-red-400 text-white",
            overall === "skipped" && "border-slate-200 bg-slate-100 text-slate-400",
            overall === "pending" && isActive && "border-amber-400 bg-amber-50 text-amber-700",
            overall === "pending" && !isActive && "border-slate-200 bg-white text-slate-400"
          )}
        >
          {overall === "approved" ? <Check className="h-3.5 w-3.5" /> :
           overall === "rejected" ? <X className="h-3.5 w-3.5" /> :
           overall === "skipped" ? <SkipForward className="h-3.5 w-3.5" /> :
           stepNumber}
        </div>
        {!isLast && (
          <div
            className={cn(
              "mt-1 w-0.5 flex-1",
              overall === "approved" ? "bg-emerald-300" : "bg-slate-200"
            )}
          />
        )}
      </div>

      {/* Right: step content */}
      <div className="mb-4 flex flex-1 flex-col gap-1.5">
        {/* Step header */}
        <div className="flex items-center gap-2 pb-0.5">
          <span className="text-xs font-semibold text-slate-700">{stepLabel}</span>
          {isMultiApprover && overall === "pending" && (
            <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
              <Users className="h-2.5 w-2.5" />
              Any one can approve
            </span>
          )}
          {overall === "skipped" && (
            <span className="text-[10px] text-slate-400">Not required for this amount</span>
          )}
        </div>

        {/* Approver rows */}
        <div
          className={cn(
            "overflow-hidden rounded-lg border",
            isActive && overall === "pending" ? "border-amber-200" : "border-slate-100"
          )}
        >
          {group.requests.map((request, i) => (
            <div key={request.id}>
              {i > 0 && <div className="h-px bg-slate-100" />}
              <ApproverRow
                request={request}
                isActiveStep={isActive}
                isCurrentUser={request.approverId === currentUserId}
                isAdmin={isAdmin}
                onDecide={(status, comment) => onDecide(request, status, comment)}
                deciding={deciding}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ApprovalChain({ entityId, onApproved, onRejected }: ApprovalChainProps) {
  const { currentUser } = useCurrentUserStore();
  const isAdmin = currentUser.role === "admin";
  const { data: requests = [], isLoading } = useApprovalRequests(entityId);
  const { mutate: decide, isPending: deciding } = useDecideApproval(entityId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) return null;

  const groups = groupByStep(requests);

  // Active group = first unresolved group
  const activeGroup = groups.find((g) => !isGroupResolved(g)) ?? null;

  function handleDecide(
    request: ApprovalRequest,
    status: "approved" | "rejected",
    comment: string
  ) {
    decide(
      { requestId: request.id, status, comment },
      {
        onSuccess: (freshRequests) => {
          if (status === "rejected") {
            onRejected?.();
            return;
          }
          if (status === "approved" && freshRequests) {
            // Use the fresh post-mutation data — not the stale closure
            const freshGroups = groupByStep(freshRequests);
            const stillPending = freshGroups.filter((g) => !isGroupResolved(g));
            if (stillPending.length === 0) {
              onApproved?.();
            }
          }
        },
      }
    );
  }

  return (
    <div className="flex flex-col">
      {groups.map((group, i) => (
        <StepGroupCard
          key={group.flowStepId}
          group={group}
          stepNumber={i + 1}
          isActive={group.flowStepId === activeGroup?.flowStepId}
          isLast={i === groups.length - 1}
          currentUserId={currentUser.id}
          isAdmin={isAdmin}
          onDecide={handleDecide}
          deciding={deciding}
        />
      ))}
    </div>
  );
}
