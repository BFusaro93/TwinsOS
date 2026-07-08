import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  renderBlocksToHtml,
  resolveMergeTags,
  SAMPLE_MERGE_VALUES,
} from "@/lib/utils/document-template-renderer";
import { DocumentTemplatePdf } from "@/components/crm/documents/pdf/DocumentTemplatePdf";
import type { BlockType } from "@/types/crm-documents";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile?.org_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: template, error: tplErr } = await supabase
    .from("crm_document_templates")
    .select("id, org_id, name, subject, include_pdf")
    .eq("id", templateId)
    .single();
  if (tplErr || !template || template.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const body = await req.json() as {
    subject: string | null;
    blocks: Array<{ blockType: BlockType; orderIndex: number; content: string | null }>;
  };

  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    return NextResponse.json({ error: "Nothing to send — add at least one block" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.org_id)
    .single();

  const mergeVars: Record<string, string> = {
    ...SAMPLE_MERGE_VALUES,
    ...(org?.name ? { "[companyname]": org.name } : {}),
  };

  const rawSubject = body.subject ?? template.subject ?? template.name;
  const subject = `[TEST] ${resolveMergeTags(rawSubject, mergeVars)}`;
  const html = renderBlocksToHtml(
    [...body.blocks].sort((a, b) => a.orderIndex - b.orderIndex),
    mergeVars
  );

  let attachments: Array<{ filename: string; content: Buffer }> | undefined;
  if (template.include_pdf) {
    const sortedBlocks = [...body.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map((b) => ({
      ...b,
      content: b.content ? resolveMergeTags(b.content, mergeVars) : b.content,
    }));
    const pdfBuffer = await renderToBuffer(
      createElement(DocumentTemplatePdf, { blocks: sortedBlocks, title: template.name })
    );
    attachments = [{ filename: `${template.name.replace(/[^a-z0-9-_]+/gi, "-")}.pdf`, content: pdfBuffer }];
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: user.email,
    subject,
    html,
    ...(attachments ? { attachments } : {}),
  });

  if (sendErr) {
    console.error("[send-test-document] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send test email" }, { status: 500 });
  }

  return NextResponse.json({ sentTo: user.email });
}
