/**
 * Twilio's status page has ~190 components (Voice in Colombia, SMS in APAC, ...)
 * so its overall indicator is almost never "operational" — a monitor on the
 * overall status reads "down" for weeks over incidents that can't touch a US
 * SMS product. This reads Twilio's public Statuspage feed and judges only the
 * components Landscapt actually depends on.
 */

export type TwilioStatus = "ok" | "degraded" | "down" | "unknown";

export interface TwilioStatusResult {
  status: TwilioStatus;
  /** Relevant components that are not fully operational (names are public Twilio data). */
  affected: { name: string; status: string }[];
  checked: number;
}

interface StatuspageComponent {
  name: string;
  status: string;
  group?: boolean;
}

const COMPONENTS_URL = "https://status.twilio.com/api/v2/components.json";

// US SMS/MMS carriers (Twilio lists them under both CARRIER NETWORK and ZIPWHIP MESSAGING),
// plus the APIs the app calls: Programmable Messaging, Messaging Services, REST API, Trust Hub
// (A2P registration).
const NORTH_AMERICA_MESSAGING = /^(sms|mms) (long code|short code|toll-free), north america$/i;
const RELEVANT_EXACT = new Set(["programmable messaging api", "messaging services", "rest api", "trust hub"]);

export function isRelevantComponent(name: string): boolean {
  const n = name.trim();
  return NORTH_AMERICA_MESSAGING.test(n) || RELEVANT_EXACT.has(n.toLowerCase());
}

/** Pure so it can be tested against fabricated outages. `under_maintenance` is planned work and doesn't count. */
export function evaluateTwilioComponents(components: StatuspageComponent[]): TwilioStatusResult {
  const relevant = components.filter((c) => !c.group && isRelevantComponent(c.name));
  const affected = relevant
    .filter((c) => c.status !== "operational" && c.status !== "under_maintenance")
    .map((c) => ({ name: c.name, status: c.status }));
  const down = affected.some((c) => c.status === "partial_outage" || c.status === "major_outage");
  return {
    // An empty match means Twilio renamed things — say "unknown" rather than a false "ok".
    status: relevant.length === 0 ? "unknown" : down ? "down" : affected.length > 0 ? "degraded" : "ok",
    affected,
    checked: relevant.length,
  };
}

export async function fetchTwilioStatus(): Promise<TwilioStatusResult> {
  try {
    // Cached upstream for a minute so a 5-minute monitor (or a refresh storm) can't hammer Twilio.
    const res = await fetch(COMPONENTS_URL, { signal: AbortSignal.timeout(8000), next: { revalidate: 60 } });
    if (!res.ok) return { status: "unknown", affected: [], checked: 0 };
    const body = (await res.json()) as { components?: StatuspageComponent[] };
    return evaluateTwilioComponents(body.components ?? []);
  } catch {
    // Twilio's status page being unreachable isn't evidence that Twilio is down.
    return { status: "unknown", affected: [], checked: 0 };
  }
}
