"use client";

import { MessageSquareOff } from "lucide-react";
import { useClientSmsOptOuts } from "@/lib/hooks/use-sms-opt-outs";
import { formatPhoneNumber } from "@/lib/utils/phone";

function reason(source: string, keyword: string | null): string {
  if (source === "carrier_blocked") return "blocked by the carrier (texted STOP)";
  if (source === "keyword_in_message") return `a text contained "${keyword ?? "STOP"}" — re-confirm with the client`;
  return `replied ${keyword ?? "STOP"}`;
}

/**
 * "Texts blocked for (508) 555-1234" — per-number opt-outs on this client's
 * numbers (primary, phone list, contacts). Every send skips these numbers
 * while the client's other numbers still get texts. Only the texter can lift
 * one, by replying START.
 */
export function SmsOptOutsNotice({ clientId, phones }: { clientId: string; phones: (string | null | undefined)[] }) {
  const { data: optOuts = [] } = useClientSmsOptOuts(clientId, phones);
  if (optOuts.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <ul className="space-y-0.5">
        {optOuts.map((o) => (
          <li key={o.id} className="flex items-start gap-1.5">
            <MessageSquareOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Texts blocked for <span className="font-medium">{formatPhoneNumber(o.phoneLast10)}</span>
              <span className="text-amber-700/80 dark:text-amber-400/80">
                {" "}· {reason(o.source, o.matchedKeyword)} · {new Date(o.optedOutAt).toLocaleDateString()}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/80">
        Only the texter can undo this, by replying START.
      </p>
    </div>
  );
}
