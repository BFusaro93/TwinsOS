import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";

type RpcClient = Parameters<typeof hasAnySettingsPermission>[0];

/**
 * Server-side enforcement of the Forms permission keys, which the UI already
 * checks (FormsList / form detail page) but the /api/crm/forms routes did not:
 * RLS only scopes by org + CRM access, so any CRM login whose role lacked
 * `forms_edit` could still create/publish/delete forms or rewrite their fields
 * and rules by calling the routes directly, and any role lacking
 * `forms_view_submit` could read every submission (names, emails, answers).
 *
 *   edit - build/publish/delete forms (forms_edit)
 *   view - read or work submissions, and fill out the internal test form
 *          (forms_view_submit; forms_edit implies it, matching the UI where an
 *          editor always sees the Responses tab)
 *
 * Returns a 403 response to hand back, or null when allowed.
 */
export async function rejectWithoutFormsPermission(
  supabase: RpcClient,
  level: "edit" | "view"
): Promise<NextResponse | null> {
  const keys = level === "edit" ? ["forms_edit"] : ["forms_view_submit", "forms_edit"];
  if (await hasAnySettingsPermission(supabase, keys)) return null;
  return NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 });
}
