"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, LayoutGrid, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type GraphicLibraryItem,
  useDashboards,
  useDeleteSavedGraphic,
  useGraphicLibraryItems,
  useUpdateDashboard,
} from "@/lib/hooks/use-report-center";
import { panelFromGraphic } from "@/lib/reports/panel-from-graphic";
import type { Dashboard } from "@/types/crm-reports";

/** GraphicLibraryItem.id is prefixed ("system:"/"saved:") to keep the two id
 *  spaces from colliding — strip it to get the underlying crm_saved_graphics
 *  row id for API calls. */
function savedGraphicRowId(itemId: string): string {
  return itemId.replace(/^saved:/, "");
}

export function GraphicsLibraryList() {
  const { items, isLoading } = useGraphicLibraryItems();
  const deleteSavedGraphic = useDeleteSavedGraphic();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [addTarget, setAddTarget] = useState<GraphicLibraryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GraphicLibraryItem | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items]
  );

  const filtered = items.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Pre-made graphics ready to drop into any dashboard, plus any graphics
        you&apos;ve saved from your own dashboard panels.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search graphics…"
          className="h-9 w-64 text-sm"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-white py-16 text-center">
          <ImageIcon className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No graphics match</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="flex h-full flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{item.name}</CardTitle>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {item.isSystem ? "Built-in" : "My Graphics"}
                    </Badge>
                    {!item.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-600"
                        aria-label="Delete graphic"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="capitalize">{item.visual.type}</span>
                  <span>·</span>
                  <span>{item.category}</span>
                </div>
                {item.description && (
                  <p className="text-xs text-slate-500">{item.description}</p>
                )}
                <Button size="sm" variant="outline" onClick={() => setAddTarget(item)}>
                  Add to Dashboard
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddToDashboardDialog item={addTarget} onOpenChange={(open) => !open && setAddTarget(null)} />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this graphic?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be removed from your Graphics Library.
              Dashboards it&apos;s already been added to are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) deleteSavedGraphic.mutate(savedGraphicRowId(deleteTarget.id));
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddToDashboardDialog({
  item,
  onOpenChange,
}: {
  item: GraphicLibraryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: dashboards = [], isLoading } = useDashboards();
  const updateDashboard = useUpdateDashboard();
  const [dashboardId, setDashboardId] = useState<string>("");
  const [tabId, setTabId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const selected: Dashboard | undefined = dashboards.find((d) => d.id === dashboardId);
  const tabs = selected?.config.tabs ?? [];

  const handleDashboardChange = (id: string) => {
    setDashboardId(id);
    const d = dashboards.find((x) => x.id === id);
    setTabId(d?.config.tabs[0]?.id ?? "");
  };

  const handleAdd = async () => {
    if (!item || !selected || !tabId) return;
    setError(null);
    const panel = panelFromGraphic(item.name, item.visual);
    const nextTabs = selected.config.tabs.map((t) =>
      t.id === tabId ? { ...t, panels: [...t.panels, panel] } : t
    );
    try {
      await updateDashboard.mutateAsync({
        id: selected.id,
        name: selected.name,
        description: selected.description,
        config: { tabs: nextTabs },
      });
      onOpenChange(false);
      router.push(`/crm/admin/reports/dashboards/${selected.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add graphic");
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add &quot;{item?.name}&quot; to a Dashboard</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : dashboards.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No dashboards yet — create one first from Custom Dashboards.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-600">Dashboard</span>
              <Select value={dashboardId} onValueChange={handleDashboardChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a dashboard…" />
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tabs.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-600">Tab</span>
                <Select value={tabId} onValueChange={setTabId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Choose a tab…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabs.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              size="sm"
              onClick={() => void handleAdd()}
              disabled={!dashboardId || !tabId || updateDashboard.isPending}
            >
              {updateDashboard.isPending ? "Adding…" : "Add Graphic"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
