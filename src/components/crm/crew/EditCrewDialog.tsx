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
import { useCrewMemberTimes, useUpsertCrewMemberTime } from "@/lib/hooks/use-crew-app";

interface CrewInfo {
  crewId: string;
  crewName: string;
  crewColor: string | null;
  myRole: string;
  myName: string;
  members: { id: string; name: string; role: string; userId: string | null }[];
}

interface EditCrewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  crewInfo: CrewInfo;
  visitId?: string;
}

export function EditCrewDialog({ open, onOpenChange, crewInfo, visitId }: EditCrewDialogProps) {
  const { data: memberTimes = [] } = useCrewMemberTimes(visitId ?? "");
  const upsert = useUpsertCrewMemberTime();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  function getTime(memberId: string) {
    return memberTimes.find(t => t.crewMemberId === memberId);
  }

  async function handleClockIn(memberId: string) {
    if (!visitId) return;
    setLoadingId(memberId);
    try {
      await upsert.mutateAsync({
        visitId,
        crewMemberId: memberId,
        clockedInAt: new Date().toISOString(),
      });
    } finally {
      setLoadingId(null);
    }
  }

  async function handleClockOut(memberId: string) {
    if (!visitId) return;
    const existing = getTime(memberId);
    setLoadingId(memberId);
    try {
      await upsert.mutateAsync({
        visitId,
        crewMemberId: memberId,
        clockedInAt:  existing?.clockedInAt ?? null,
        clockedOutAt: new Date().toISOString(),
      });
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
          {crewInfo.members.map(member => {
            const time = getTime(member.id);
            const isIn  = !!time?.clockedInAt && !time?.clockedOutAt;
            const isDone = !!time?.clockedInAt && !!time?.clockedOutAt;
            const isLoading = loadingId === member.id;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 truncate">{member.name}</p>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {member.role}
                    </Badge>
                  </div>
                  {time?.clockedInAt && (
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      In: {format(parseISO(time.clockedInAt), "h:mm a")}
                      {time.clockedOutAt && ` · Out: ${format(parseISO(time.clockedOutAt), "h:mm a")}`}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {!visitId ? (
                    <span className="text-xs text-slate-400">No active job</span>
                  ) : isDone ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Clocked Out</Badge>
                  ) : isIn ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-red-200 text-red-600 hover:bg-red-50 text-xs h-8"
                      onClick={() => handleClockOut(member.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                      Clock Out
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-green-200 text-green-700 hover:bg-green-50 text-xs h-8"
                      onClick={() => handleClockIn(member.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                      Clock In
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!visitId && (
          <p className="text-xs text-slate-400 text-center mt-2">
            Open a job first to clock individual crew members in/out.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
