import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ReportExportDocument } from "@/components/crm/reports/pdf/ReportExportDocument";

const groupedSchema = z.object({
  grandTotal: z.array(z.string()),
  groups: z.array(
    z.object({
      label: z.string(),
      subtotal: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
  ),
});

const exportRequestSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        columns: z.array(z.string()),
        rows: z.array(z.array(z.string())),
        grouped: groupedSchema.optional(),
      })
    )
    .min(1),
  charts: z
    .array(
      z.object({
        title: z.string(),
        bars: z.array(
          z.object({
            label: z.string(),
            value: z.number(),
            valueLabel: z.string(),
          })
        ),
      })
    )
    .optional(),
});

// Renders whatever ReportResult data the authenticated client already fetched
// (and is therefore already authorized to see) into a PDF — this route never
// queries the database itself, it's purely a formatting service.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid export request" },
      { status: 400 }
    );
  }

  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const buffer = await renderToBuffer(
    createElement(ReportExportDocument, {
      title: parsed.data.title,
      generatedAt,
      sections: parsed.data.sections,
      charts: parsed.data.charts,
    })
  );

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${parsed.data.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "report"}.pdf"`,
    },
  });
}
