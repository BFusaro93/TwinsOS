/**
 * Returns the latest CRM report HTML directly so the iframe can load it
 * as a real document (proper CSS scoping, no srcdoc size limits).
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const revalidate = 0; // always fetch fresh

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_reports")
    .select("html_content, updated_at")
    .eq("id", "latest")
    .single();

  if (error || !data) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;color:#666">
        <h2>No CRM report available yet.</h2>
        <p>Upload Service Autopilot screenshots and ask Claude to generate the CRM report.</p>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new NextResponse(data.html_content, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(data.updated_at ? { "X-CRM-Updated": data.updated_at } : {}),
    },
  });
}
