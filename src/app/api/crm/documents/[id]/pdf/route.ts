import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { DocumentTemplatePdf } from "@/components/crm/documents/pdf/DocumentTemplatePdf";
import { resolveMergeTags, SAMPLE_MERGE_VALUES } from "@/lib/utils/document-template-renderer";
import type { BlockType } from "@/types/crm-documents";

interface PdfBlockInput {
  blockType: BlockType;
  orderIndex: number;
  content: string | null;
}

async function loadOrgAndTemplate(supabase: Awaited<ReturnType<typeof createClient>>, templateId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: profile } = await sb.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: template, error: tplErr } = await sb
    .from("crm_document_templates")
    .select("id, org_id, name, subject")
    .eq("id", templateId)
    .single();
  if (tplErr || !template || template.org_id !== profile.org_id) {
    return { error: NextResponse.json({ error: "Document not found" }, { status: 404 }) } as const;
  }

  const { data: org } = await sb.from("organizations").select("name").eq("id", profile.org_id).single();
  return { template, orgName: org?.name as string | undefined } as const;
}

function resolveBlocks(blocks: PdfBlockInput[], orgName: string | undefined) {
  const mergeVars: Record<string, string> = {
    ...SAMPLE_MERGE_VALUES,
    ...(orgName ? { "[companyname]": orgName } : {}),
  };
  return blocks.map((b) => ({
    ...b,
    content: b.content ? resolveMergeTags(b.content, mergeVars) : b.content,
  }));
}

async function renderPdf(templateName: string, blocks: PdfBlockInput[], orgName: string | undefined) {
  const resolved = resolveBlocks(blocks, orgName);
  const buffer = await renderToBuffer(
    createElement(DocumentTemplatePdf, { blocks: resolved, title: templateName })
  );
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${templateName.replace(/[^a-z0-9-_]+/gi, "-")}.pdf"`,
    },
  });
}

// GET renders the template's currently-saved blocks.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const supabase = await createClient();
  const result = await loadOrgAndTemplate(supabase, templateId);
  if ("error" in result) return result.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: blocks } = await (supabase as any)
    .from("crm_document_blocks")
    .select("block_type, order_index, content")
    .eq("template_id", templateId)
    .order("order_index", { ascending: true });

  const input: PdfBlockInput[] = (blocks ?? []).map((b: { block_type: BlockType; order_index: number; content: string | null }) => ({
    blockType: b.block_type,
    orderIndex: b.order_index,
    content: b.content,
  }));

  return renderPdf(result.template.name, input, result.orgName);
}

// POST renders an in-progress (possibly unsaved) draft from the editor.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: templateId } = await params;
  const supabase = await createClient();
  const result = await loadOrgAndTemplate(supabase, templateId);
  if ("error" in result) return result.error;

  const body = await req.json() as { blocks: PdfBlockInput[] };
  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    return NextResponse.json({ error: "Nothing to render — add at least one block" }, { status: 400 });
  }

  return renderPdf(result.template.name, body.blocks, result.orgName);
}
