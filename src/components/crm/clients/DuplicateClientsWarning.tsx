"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findDuplicateClients, type DuplicateClientMatch } from "@/lib/hooks/use-clients";
import { logger } from "@/lib/logger";

const log = logger.child("duplicate-clients");

/**
 * Duplicate check for the New Client and New Lead dialogs: before creating, look
 * for an existing client or lead in the org with the same email or phone. When
 * there are matches the dialog shows them (with links) and a "Create anyway"
 * button instead of creating straight away.
 *
 * `check()` resolves true when it's fine to create now (no match, already
 * acknowledged, or the lookup failed — a failed check never blocks a create).
 * Changing the email or phone clears the acknowledgement via `reset()`.
 */
export function useDuplicateClientCheck() {
  const [matches, setMatches] = useState<DuplicateClientMatch[]>([]);
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function check(email: string, phone: string): Promise<boolean> {
    const key = `${email.trim().toLowerCase()}|${phone.replace(/\D/g, "")}`;
    if (acknowledgedKey === key) return true;
    setChecking(true);
    try {
      const found = await findDuplicateClients(email, phone);
      setMatches(found);
      if (found.length === 0) return true;
      setAcknowledgedKey(key);
      return false;
    } catch (err) {
      log.warn("duplicate check failed", { error: err instanceof Error ? err.message : String(err) });
      return true;
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setMatches([]);
    setAcknowledgedKey(null);
  }

  return { matches, checking, check, reset };
}

export function DuplicateClientsWarning({
  matches,
  onCreateAnyway,
  creating,
}: {
  matches: DuplicateClientMatch[];
  onCreateAnyway: () => void;
  creating?: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="font-medium">
          {matches.length === 1 ? "An account" : `${matches.length} accounts`} already {matches.length === 1 ? "has" : "have"} this email or phone
        </p>
      </div>
      <ul className="mt-2 space-y-1 pl-6">
        {matches.map((m) => (
          <li key={m.id} className="text-slate-700 dark:text-neutral-300">
            <Link
              href={`/crm/clients/${m.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {m.displayName}
            </Link>{" "}
            <span className="text-xs capitalize text-muted-foreground">({m.status})</span>
            <span className="block text-xs text-muted-foreground">
              Same {m.matchedOn}: {m.matchedOn === "email" ? m.primaryEmail : m.primaryPhone}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onCreateAnyway} disabled={creating}>
          Create anyway
        </Button>
      </div>
    </div>
  );
}
