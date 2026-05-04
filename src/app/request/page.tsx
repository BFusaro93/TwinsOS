/**
 * /request — entry point for the maintenance request portal.
 *
 * Authenticated users are redirected to /request/[their-org-slug] automatically.
 * Unauthenticated visitors see instructions to use the direct org URL.
 *
 * The sharable link for external use is always /request/[orgSlug].
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClipboardList } from "lucide-react";

export default async function RequestIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Logged-in user: look up their org slug and redirect to the slug portal.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profile?.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("slug")
        .eq("id", profile.org_id)
        .single();

      if (org?.slug) {
        redirect(`/request/${org.slug}`);
      }
    }
  }

  // Not logged in or org slug not found — show instructions.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <ClipboardList className="h-7 w-7 text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Maintenance Request Portal</h1>
          <p className="mt-2 text-sm text-slate-500">
            To submit a request, use the direct link provided by your organisation:
          </p>
          <p className="mt-3 rounded-md bg-slate-100 px-4 py-2 font-mono text-sm text-slate-700">
            /request/<span className="text-slate-400">your-org-slug</span>
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Contact your operations team if you need this link.
          </p>
        </div>
      </div>
    </div>
  );
}
