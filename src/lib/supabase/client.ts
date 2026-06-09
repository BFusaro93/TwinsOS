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
