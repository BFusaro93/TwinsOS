import type { createClient } from "@/lib/supabase/client";

/**
 * Org folder for uploads to the shared public buckets (`thumbnails`,
 * `document-images`). Their INSERT/UPDATE/DELETE policies require
 * `(storage.foldername(name))[1] = my_org_id()::text`, so every object path
 * must start with this value. Resolved via the `my_org_id()` RPC rather than
 * `profiles.org_id` so staff impersonating another org upload into (and pass
 * the policy for) the impersonated org.
 */
export async function getStorageOrgPrefix(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data, error } = await supabase.rpc("my_org_id");
  if (error) throw error;
  if (!data) throw new Error("No organization for the current session");
  return data;
}
