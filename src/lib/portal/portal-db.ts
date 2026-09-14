/**
 * Typed wrappers for portal tables that are not yet in the generated Supabase types.
 * After running `npx supabase gen types` (post migration 20260630000003), remove these
 * and use the typed client directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PortalInviteRow {
  id: string;
  org_id: string;
  client_id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  created_by: string | null;
}

export interface PortalUserRow {
  id: string;
  org_id: string;
  client_id: string;
  user_id: string;
  email: string;
  created_at: string;
}

export interface PortalSettingsRow {
  id: string;
  org_id: string;
  company_name: string | null;
  logo_url: string | null;
  accent_color: string;
  support_email: string | null;
  support_phone: string | null;
  allow_tickets: boolean;
  allow_estimates: boolean;
  allow_documents: boolean;
  welcome_message: string | null;
  portal_ticket_categories: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function portalDb(supabase: SupabaseClient<any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  return {
    invites: () => db.from("client_portal_invites") as ReturnType<typeof db.from> & {
      // typed via explicit casts at call sites
    },
    users: () => db.from("client_portal_users"),
    settings: () => db.from("client_portal_settings"),
  };
}
