"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Clock, LogIn, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCrewDay, useCrewDayAction, useSetCrewMemberAbsent } from "@/lib/hooks/use-crew-app";

interface CrewInfo {
  crewId: string;
  crewName: string;
  crewColor: string | null;
  myRole: string;
  myName: string;
  members: { id: string; name: string; role: string; employeeId: string | null }[];
}

interface EditCrewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crewInfo: CrewInfo;
  /** The stop in progress, if any — a member clocked in/out here also joins/leaves that job's punches. */
  visitId?: string;
}

/**
 * Per-person exceptions to the crew's day. Start Day / Start Job already clock
 * in everyone working; this is for the late arrival, the person out today, and
 * whoever leaves early.
 */
export function EditCrewDialog({ open, onOpenChange, crewInfo, visitId }: EditCrewDialogProps) {
  const { data: day } = useCrewDay();
  const dayAction = useCrewDayAction();
  const setAbsent = useSetCrewMemberAbsent();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const members = day?.members ?? [];

  async function run(memberId: string, fn: () => Promise<unknown>) {
    setLoadingId(memberId);
    try {
      await fn();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {crewInfo.crewColor && (
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: crewInfo.crewColor }}
              />
            )}
            {crewInfo.crewName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {members.map(member => {
            const onClock = !!member.startedAt && !member.endedAt;
            const done = !!member.startedAt && !!member.endedAt;
            const isLoading = loadingId === member.id;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-muted/40 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 dark:text-neutral-100 truncate">{member.name}</p>
                    {member.role && (
                      <Badge variant="outline" className="text-xs capitalize shrink-0">{member.role}</Badge>
                    )}
                  </div>
                  {member.startedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      In: {format(parseISO(member.startedAt), "h:mm a")}
                      {member.endedAt && ` · Out: ${format(parseISO(member.endedAt), "h:mm a")}`}
                    </p>
                  )}
                  {member.absent && !member.startedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">Not working today</p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {onClock ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs h-8"
                      onClick={() => run(member.id, () => dayAction.mutateAsync({ action: "member_out", crewMemberId: member.id, visitId }))}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                      Left for the day
                    </Button>
                  ) : (
                    <>
                      {!done && !member.absent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8 text-muted-foreground"
                          onClick={() => run(member.id, () => setAbsent.mutateAsync({ crewMemberId: member.id, absent: true }))}
                          disabled={isLoading}
                        >
                          Not working
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 text-xs h-8"
                        onClick={() => run(member.id, () => dayAction.mutateAsync({ action: "member_in", crewMemberId: member.id, visitId }))}
                        disabled={isLoading}
                      >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                        {done ? "Back" : "Clock In"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-400 dark:text-neutral-500 text-center mt-2">
          Start Day clocks in everyone working. Use this for anyone who arrives late, is out today, or leaves early.
        </p>
      </DialogContent>
    </Dialog>
  );
}
