/**
 * A channel topic unique to this subscription.
 *
 * supabase-js returns the EXISTING channel for a topic that is still in the
 * client's list, and removeChannel() only drops it once the server
 * acknowledges the leave. So when one component unmounts and another mounts
 * with the same topic in the same commit (switching app shells, opening the
 * support chat dialog, React StrictMode's double effect), the new subscriber
 * got the dying channel and silently received nothing. These channels only
 * carry postgres_changes, whose filters travel in the join payload, so the
 * topic name itself means nothing to the server.
 */
export function realtimeTopic(base: string): string {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}
