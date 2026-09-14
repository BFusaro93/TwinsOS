"use client";

import { useState } from "react";
import {
  useActiveImpersonationSession,
  useStaffOrgList,
  useStartImpersonation,
  useEndImpersonation,
} from "@/lib/hooks/use-impersonation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function InternalHomePage() {
  const { data: session, isLoading: sessionLoading } = useActiveImpersonationSession();
  const { data: orgs = [], isLoading: orgsLoading } = useStaffOrgList(!session);
  const startImpersonation = useStartImpersonation();
  const endImpersonation = useEndImpersonation();

  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [reason, setReason] = useState("");

  async function handleStart() {
    if (!targetOrgId) {
      toast.error("Pick an organization to impersonate first.");
      return;
    }
    try {
      await startImpersonation.mutateAsync({ targetOrgId, reason });
      toast.success("Impersonation session started — full read/write inside that org for the next hour.");
      setTargetOrgId("");
      setReason("");
    } catch (err) {
      console.error("[InternalHomePage]", err);
      toast.error("Couldn't start the session.");
    }
  }

  async function handleEnd() {
    if (!session) return;
    try {
      await endImpersonation.mutateAsync(session.id);
      toast.success("Impersonation session ended.");
    } catch (err) {
      console.error("[InternalHomePage]", err);
      toast.error("Couldn't end the session.");
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">Impersonate an organization</h1>

      {sessionLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : session ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-slate-700">
            Currently impersonating <strong>{session.targetOrgName}</strong>.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Started {new Date(session.startedAt).toLocaleTimeString()} · expires{" "}
            {new Date(session.expiresAt).toLocaleTimeString()}
            {session.reason && <> · reason: {session.reason}</>}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={handleEnd}
            disabled={endImpersonation.isPending}
          >
            {endImpersonation.isPending ? "Ending…" : "End Session"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border bg-white p-4">
          <div className="flex flex-col gap-1.5">
            <Label>Organization</Label>
            <Select value={targetOrgId} onValueChange={setTargetOrgId}>
              <SelectTrigger>
                <SelectValue placeholder={orgsLoading ? "Loading…" : "Pick an organization"} />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Reason (optional)</Label>
            <Textarea
              rows={3}
              placeholder="e.g. Helping set up their recurring job schedule"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <Button onClick={handleStart} disabled={startImpersonation.isPending}>
            {startImpersonation.isPending ? "Starting…" : "Start Impersonating"}
          </Button>
        </div>
      )}
    </div>
  );
}
