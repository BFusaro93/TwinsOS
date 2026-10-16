/**
 * Tells purchasers/managers when a work order uses more of a part than is on
 * hand, so someone can check the count or chase the PO. The WO still saves —
 * stock clamps at 0 and the shortfall settles on the next receipt.
 *
 * Recipients: org admins, managers and purchasers (never the person who did
 * it, never deactivated users). Runs from the client under the actor's own
 * session — notifications allows same-org inserts.
 */
export async function notifyPartStockShort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: { woPartId: string; shortBy: number }
): Promise<void> {
  const { data: line } = await supabase
    .from("wo_parts")
    .select("org_id, part_id, part_name, work_order_id")
    .eq("id", params.woPartId)
    .maybeSingle();
  if (!line?.part_id) return;

  const { data: wo } = await supabase
    .from("work_orders")
    .select("work_order_number")
    .eq("id", line.work_order_id)
    .maybeSingle();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id")
    .eq("org_id", line.org_id)
    .neq("status", "inactive")
    .in("role", ["admin", "manager", "purchaser"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ids = (recipients ?? []).map((p: any) => p.id as string).filter((id: string) => id !== user?.id);
  if (!ids.length) return;

  const woLabel = wo?.work_order_number ?? "a work order";
  await supabase.from("notifications").insert(
    ids.map((userId: string) => ({
      org_id: line.org_id,
      user_id: userId,
      type: "part_stock_short",
      title: "Part used before received",
      message: `${line.part_name}: ${params.shortBy} short on ${woLabel}. On hand was too low — check the count or the open PO.`,
      entity_id: line.part_id,
      entity_type: "part",
    }))
  );
}
