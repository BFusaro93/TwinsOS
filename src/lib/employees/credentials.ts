import { daysBetweenYmd } from "@/lib/time/zone";
import type { CRMEmployee } from "@/types/crm-employees";

export type CredentialKind = "driver_license" | "dot_physical" | "hoisting_license";

export const CREDENTIAL_LABELS: Record<CredentialKind, string> = {
  driver_license: "Driver License",
  dot_physical: "DOT Physical",
  hoisting_license: "Hoisting License",
};

export interface ExpiringCredential {
  employeeId: string;
  name: string;
  kind: CredentialKind;
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** Negative once expired. */
  daysLeft: number;
}

/**
 * Credentials that have expired or expire within `withinDays` of `today`
 * (the org's today, YYYY-MM-DD), soonest first. Terminated employees are
 * skipped. People without License Info access get null dates from the server,
 * so they simply produce no rows.
 */
export function expiringCredentials(
  employees: CRMEmployee[],
  today: string,
  withinDays = 60
): ExpiringCredential[] {
  const rows: ExpiringCredential[] = [];
  for (const e of employees) {
    if (!e.isActive) continue;
    const dates: [CredentialKind, string | null][] = [
      ["driver_license", e.licenseExpiration],
      ["dot_physical", e.dotPhysicalExpiration],
      ["hoisting_license", e.hoistingLicenseExpiration],
    ];
    for (const [kind, date] of dates) {
      if (!date) continue;
      const daysLeft = daysBetweenYmd(today, date);
      if (daysLeft > withinDays) continue;
      rows.push({
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        kind,
        label: CREDENTIAL_LABELS[kind],
        date,
        daysLeft,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
