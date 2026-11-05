/**
 * Required Before / After photos on a stop (SA's "Require Before / After
 * Pictures" role rights, here an org-wide setting). The two flags live in
 * organizations.customizations so no migration is needed, and a photo counts as
 * a Before / After photo when its caption is exactly that word — the crew apps
 * upload them with that caption when the setting is on.
 */
export type PhotoPhase = "before" | "after";

export interface PhotoRules {
  requireBefore: boolean;
  requireAfter: boolean;
}

export function photoRulesFromCustomizations(customizations: unknown): PhotoRules {
  const c = (customizations ?? {}) as Record<string, unknown>;
  return {
    requireBefore: c.crew_require_before_photo === true,
    requireAfter: c.crew_require_after_photo === true,
  };
}

export function phaseCaption(phase: PhotoPhase): string {
  return phase === "before" ? "Before" : "After";
}

export function isPhaseCaption(caption: string | null | undefined, phase: PhotoPhase): boolean {
  return (caption ?? "").trim().toLowerCase() === phase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The phase photo a stop still owes, or null when the org doesn't require it or
 * a photo already exists on ANY of the stop's visits. `db` must be able to read
 * the org row and visit photos (the route's own client or the service client).
 */
export async function missingRequiredPhoto(
  db: any,
  args: { orgId: string; visitIds: string[]; phase: PhotoPhase }
): Promise<PhotoPhase | null> {
  const { data: org } = await db.from("organizations").select("customizations").eq("id", args.orgId).maybeSingle();
  const rules = photoRulesFromCustomizations(org?.customizations);
  if (args.phase === "before" ? !rules.requireBefore : !rules.requireAfter) return null;
  const { data: photos } = await db
    .from("crm_visit_photos")
    .select("caption")
    .eq("org_id", args.orgId)
    .in("visit_id", args.visitIds);
  const has = ((photos ?? []) as { caption: string | null }[]).some((p) => isPhaseCaption(p.caption, args.phase));
  return has ? null : args.phase;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
