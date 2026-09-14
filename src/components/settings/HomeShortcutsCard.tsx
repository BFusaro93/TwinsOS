"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import { parseHomeShortcuts, HOME_SHORTCUT_ICONS, type HomeShortcut } from "@/lib/home-shortcuts";

function blankShortcut(): HomeShortcut {
  return { id: crypto.randomUUID(), name: "", subtitle: "", icon: "Link2", url: "" };
}

// Editable list of external-app shortcut tiles shown on the home page
// (e.g. Samsara, Gusto). Stored in organizations.customizations.homeShortcuts.
export function HomeShortcutsCard() {
  const { data: orgSettings } = useOrgSettings();
  const { mutate: updateOrgSettings, isPending } = useUpdateOrgSettings();
  const [rows, setRows] = useState<HomeShortcut[]>([]);
  const seeded = useRef(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!orgSettings || seeded.current) return;
    seeded.current = true;
    setRows(parseHomeShortcuts(orgSettings.customizations));
  }, [orgSettings]);

  function updateRow(id: string, patch: Partial<HomeShortcut>) {
    setSaved(false);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setSaved(false);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setSaved(false);
    setRows((prev) => [...prev, blankShortcut()]);
  }

  function handleSave() {
    const cleaned = rows.filter((r) => r.name.trim() !== "" && r.url.trim() !== "");
    updateOrgSettings(
      { customizations: { homeShortcuts: cleaned } },
      { onSuccess: () => { setRows(cleaned); setSaved(true); } }
    );
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Home Page Shortcuts</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          External app tiles shown on the home page (e.g. Samsara, Gusto). Each opens in a new tab.
        </p>
      </div>
      <Separator />
      <div className="flex flex-col gap-4 px-6 py-4">
        {rows.length === 0 && (
          <p className="text-sm text-slate-400">No shortcuts yet.</p>
        )}
        {rows.map((row) => {
          const selectedIcon = HOME_SHORTCUT_ICONS.find((o) => o.key === row.icon) ?? HOME_SHORTCUT_ICONS[0];
          const SelectedIcon = selectedIcon.icon;
          return (
            <div key={row.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 md:flex-row md:items-start md:gap-3">
              <Select value={row.icon} onValueChange={(v) => updateRow(row.id, { icon: v })}>
                <SelectTrigger className="h-9 w-full md:w-32">
                  <SelectValue>
                    <span className="flex items-center gap-1.5">
                      <SelectedIcon className="h-4 w-4" />
                      {selectedIcon.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {HOME_SHORTCUT_ICONS.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      <span className="flex items-center gap-1.5">
                        <opt.icon className="h-4 w-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Name (e.g. Samsara)"
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                className="h-9 md:w-40"
              />
              <Input
                placeholder="Subtitle (e.g. Fleet & driver safety)"
                value={row.subtitle}
                onChange={(e) => updateRow(row.id, { subtitle: e.target.value })}
                className="h-9 md:flex-1"
              />
              <Input
                placeholder="https://example.com/login"
                value={row.url}
                onChange={(e) => updateRow(row.id, { url: e.target.value })}
                className="h-9 md:flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0 text-red-500 hover:text-red-600"
                onClick={() => removeRow(row.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Add Shortcut
          </Button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-brand-600">Saved</span>}
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
