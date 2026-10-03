// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcClient = { rpc: (...args: any[]) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Server-side counterpart of the client's can(): true when the caller is an
 * admin or their crm_role grants ANY of the given permission keys (wraps the
 * has_settings_permission RPC). Use when a route is reached from several UI
 * actions that each have their own key.
 */
export async function hasAnySettingsPermission(supabase: RpcClient, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    const { data, error } = await supabase.rpc("has_settings_permission", { p_key: key });
    if (!error && data === true) return true;
  }
  return false;
}
