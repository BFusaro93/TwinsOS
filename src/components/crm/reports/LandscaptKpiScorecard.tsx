"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useLandscaptKpiActuals,
  useLandscaptKpiEntries,
  useLandscaptKpiScorecard,
  useUpdateLandscaptKpiScorecard,
  useUpsertLandscaptKpiEntry,
} from "@/lib/hooks/use-landscapt-kpi-scorecard";
import {
  CUSTOM_METRIC_PREFIX,
  DEFAULT_KPI_SCORECARD_CONFIG,
  KPI_CATALOG,
  KPI_CATALOG_BY_KEY,
  KPI_CATEGORY_LABELS,
  type KpiCategoryKey,
} from "@/lib/kpi/landscapt-kpi-catalog";
import {
  calcCategoryScore,
  calcProgress,
  formatKpiValue,
  kpiPlaceholder,
  scoreColorClass,
} from "@/lib/kpi/scorecard-math";
import type {
  KpiScorecardCategory,
  KpiScorecardConfig,
  KpiScorecardEntry,
  KpiScorecardMetric,
  KpiUnit,
} from "@/types/crm-kpi-scorecard";

// ── Metric resolution ─────────────────────────────────────────────────────────

interface ResolvedMetric {
  key: string;
  label: string;
  unit: KpiUnit;
  weight: number;
  lowerIsBetter: boolean;
  auto: boolean;
  source: string;
  snapshot: boolean;
  defaultTarget: number | null;
  custom: boolean;
}

/** Merges a saved scorecard row with its catalog definition (if any). */
function resolveMetric(m: KpiScorecardMetric): ResolvedMetric {
  const cat = KPI_CATALOG_BY_KEY.get(m.key);
  return {
    key: m.key,
    label: m.label ?? cat?.label ?? m.key,
    unit: m.unit ?? cat?.unit ?? "number",
    weight: m.weight,
    lowerIsBetter: m.lowerIsBetter ?? cat?.lowerIsBetter ?? false,
    auto: cat?.auto ?? false,
    source: cat?.source ?? "Manually entered.",
    snapshot: cat?.snapshot ?? false,
    defaultTarget: cat?.defaultTarget ?? null,
    custom: !cat,
  };
}

const UNIT_OPTIONS: Array<{ value: KpiUnit; label: string }> = [
  { value: "number", label: "#" },
  { value: "currency", label: "$" },
  { value: "percent", label: "%" },
  { value: "hours", label: "hrs" },
  { value: "days", label: "days" },
];

// ── Editable cell ─────────────────────────────────────────────────────────────

