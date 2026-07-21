"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Download, Play, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCSV } from "@/lib/csv";
import {
  hydrateBuilder,
  useAnalysisConfigBuilder,
} from "@/lib/hooks/use-analysis-config-builder";
import {
  useCreateCustomReport,
  useCustomReport,
  useDeleteCustomReport,
  useRunAnalysis,
  useUpdateCustomReport,
} from "@/lib/hooks/use-report-center";
import { AnalysisConfigEditor } from "./AnalysisConfigEditor";
import { formatCellValue, ReportTable } from "./ReportTable";

export function CustomAnalysisBuilder({ reportId }: { reportId?: string }) {
  const router = useRouter();
  const { data: existing, isLoading: loadingExisting } = useCustomReport(reportId);
  const createReport = useCreateCustomReport();
  const updateReport = useUpdateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const runAnalysis = useRunAnalysis();

  const [name, setName] = useState("Untitled Analysis");
  const [description, setDescription] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const builder = useAnalysisConfigBuilder(undefined, () => runAnalysis.reset());

  // hydrate once when editing an existing analysis
  useEffect(() => {
    if (!existing || hydrated) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    hydrateBuilder(builder, existing.config);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, hydrated]);

  const { canRun, buildConfig } = builder;

  const handleRun = () => {
    const config = buildConfig();
    if (config) runAnalysis.mutate(config);
  };

  const handleSave = async () => {
    const config = buildConfig();
    if (!config || !name.trim()) return;
    setSaveError(null);
    try {
      if (reportId) {
        await updateReport.mutateAsync({
          id: reportId,
          name: name.trim(),
          description: description.trim() || null,
          config,
        });
      } else {
        const created = await createReport.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          config,
        });
        router.push(`/crm/admin/reports/analysis/${created.id}`);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!reportId) return;
    await deleteReport.mutateAsync(reportId);
    router.push("/crm/admin/reports?tab=custom");
  };

  const handleExport = () => {
    const result = runAnalysis.data;
    if (!result) return;
    downloadCSV(
      `${name.trim() || "analysis"}.csv`,
      result.columns.map((c) => c.label),
      result.rows.map((row) => result.columns.map((c) => formatCellValue(row[c.key], c.type)))
    );
  };

  const saving = createReport.isPending || updateReport.isPending;

  if (reportId && loadingExisting) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/crm/admin/reports?tab=custom">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            My Reports
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-80 text-base font-semibold"
              placeholder="Untitled Analysis"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-80 text-sm"
              placeholder="Description (optional)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!runAnalysis.data || runAnalysis.data.rows.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canRun || saving || !name.trim()}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Saving…" : reportId ? "Save Changes" : "Save Analysis"}
            </Button>
            {reportId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &quot;{name}&quot; will be removed from My Reports.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void handleDelete()}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <AnalysisConfigEditor builder={builder} />

      {builder.datasetDef && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">6. Run</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={handleRun} disabled={!canRun || runAnalysis.isPending}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {runAnalysis.isPending ? "Running…" : "Run Preview"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Preview is limited to 500 rows.
              </span>
            </CardContent>
          </Card>

          {runAnalysis.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analysis failed</AlertTitle>
              <AlertDescription>{runAnalysis.error.message}</AlertDescription>
            </Alert>
          )}
          {runAnalysis.data && <ReportTable result={runAnalysis.data} />}
        </>
      )}
    </div>
  );
}
