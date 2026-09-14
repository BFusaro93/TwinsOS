import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createClient } from "@/lib/supabase/server";
import { mapPortalDocument } from "@/types/portal-document";
import PortalDocumentsList from "@/components/portal/PortalDocumentsList";
import type { PortalSettingsRow } from "@/lib/portal/portal-db";

export default async function PortalDocumentsPage() {
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = await createClient();

  const [settingsRes, documentsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("allow_documents")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: Pick<PortalSettingsRow, "allow_documents"> | null }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("portal_documents")
      .select("*")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .order("title", { ascending: true }),
  ]);

  const settings = settingsRes.data;

  // Only block if settings explicitly disable documents; missing row = allowed
  if (settings !== null && settings?.allow_documents === false) {
    redirect("/portal");
  }

  const documents = (documentsRes.data ?? []).map(mapPortalDocument);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Documents</h1>
        <p className="text-sm text-slate-500">Company files, instructions, and warranties</p>
      </div>
      <PortalDocumentsList documents={documents} />
    </div>
  );
}
