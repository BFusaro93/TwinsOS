"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@/lib/hooks/use-crm-forms";
import { FormBuilder } from "@/components/crm/forms/FormBuilder";
import { FormConfigure } from "@/components/crm/forms/FormConfigure";
import { FormResponses } from "@/components/crm/forms/FormResponses";
import { FillOutFormDialog } from "@/components/crm/forms/FillOutFormDialog";
import { EmbedDialog } from "@/components/crm/forms/EmbedDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Code2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "builder" | "configure" | "responses";

export default function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: form, isLoading } = useForm(id);
  const [tab, setTab] = useState<Tab>("builder");
  const [fillOpen, setFillOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Form not found
      </div>
    );
  }

  const publicBaseUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const publicUrl = `${publicBaseUrl}/forms/${form.slug}`;

  const tabs: { key: Tab; label: string }[] = [
    { key: "builder",   label: "Design" },
    { key: "configure", label: "Configure" },
    { key: "responses", label: `Responses (${form.responseCount ?? 0})` },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={form.name}
        description={form.description ?? "Form builder and responses"}
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEmbedOpen(true)}
              title="Get embed code"
            >
              <Code2 className="mr-1.5 h-3.5 w-3.5" />
              Embed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFillOpen(true)}
            >
              <PenLine className="mr-1.5 h-3.5 w-3.5" />
              Fill Out Form
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/crm/communication/forms")}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              All Forms
            </Button>
          </div>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-3 px-1">
        {tabs.map(({ key, label }, idx) => (
          <div key={key} className="flex items-center gap-3">
            <button
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-colors",
                tab === key ? "text-brand-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                tab === key
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-400"
              )}>
                {idx + 1}
              </span>
              {label}
            </button>
            {idx < tabs.length - 1 && (
              <span className="text-slate-200 text-lg">›</span>
            )}
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === "builder" && (
          <FormBuilder form={form} publicBaseUrl={publicBaseUrl} />
        )}
        {tab === "configure" && (
          <FormConfigure form={form} />
        )}
        {tab === "responses" && (
          <FormResponses formId={id} />
        )}
      </div>

      <FillOutFormDialog
        form={form}
        open={fillOpen}
        onOpenChange={setFillOpen}
      />

      <EmbedDialog
        formName={form.name}
        slug={form.slug}
        publicUrl={publicUrl}
        open={embedOpen}
        onOpenChange={setEmbedOpen}
      />
    </div>
  );
}
