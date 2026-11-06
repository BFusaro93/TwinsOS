/**
 * Required Before / After photos on a stop (SA's "Require Before / After
 * Pictures" role rights, here an org-wide setting). The two flags live in
 * organizations.customizations so no migration is needed, and a photo counts as
 * a Before / After photo when its caption is exactly that word — the crew apps
 * upload them with that caption (camera or library) when the setting is on.
 * Both are enforced only when the crew finishes the stop (clock-out), never at
 * Start Job.
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

/** Crew-facing sentence for the photos a stop still owes before it can finish. */
export function missingPhotosMessage(missing: PhotoPhase[]): string {
  if (missing.length >= 2) return "Add a Before and an After photo before finishing this job.";
  return missing[0] === "before"
    ? "Add a Before photo before finishing this job."
    : "Add an After photo before finishing this job.";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The phase photos a stop still owes at Finish — each phase the org requires
 * with no photo captioned for it on ANY of the stop's visits. Both phases are
 * checked only at clock-out (Start is never blocked): crews may shoot the
 * Before photo late or pick it from the library, as long as it's tagged
 * Before. `db` must be able to read the org row and visit photos (the
 * service client — crew logins can't read organizations.customizations).
 */
export async function missingRequiredPhotos(
  db: any,
  args: { orgId: string; visitIds: string[] }
): Promise<PhotoPhase[]> {
  const { data: org } = await db.from("organizations").select("customizations").eq("id", args.orgId).maybeSingle();
  const rules = photoRulesFromCustomizations(org?.customizations);
  const required: PhotoPhase[] = [];
  if (rules.requireBefore) required.push("before");
  if (rules.requireAfter) required.push("after");
  if (required.length === 0 || args.visitIds.length === 0) return [];
  const { data: photos } = await db
    .from("crm_visit_photos")
    .select("caption")
    .eq("org_id", args.orgId)
    .in("visit_id", args.visitIds);
  const captions = ((photos ?? []) as { caption: string | null }[]).map((p) => p.caption);
  return required.filter((phase) => !captions.some((c) => isPhaseCaption(c, phase)));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
