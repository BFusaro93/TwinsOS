"use client";

import { useMemo } from "react";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** A WO part line that took less stock than it used (see wo_part_shortfalls). */
export interface WOPartShortfall {
  woPartId: string;
  partId: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  quantity: number;
  quantityDeducted: number;
  shortQty: number;
}

/**
 * Open shortfalls: parts used on a work order while on-hand was too low. They
 * clear on their own when the part is received (receive_part_quantity settles
 * them), so a row here means "used before it was received".
 */
export function useWOPartShortfalls() {
  const query = useQuery({
    queryKey: ["wo-part-shortfalls"],
    queryFn: async (): Promise<WOPartShortfall[]> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_part_shortfalls")
        .select("wo_part_id, part_id, work_order_id, work_order_number, work_order_title, quantity, quantity_deducted, short_qty")
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        woPartId: r.wo_part_id,
        partId: r.part_id,
        workOrderId: r.work_order_id,
        workOrderNumber: r.work_order_number ?? "",
        workOrderTitle: r.work_order_title ?? "",
        quantity: Number(r.quantity),
        quantityDeducted: Number(r.quantity_deducted),
        shortQty: Number(r.short_qty),
      }));
    },
  });

  const byPart = useMemo(() => {
    const map = new Map<string, WOPartShortfall[]>();
    for (const row of query.data ?? []) {
      const list = map.get(row.partId);
      if (list) list.push(row);
      else map.set(row.partId, [row]);
    }
    return map;
  }, [query.data]);

  return { ...query, byPart };
}