function EditableCell({
  value,
  unit,
  onSave,
}: {
  value: number | null;
  unit: KpiUnit;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : parseFloat(trimmed.replace(/[$,%]/g, ""));
    onSave(parsed === null || Number.isNaN(parsed) ? null : parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        className="w-28 rounded border border-blue-400 px-2 py-0.5 text-right text-sm outline-none ring-1 ring-blue-400"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={`w-full text-right text-sm ${
        value !== null ? "font-medium text-slate-800" : "text-slate-400 hover:text-blue-500"
      }`}
      title="Click to edit"
    >
      {value !== null ? formatKpiValue(value, unit) : kpiPlaceholder(unit)}
    </button>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-slate-600">{pct}%</span>
    </div>
  );
}

function AutoBadge({ source, snapshot }: { source: string; snapshot: boolean }) {
  return (
    <span
      className="cursor-help rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-500"
      title={snapshot ? `${source} (Point-in-time value, not scoped to the selected year.)` : source}
    >
      auto
    </span>
  );
}

// ── View-mode category card ───────────────────────────────────────────────────

interface EntryMap {
  get(key: string): KpiScorecardEntry | undefined;
}

function resolveValues(
  metric: ResolvedMetric,
  entries: EntryMap,
  computed: Record<string, number | null>
): { target: number | null; actual: number | null } {
  const entry = entries.get(metric.key);
  const target = entry?.targetValue ?? metric.defaultTarget;
  const actual = metric.auto ? computed[metric.key] ?? null : entry?.actualValue ?? null;
  return { target, actual };
}

function ReadOnlyValue({ value, unit }: { value: number | null; unit: KpiUnit }) {
  return (
    <span className={`block text-right text-sm ${value !== null ? "font-medium text-slate-800" : "text-slate-400"}`}>
      {value !== null ? formatKpiValue(value, unit) : "—"}
    </span>
  );
}

function CategoryCard({
  category,
  entries,
  computed,
  canEdit,
  onSaveTarget,
  onSaveActual,
}: {
  category: KpiScorecardCategory;
  entries: EntryMap;
  computed: Record<string, number | null>;
  /** manage_report_center — without it targets and manual actuals are read-only. */
  canEdit: boolean;
  onSaveTarget: (metricKey: string, value: number | null) => void;
  onSaveActual: (metricKey: string, value: number | null) => void;
}) {
  const resolved = category.metrics.map(resolveMetric);
  const score = calcCategoryScore(
    resolved.map((m) => ({ ...m, ...resolveValues(m, entries, computed) }))
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-800">{category.label}</h2>
        <div
          className={`flex h-10 w-16 items-center justify-center rounded-full ${scoreColorClass(score)} text-sm font-bold text-white shadow-sm`}
        >
          {score}%
        </div>
      </div>

      {resolved.length === 0 ? (
        <p className="px-6 py-6 text-sm text-slate-400">No metrics in this category yet. Use Customize to add some.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 text-left">Metric</th>
                <th className="border-l border-slate-200 px-4 py-3 text-right">Target</th>
                <th className="border-l border-slate-200 px-4 py-3 text-right">Actual</th>
                <th className="border-l border-slate-200 px-4 py-3 text-right">Progress</th>
                <th className="border-l border-slate-200 px-4 py-3 text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((metric, idx) => {
                const { target, actual } = resolveValues(metric, entries, computed);
                const pct = calcProgress(actual, target, metric.lowerIsBetter);
                return (
                  <tr
                    key={metric.key}
                    className={`border-b border-slate-100 last:border-0 ${idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}
                  >
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {metric.label}
                      {metric.lowerIsBetter && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400" title="Lower is better">
                          ↓
                        </span>
                      )}
                    </td>
                    <td className="border-l border-slate-100 px-4 py-3">
                      {canEdit ? (
                        <EditableCell value={target} unit={metric.unit} onSave={(v) => onSaveTarget(metric.key, v)} />
                      ) : (
                        <ReadOnlyValue value={target} unit={metric.unit} />
                      )}
                    </td>
                    <td className="border-l border-slate-100 px-4 py-3">
                      {metric.auto ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={`text-sm font-medium ${actual !== null ? "text-slate-800" : "text-slate-400"}`}>
                            {actual !== null ? formatKpiValue(actual, metric.unit) : "—"}
                          </span>
                          <AutoBadge source={metric.source} snapshot={metric.snapshot} />
                        </div>
                      ) : canEdit ? (
                        <EditableCell value={actual} unit={metric.unit} onSave={(v) => onSaveActual(metric.key, v)} />
                      ) : (
                        <ReadOnlyValue value={actual} unit={metric.unit} />
                      )}
                    </td>
                    <td className="border-l border-slate-100 px-4 py-3">
                      <ProgressBar pct={pct} />
                    </td>
                    <td className="border-l border-slate-100 px-4 py-3 text-right font-medium text-slate-600">
                      {metric.weight}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Customize-mode category editor ───────────────────────────────────────────

const CATEGORY_ORDER: KpiCategoryKey[] = ["financial", "operations", "sales", "people"];

function CategoryEditor({
  category,
  usedKeys,
  onChange,
  onRemove,
}: {
  category: KpiScorecardCategory;
  usedKeys: Set<string>;
  onChange: (next: KpiScorecardCategory) => void;
  onRemove: () => void;
}) {
  const [pick, setPick] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customUnit, setCustomUnit] = useState<KpiUnit>("number");

  const totalWeight = category.metrics.reduce((s, m) => s + (Number.isFinite(m.weight) ? m.weight : 0), 0);

  function updateMetric(idx: number, patch: Partial<KpiScorecardMetric>) {
    onChange({
      ...category,
      metrics: category.metrics.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    });
  }
  function removeMetric(idx: number) {
    onChange({ ...category, metrics: category.metrics.filter((_, i) => i !== idx) });
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...category.metrics];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...category, metrics: next });
  }
  function addFromCatalog(key: string) {
    if (!key || usedKeys.has(key)) return;
    onChange({ ...category, metrics: [...category.metrics, { key, weight: 10 }] });
    setPick("");
  }
  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const key = `${CUSTOM_METRIC_PREFIX}${crypto.randomUUID()}`;
    onChange({
      ...category,
      metrics: [...category.metrics, { key, label, unit: customUnit, weight: 10 }],
    });
    setCustomLabel("");
    setCustomUnit("number");
  }

  const available = KPI_CATALOG.filter((m) => !usedKeys.has(m.key));

  return (
    <div className="overflow-hidden rounded-2xl border border-dashed border-blue-300 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-blue-50/40 px-6 py-3">
        <Input
          value={category.label}
          onChange={(e) => onChange({ ...category, label: e.target.value })}
          className="h-9 max-w-xs text-base font-bold"
          aria-label="Category name"
        />
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
            totalWeight === 100 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
          }`}
          title="Weights are relative within a category; 100% total is the convention."
        >
          Weights: {totalWeight}%
        </span>
        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={onRemove} title="Remove category">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="divide-y divide-slate-100">
        {category.metrics.map((m, idx) => {
          const r = resolveMetric(m);
          return (
            <div key={m.key} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
              <div className="flex flex-col">
                <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1"
                  onClick={() => move(idx, 1)}
                  disabled={idx === category.metrics.length - 1}
                  title="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="min-w-0 flex-1">
                {r.custom ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={m.label ?? ""}
                      onChange={(e) => updateMetric(idx, { label: e.target.value })}
                      className="h-8 max-w-xs"
                      aria-label="Metric name"
                    />
                    <select
                      value={m.unit ?? "number"}
                      onChange={(e) => updateMetric(idx, { unit: e.target.value as KpiUnit })}
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
                      aria-label="Unit"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{r.label}</span>
                    {r.auto ? (
                      <AutoBadge source={r.source} snapshot={r.snapshot} />
                    ) : (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500" title={r.source}>
                        manual
                      </span>
                    )}
                  </div>
                )}
                <p className="mt-0.5 truncate text-xs text-slate-400" title={r.source}>
                  {r.source}
                </p>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={m.lowerIsBetter ?? r.lowerIsBetter}
                  onChange={(e) => updateMetric(idx, { lowerIsBetter: e.target.checked })}
                />
                Lower is better
              </label>

              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                Weight
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={m.weight}
                  onChange={(e) => updateMetric(idx, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="h-8 w-16 rounded-md border border-slate-200 px-2 text-right text-sm"
                />
                %
              </label>

              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600" onClick={() => removeMetric(idx)} title="Remove metric">
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        <select
          value={pick}
          onChange={(e) => addFromCatalog(e.target.value)}
          className="h-9 min-w-[260px] rounded-md border border-slate-200 bg-white px-2 text-sm"
          aria-label="Add a metric"
        >
          <option value="">+ Add a metric…</option>
          {CATEGORY_ORDER.map((catKey) => {
            const group = available.filter((m) => m.category === catKey);
            if (group.length === 0) return null;
            return (
              <optgroup key={catKey} label={KPI_CATEGORY_LABELS[catKey]}>
                {group.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} · {m.auto ? "auto" : "manual"}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>

        <span className="text-xs text-slate-400">or</span>

        <div className="flex items-center gap-2">
          <Input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustom();
            }}
            placeholder="Custom metric name"
            className="h-9 w-52"
          />
          <select
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value as KpiUnit)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            aria-label="Custom metric unit"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={addCustom} disabled={!customLabel.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add manual metric
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main scorecard ────────────────────────────────────────────────────────────

export function LandscaptKpiScorecard() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1].map(String);
  const [period, setPeriod] = useState(String(currentYear));
  const [draft, setDraft] = useState<KpiScorecardConfig | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { can } = usePermissions();
  const canManage = can("manage_report_center");
  const { data: scorecard, isLoading: loadingScorecard, error: scorecardError } = useLandscaptKpiScorecard();
  const { data: actuals, isLoading: loadingActuals } = useLandscaptKpiActuals(period);
  const { data: entries = [] } = useLandscaptKpiEntries(scorecard?.id, period);
  const { mutate: upsertEntry } = useUpsertLandscaptKpiEntry();
  const { mutateAsync: saveScorecard, isPending: saving } = useUpdateLandscaptKpiScorecard();

  const entryMap = useMemo(() => new Map(entries.map((e) => [e.metricKey, e])), [entries]);
  const computed = useMemo(() => actuals?.values ?? {}, [actuals]);
  const config = scorecard?.config ?? DEFAULT_KPI_SCORECARD_CONFIG;

  const overallScore = useMemo(() => {
    if (config.categories.length === 0) return 0;
    const sum = config.categories.reduce((acc, cat) => {
      const scored = cat.metrics.map(resolveMetric).map((m) => ({ ...m, ...resolveValues(m, entryMap, computed) }));
      return acc + calcCategoryScore(scored);
    }, 0);
    return Math.round(sum / config.categories.length);
  }, [config, entryMap, computed]);

  const lastUpdated = entries.reduce<string | null>((latest, e) => {
    if (!e.updatedAt) return latest;
    return !latest || e.updatedAt > latest ? e.updatedAt : latest;
  }, null);

  const canEdit = canManage && !!scorecard?.id;
  function saveTarget(metricKey: string, value: number | null) {
    if (!scorecard?.id) return;
    upsertEntry({ scorecardId: scorecard.id, period, metricKey, targetValue: value });
  }
  function saveActual(metricKey: string, value: number | null) {
    if (!scorecard?.id) return;
    upsertEntry({ scorecardId: scorecard.id, period, metricKey, actualValue: value });
  }

  async function commitDraft() {
    if (!draft) return;
    setSaveError(null);
    try {
      await saveScorecard({ config: draft });
      setDraft(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save scorecard");
    }
  }

  const editing = draft !== null;
  const usedKeys = new Set((draft ?? config).categories.flatMap((c) => c.metrics.map((m) => m.key)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="KPI Scorecard"
        description={
          editing
            ? "Add, remove, and weight metrics. Metrics marked auto are computed from your Landscapt data; the rest are entered by hand."
            : `Annual goals scored from live Landscapt data${
                lastUpdated
                  ? ` · Manual entries last updated ${new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : ""
              }`
        }
        action={
          editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_KPI_SCORECARD_CONFIG)} title="Restore the default layout">
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to default
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={commitDraft} disabled={saving}>
                {saving ? "Saving…" : "Save layout"}
              </Button>
            </>
          ) : (
            <>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Year"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <div className={`flex items-center gap-2 rounded-full ${scoreColorClass(overallScore)} px-4 py-2 text-sm font-bold text-white shadow-sm`}>
                <span>Overall</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5">{overallScore}%</span>
              </div>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setDraft(structuredClone(config))} disabled={!scorecard}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" /> Customize
                </Button>
              )}
            </>
          )
        }
      />

      {scorecardError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scorecardError.message}
        </p>
      )}
      {saveError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
      )}

      {loadingScorecard && !scorecard ? (
        <p className="text-sm text-slate-400">Loading scorecard…</p>
      ) : editing && draft ? (
        <>
          {draft.categories.map((cat, idx) => (
            <CategoryEditor
              key={cat.key}
              category={cat}
              usedKeys={usedKeys}
              onChange={(next) =>
                setDraft({ ...draft, categories: draft.categories.map((c, i) => (i === idx ? next : c)) })
              }
              onRemove={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== idx) })}
            />
          ))}
          <Button
            variant="outline"
            className="self-start"
            onClick={() =>
              setDraft({
                ...draft,
                categories: [
                  ...draft.categories,
                  { key: `cat-${crypto.randomUUID().slice(0, 8)}`, label: "New Category", metrics: [] },
                ],
              })
            }
            disabled={draft.categories.length >= 12}
          >
            <Plus className="mr-1 h-4 w-4" /> Add category
          </Button>
        </>
      ) : (
        <>
          {config.categories.map((cat) => (
            <CategoryCard
              key={cat.key}
              category={cat}
              entries={entryMap}
              computed={computed}
              canEdit={canEdit}
              onSaveTarget={saveTarget}
              onSaveActual={saveActual}
            />
          ))}
          <p className="text-center text-xs text-slate-400">
            {canEdit
              ? "Click any Target (or a manual Actual) to edit — changes save automatically. "
              : "Editing targets, manual actuals, and the layout requires the Manage Report Center permission. "}
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-500">auto</span>{" "}
            values are computed from Landscapt data for {period}
            {loadingActuals ? " (refreshing…)" : actuals ? ` as of ${new Date(actuals.computedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
            . Hover a badge for the definition.
          </p>
        </>
      )}
    </div>
  );
}
