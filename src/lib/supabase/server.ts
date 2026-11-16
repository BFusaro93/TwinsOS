import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

let reportRunTokenPromise: Promise<string | null> | null = null;

/**
 * The secret (report_run_trust, service-role only) that marks this server's
 * report runs as already gated. Read once per server instance; a failed read
 * (e.g. before the migration is applied) is retried on the next request and
 * just means calls go out without the header.
 */
function getReportRunToken(): Promise<string | null> {
  if (!reportRunTokenPromise) {
    const pending = (async (): Promise<string | null> => {
      try {
        // Untyped: report_run_trust isn't part of the generated public API types.
        const service = createServiceClient() as unknown as ReturnType<typeof createSupabaseClient>;
        const { data, error } = await service
          .from("report_run_trust")
          .select("token")
          .eq("id", 1)
          .maybeSingle();
        if (error || !data) return null;
        const token = (data as { token?: unknown }).token;
        return typeof token === "string" && token.length > 0 ? token : null;
      } catch {
        return null;
      }
    })();
    reportRunTokenPromise = pending;
    void pending.then((token) => {
      if (!token && reportRunTokenPromise === pending) reportRunTokenPromise = null;
    });
  }
  return reportRunTokenPromise;
}

/**
 * Creates a Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes cookies so the auth session is available server-side.
 *
 * Must be called inside an async context (Server Component, Route Handler, etc.)
 */
export async function createClient() {
  const cookieStore = await cookies();
  const reportRunToken = await getReportRunToken();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Identifies this server's own report code to crm_run_report, which
      // applies the ad-hoc analysis rules (dataset keys, Advanced Reporting,
      // crew panels) to any call without it — see _report_run_trusted().
      ...(reportRunToken ? { global: { headers: { "x-report-run-token": reportRunToken } } } : {}),
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
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
