"use client";

import { useState } from "react";
import { Loader2, Clock, LogIn, LogOut, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCrewDay, useCrewDayAction, useSetCrewMemberAbsent } from "@/lib/hooks/use-crew-app";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { t } from "@/lib/crew-i18n";

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
  const { data: day, isSuccess: dayLoaded } = useCrewDay();
  const { format: orgFormat } = useOrgDates();
  // The org's wall clock, not the phone's.
  const clock = (iso: string) => orgFormat(iso, { hour: "numeric", minute: "2-digit" });
  const dayAction = useCrewDayAction();
  const setAbsent = useSetCrewMemberAbsent();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [addId, setAddId] = useState("");

  const members = day?.members ?? [];
  const available = day?.available ?? [];

  async function run(memberId: string, fn: () => Promise<unknown>) {
    setLoadingId(memberId);
    try {
      await fn();
    } catch {
      /* the hook's onError already told the crew what went wrong */
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
          {dayLoaded && members.length === 0 && available.length === 0 && (
            <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {t("Nobody is on this crew yet. Ask the office to add the people who work on it under Team → Crews.")}
            </p>
          )}
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
                      In: {clock(member.startedAt)}
                      {member.endedAt && ` · Out: ${clock(member.endedAt)}`}
                    </p>
                  )}
                  {member.absent && !member.startedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">{t("Not working today")}</p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {onClock ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs min-h-11"
                      onClick={() => run(member.id, () => dayAction.mutateAsync({ action: "member_out", crewMemberId: member.id, visitId }))}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                      {t("Left for the day")}
                    </Button>
                  ) : (
                    <>
                      {!done && !member.absent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs min-h-11 text-muted-foreground"
                          onClick={() => run(member.id, () => setAbsent.mutateAsync({ crewMemberId: member.id, absent: true }))}
                          disabled={isLoading}
                        >
                          {t("Not working")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40 text-xs min-h-11"
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

        {available.length > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Select value={addId} onValueChange={setAddId}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder={t("Add someone to my crew today")} />
              </SelectTrigger>
              <SelectContent>
                {available.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1 h-9"
              disabled={!addId || loadingId === addId}
              onClick={() => run(addId, async () => {
                await dayAction.mutateAsync({ action: "add_member", crewMemberId: addId, visitId });
                setAddId("");
              })}
            >
              {loadingId === addId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              {t("Add")}
            </Button>
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-neutral-500 text-center mt-2">
          {t("Start Day clocks in everyone working. Use this for anyone who arrives late, is out today, or leaves early.")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
