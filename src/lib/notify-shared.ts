/**
 * Resolves an org-configurable broadcast audience — see RecipientsPicker in
 * src/components/settings/NotificationsPage.tsx. Absent/null customization
 * means "all admins/managers" (the original, un-configurable behavior); an
 * explicit array (even empty) means "exactly these people". Shared by
 * estimate-client-notify.ts, ticket-notify.ts, and contract-notify.ts so all
 * three broadcast-style notifications behave identically.
 */
export async function resolveBroadcastRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  customizationsKey: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const { data: org } = await supabase
    .from("organizations")
    .select("customizations")
    .eq("id", orgId)
    .single();
  const recipientIds = (org?.customizations as Record<string, unknown> | null)?.[customizationsKey] as
    | string[]
    | undefined;

  if (Array.isArray(recipientIds)) {
    if (!recipientIds.length) return [];
    const { data: picked } = await supabase
      .from("profiles")
      .select("id, email, name, notification_prefs")
      .in("id", recipientIds);
    return picked ?? [];
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, email, name, notification_prefs")
    .eq("org_id", orgId)
    .in("role", ["admin", "manager"]);
  return admins ?? [];
}
