import { chunk } from "@/lib/utils/chunk";
import { openPendingTab, showInPendingTab } from "@/lib/utils/pending-tab";

/** Records per combined PDF; the bulk-pdf routes refuse more. Larger selections print in several tabs. */
export const BULK_PRINT_MAX = 100;

export interface BulkPrintResult {
  /** Ids the server actually put in a PDF (an id that failed to load never reached paper). */
  renderedIds: string[];
  /** Batches that failed outright. */
  failedBatches: number;
}

/**
 * "Print Selected": POSTs the ids to a bulk-pdf route in batches of BULK_PRINT_MAX and opens
 * each combined PDF in its own tab, then prints it. Must be called from the click handler:
 * the tabs are opened up front, before any await, so Safari doesn't block them.
 */
export function printInBatches(endpoint: string, ids: string[]): Promise<BulkPrintResult> {
  const batches = chunk(ids, BULK_PRINT_MAX);
  const tabs = batches.map(() => openPendingTab());
  return (async () => {
    const result: BulkPrintResult = { renderedIds: [], failedBatches: 0 };
    for (let i = 0; i < batches.length; i++) {
      const tab = tabs[i];
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batches[i] }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const header = res.headers.get("X-Rendered-Ids");
        result.renderedIds.push(...(header ? header.split(",").filter(Boolean) : batches[i]));
        const url = URL.createObjectURL(await res.blob());
        showInPendingTab(tab, url);
        if (tab && !tab.closed) tab.addEventListener("load", () => tab.print(), { once: true });
      } catch {
        result.failedBatches += 1;
        if (tab && !tab.closed) tab.close();
      }
    }
    return result;
  })();
}
