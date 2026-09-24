import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Singleton browser Supabase client.
 *
 * Creating multiple instances causes concurrent auth-token lock contention
 * (Web Locks API), which manifests as slow page loads and "lock was stolen"
 * warnings. A single shared instance eliminates this.
 */
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}

type AuthUser = Awaited<
  ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>
>["data"]["user"];

let _authUserInFlight: Promise<AuthUser> | null = null;

/**
 * `auth.getUser()` for page-load queries, sharing one in-flight request
 * between concurrent callers. Every getUser() is a network round trip to
 * /auth/v1/user, and the shell's queries (profile, UI prefs, staff check,
 * impersonation, notification reads) all start together — five identical
 * requests per page load, which Sentry flags as an N+1 API call.
 *
 * Nothing is cached past the request itself, so a later call still gets a
 * freshly validated user (sign-out, token refresh).
 */
export function getAuthUser(): Promise<AuthUser> {
  if (!_authUserInFlight) {
    _authUserInFlight = createClient()
      .auth.getUser()
      .then(({ data }) => data.user)
      .finally(() => {
        _authUserInFlight = null;
      });
  }
  return _authUserInFlight;
}
