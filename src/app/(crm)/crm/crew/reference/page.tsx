"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openCrewReference, useCrewReference } from "@/lib/hooks/use-crew-app";
import { REFERENCE_CATEGORIES, referenceCategoryLabel, type ReferenceCategory } from "@/types/crm-reference";
import { t, crewIntlLocale } from "@/lib/crew-i18n";

/** The crew's Reference Library: labels, Safety Data Sheets, SOPs and training. */
export default function CrewReferencePage() {
  const { data: docs = [], isLoading } = useCrewReference();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | ReferenceCategory>("all");
  const [opening, setOpening] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(
      (d) => (category === "all" || d.category === category) && (!q || `${d.title} ${d.description ?? ""}`.toLowerCase().includes(q))
    );
  }, [docs, search, category]);
  const present = new Set(docs.map((d) => d.category));

  async function open(id: string) {
    setOpening(id);
    try {
      await openCrewReference(id);
    } catch {
      toast.error(t("Couldn't open the document — check your connection."));
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="bg-card border-b border-border px-4 pt-[env(safe-area-inset-top)] pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 py-2">
          <Button variant="outline" size="sm" className="gap-1.5 min-h-11" asChild>
            <Link href="/crm/crew"><ArrowLeft className="h-4 w-4" /> {t("Back")}</Link>
          </Button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-neutral-100">{t("Reference")}</h1>
        </div>
        <Input
          className="h-11 text-base"
          placeholder={t("Search labels, SDS, procedures…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[{ value: "all", label: "All" }, ...REFERENCE_CATEGORIES.filter((c) => present.has(c.value))].map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value as "all" | ReferenceCategory)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${
                category === c.value ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-card"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-2">
        {isLoading ? (
          <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {docs.length === 0 ? t("Your office hasn't added any documents yet.") : t("Nothing matches.")}
          </p>
        ) : (
          rows.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => void open(d.id)}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left min-h-14"
            >
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-neutral-100">{d.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {referenceCategoryLabel(d.category)}
                  {d.revisionDate ? ` · ${t("revised")} ${new Date(`${d.revisionDate}T00:00:00`).toLocaleDateString(crewIntlLocale(), { month: "short", day: "numeric", year: "numeric" })}` : ""}
                </span>
                {d.description && <span className="mt-0.5 block text-xs text-muted-foreground">{d.description}</span>}
              </span>
              {opening === d.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
