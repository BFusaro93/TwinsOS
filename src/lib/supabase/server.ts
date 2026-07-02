import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * Creates a Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes cookies so the auth session is available server-side.
 *
 * Must be called inside an async context (Server Component, Route Handler, etc.)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component — safe to ignore here
            // because middleware will handle session refresh.
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Only use in server contexts where the
 * caller has already verified the user's identity (e.g. portal routes that
 * call getPortalContext() first).
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
