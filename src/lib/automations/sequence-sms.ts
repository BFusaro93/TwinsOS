import { sendClientSms } from "@/lib/sms/send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface ResolvedSmsContent {
  toPhone: string;
  bodyText: string;
}

/** Resolves a text-message step's [mergetag] placeholders against the client/org context. */
export async function resolveSmsStepContent(
  supabase: AnyClient,
  params: { orgId: string; clientId: string; bodyTemplate: string }
): Promise<ResolvedSmsContent | { error: string }> {
  const { data: client } = await supabase
    .from("clients")
    .select("display_name, primary_phone, sms_opt_in")
    .eq("id", params.clientId)
    .single();

  if (!client?.primary_phone) return { error: "client has no primary_phone" };
  if (!client.sms_opt_in) return { error: "client has not opted in to SMS" };

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .single();

  const clientDisplayName = (client.display_name as string) ?? "";
  const clientFirstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const orgName = (orgRow?.name as string) ?? "Your Service Provider";

  const mergeTags: Record<string, string> = {
    "[clientfirstname]": clientFirstName,
    "[clientfullname]": clientDisplayName,
    "[companyname]": orgName,
  };
  const resolve = (template: string) =>
    template.replace(/\[(\w+)\]/gi, (match) => mergeTags[match.toLowerCase()] ?? match);

  return {
    toPhone: client.primary_phone as string,
    bodyText: resolve(params.bodyTemplate || ""),
  };
}

/**
 * Sends fully-resolved SMS content via Twilio and logs it to the client's
 * activity timeline — the text-message analog of sendResolvedSequenceEmail.
 */
export async function sendResolvedSequenceSms(
  supabase: AnyClient,
  params: { orgId: string; clientId: string | null; toPhone: string; bodyText: string }
): Promise<{ ok: true; sid: string | null } | { ok: false; reason: string }> {
  const sendResult = await sendClientSms(supabase, {
    orgId: params.orgId,
    clientId: params.clientId,
    toPhone: params.toPhone,
    body: params.bodyText,
  });
  if (!sendResult.ok) return sendResult;
  return { ok: true, sid: sendResult.sid };
}
