"use client";

import { useRef, useState } from "react";
import {
  useSaveDocumentBlocks,
  useUpdateDocumentTemplate,
} from "@/lib/hooks/use-crm-documents";
import { RichTextEditor } from "@/components/crm/services/RichTextEditor";
import type { RichTextEditorHandle } from "@/components/crm/services/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AlignLeft,
  ChevronDown,
  GripVertical,
  List,
  MinusSquare,
  Move,
  Plus,
  Rows3,
  Signature,
  Trash2,
  Type,
  AlignCenter,
} from "lucide-react";
import { toast } from "sonner";
import {
  BLOCK_TYPE_LABELS,
  DOC_TYPE_LABELS,
  MERGE_TAGS_BY_TYPE,
} from "@/types/crm-documents";
import type {
  BlockType,
  DocType,
  DocumentBlock,
  DocumentTemplateWithBlocks,
  MergeTag,
} from "@/types/crm-documents";

// ── Block palette ─────────────────────────────────────────────────────────────

interface BlockDef {
  type: BlockType;
  icon: React.ReactNode;
  defaultContent: string;
  useRichText: boolean;
}

const BLOCK_PALETTE: BlockDef[] = [
  { type: "header",     icon: <Type className="h-4 w-4" />,        defaultContent: "<p><strong>[companyname]</strong></p>", useRichText: true },
  { type: "paragraph",  icon: <AlignLeft className="h-4 w-4" />,   defaultContent: "",                                      useRichText: true },
  { type: "list",       icon: <List className="h-4 w-4" />,        defaultContent: "<ul><li>Item one</li><li>Item two</li></ul>", useRichText: true },
  { type: "line_items", icon: <Rows3 className="h-4 w-4" />,       defaultContent: "",                                      useRichText: false },
  { type: "divider",    icon: <MinusSquare className="h-4 w-4" />, defaultContent: "",                                      useRichText: false },
  { type: "spacer",     icon: <Move className="h-4 w-4" />,        defaultContent: "",                                      useRichText: false },
  { type: "signature",  icon: <Signature className="h-4 w-4" />,   defaultContent: "<p>[companyname]<br>[companyphone]<br>[companyemail]</p>", useRichText: true },
  { type: "button",     icon: <AlignCenter className="h-4 w-4" />, defaultContent: "View Your Document",                   useRichText: false },
];

// ── Draft block ───────────────────────────────────────────────────────────────

interface DraftBlock extends Omit<DocumentBlock, "id" | "templateId" | "orgId" | "createdAt" | "updatedAt"> {
  _key: string;
}

function newBlock(def: BlockDef, orderIndex: number): DraftBlock {
  return {
    _key:       `${Date.now()}-${Math.random()}`,
    blockType:  def.type,
    orderIndex,
    content:    def.defaultContent || null,
    settings:   {},
  };
}

// ── Block canvas ──────────────────────────────────────────────────────────────

interface BlockCanvasProps {
  block: DraftBlock;
  active: boolean;
  onActivate: () => void;
  onChange: (content: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  editorRef: React.MutableRefObject<RichTextEditorHandle | null>;
}

function BlockCanvas({
  block, active, onActivate, onChange, onDelete,
  onMoveUp, onMoveDown, isFirst, isLast, editorRef,
}: BlockCanvasProps) {
  const isVisual = block.blockType === "divider" || block.blockType === "spacer";
  const def = BLOCK_PALETTE.find((d) => d.type === block.blockType);
  const useRichText = def?.useRichText ?? false;

  return (
    <div
      className={cn(
        "group relative rounded-lg border-2 bg-white transition-colors",
        active ? "border-brand-400 shadow-sm" : "border-transparent hover:border-slate-200"
      )}
      onClick={onActivate}
    >
      {/* Move / delete controls */}
      <div className="absolute -right-8 top-1 hidden flex-col items-center gap-0.5 group-hover:flex">
        {!isFirst && (
          <button onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="rounded p-0.5 hover:bg-slate-100" title="Move up">
            <ChevronDown className="h-3.5 w-3.5 rotate-180 text-slate-400" />
          </button>
        )}
        {!isLast && (
          <button onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="rounded p-0.5 hover:bg-slate-100" title="Move down">
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="rounded p-0.5 hover:bg-red-50" title="Delete block">
          <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
        </button>
      </div>

      <div className="p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {BLOCK_TYPE_LABELS[block.blockType]}
        </p>

        {isVisual ? (
          block.blockType === "divider" ? (
            <hr className="border-slate-300" />
          ) : (
            <div className="h-4 w-full rounded bg-slate-100" />
          )
        ) : block.blockType === "line_items" ? (
          <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
            <Rows3 className="mx-auto mb-2 h-6 w-6" />
            Line Items Table — populated automatically from the document
          </div>
        ) : block.blockType === "button" ? (
          <input
            type="text"
            value={block.content ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Button label"
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        ) : useRichText ? (
          <div onClick={(e) => e.stopPropagation()}>
            <RichTextEditor
              ref={editorRef}
              value={block.content ?? ""}
              onChange={onChange}
              placeholder={
                block.blockType === "header"    ? "Header text — use merge tags like [companyname]" :
                block.blockType === "signature" ? "Signature — use merge tags for contact info" :
                "Body text — use merge tags to personalize"
              }
              minHeight={block.blockType === "header" ? 60 : block.blockType === "paragraph" ? 120 : 80}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Settings dialog ───────────────────────────────────────────────────────────

function SettingsDialog({
  template,
  open,
  onOpenChange,
}: {
  template: DocumentTemplateWithBlocks;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const updateDoc = useUpdateDocumentTemplate(template.id);
  const [name, setName]             = useState(template.name);
  const [docType, setDocType]       = useState<DocType>(template.docType);
  const [subject, setSubject]       = useState(template.subject ?? "");
  const [desc, setDesc]             = useState(template.description ?? "");
  const [isDefault, setIsDefault]   = useState(template.isDefault);
  const [includePdf, setIncludePdf] = useState(template.includePdf);
  const [saving, setSaving]         = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateDoc.mutateAsync({ name, docType, subject: subject || null, description: desc || null, isDefault, includePdf });
      toast.success("Settings saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Document Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Email Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your estimate from [companyname]" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="is-default" checked={isDefault} onCheckedChange={(c) => setIsDefault(!!c)} />
            <Label htmlFor="is-default" className="cursor-pointer">Default document for this type</Label>
          </div>
          {(docType === "estimate" || docType === "invoice_email") && (
            <div className="flex items-center gap-3">
              <Checkbox id="include-pdf" checked={includePdf} onCheckedChange={(c) => setIncludePdf(!!c)} />
              <Label htmlFor="include-pdf" className="cursor-pointer">Include PDF attachment in email</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

interface Props {
  template: DocumentTemplateWithBlocks;
}

export function DocumentBuilder({ template }: Props) {
  const saveBlocks = useSaveDocumentBlocks(template.id);

  const [blocks, setBlocks]           = useState<DraftBlock[]>(() =>
    template.blocks.map((b) => ({ ...b, _key: b.id }))
  );
  const [activeKey, setActiveKey]     = useState<string | null>(null);
  const [dirty, setDirty]             = useState(false);
  const [saving, setSaving]           = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");

  // Map from block _key → editor ref for programmatic merge tag insertion
  const editorRefs = useRef<Record<string, React.MutableRefObject<RichTextEditorHandle | null>>>({});

  function getOrCreateRef(key: string): React.MutableRefObject<RichTextEditorHandle | null> {
    if (!editorRefs.current[key]) {
      editorRefs.current[key] = { current: null };
    }
    return editorRefs.current[key];
  }

  const mergeTags = MERGE_TAGS_BY_TYPE[template.docType] ?? [];
  const filteredMergeTags = mergeSearch
    ? mergeTags.filter((t) => t.label.toLowerCase().includes(mergeSearch.toLowerCase()) || t.tag.includes(mergeSearch))
    : mergeTags;

  const mergeGroups = filteredMergeTags.reduce<Record<string, MergeTag[]>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  function insertMergeTag(tag: string) {
    if (activeKey) {
      const ref = editorRefs.current[activeKey];
      if (ref?.current) {
        ref.current.insertContent(tag);
        return;
      }
    }
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(tag);
    toast.success(`Copied ${tag} — paste into a block`);
  }

  function addBlock(def: BlockDef) {
    const b = newBlock(def, blocks.length);
    setBlocks((prev) => [...prev, b]);
    setActiveKey(b._key);
    setDirty(true);
  }

  function updateContent(key: string, content: string) {
    setBlocks((prev) => prev.map((b) => b._key === key ? { ...b, content: content || null } : b));
    setDirty(true);
  }

  function deleteBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b._key !== key).map((b, i) => ({ ...b, orderIndex: i })));
    delete editorRefs.current[key];
    if (activeKey === key) setActiveKey(null);
    setDirty(true);
  }

  function moveBlock(key: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b._key === key);
      if (idx + dir < 0 || idx + dir >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next.map((b, i) => ({ ...b, orderIndex: i }));
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveBlocks.mutateAsync(
        blocks.map((b, i) => ({
          blockType:  b.blockType,
          orderIndex: i,
          content:    b.content,
          settings:   b.settings,
        }))
      );
      setDirty(false);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-[#4a4a4a] px-4 py-2">
        <span className="text-sm font-medium text-white">{template.name}</span>
        <span className={cn(
          "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          template.status === "active" ? "bg-green-500/20 text-green-300" : "bg-slate-500/20 text-slate-400"
        )}>
          {template.status === "active" ? "Active" : "Inactive"}
        </span>
        <span className="ml-1 text-xs text-slate-400">— {DOC_TYPE_LABELS[template.docType]}</span>

        <div className="ml-auto flex items-center gap-2">
          {template.subject && (
            <span className="hidden text-xs text-slate-400 md:block">
              Subject: <span className="text-slate-300">{template.subject}</span>
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setSettingsOpen(true)}
          >
            Edit Settings
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-brand-500 hover:bg-brand-600 text-white"
          >
            {saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="flex-1 overflow-y-auto bg-slate-100 px-8 py-8"
          onClick={() => setActiveKey(null)}
        >
          <div className="mx-auto max-w-2xl">
            {template.subject && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Subject Line</p>
                <p className="text-sm text-slate-700">{template.subject}</p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-6 pl-10 pr-10 shadow-sm">
              {blocks.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  Add blocks from the panel on the right to build your email template.
                </div>
              ) : (
                blocks.map((block, idx) => (
                  <BlockCanvas
                    key={block._key}
                    block={block}
                    active={activeKey === block._key}
                    onActivate={() => setActiveKey(block._key)}
                    onChange={(content) => updateContent(block._key, content)}
                    onDelete={() => deleteBlock(block._key)}
                    onMoveUp={() => moveBlock(block._key, -1)}
                    onMoveDown={() => moveBlock(block._key, 1)}
                    isFirst={idx === 0}
                    isLast={idx === blocks.length - 1}
                    editorRef={getOrCreateRef(block._key)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-64 shrink-0 overflow-y-auto border-l bg-white">
          {/* Block picker */}
          <div className="border-b p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Add Block</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BLOCK_PALETTE.map((def) => (
                <button
                  key={def.type}
                  onClick={() => addBlock(def)}
                  className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 p-2.5 text-center transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="text-slate-500">{def.icon}</span>
                  <span className="text-[10px] font-medium text-slate-600">{BLOCK_TYPE_LABELS[def.type]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Merge tags */}
          <div className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Merge Tags</p>
            <Input
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              placeholder="Search tags…"
              className="mb-2 h-7 text-xs"
            />
            <p className="mb-3 text-[10px] text-slate-400">
              {activeKey ? "Click a tag to insert it at your cursor." : "Click a block first, then click a tag to insert it."}
            </p>
            <div className="space-y-3">
              {Object.entries(mergeGroups).map(([group, tags]) => (
                <div key={group}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group}</p>
                  <div className="flex flex-wrap gap-1">
                    {tags.map((mt) => (
                      <button
                        key={mt.tag}
                        title={mt.label}
                        onClick={() => insertMergeTag(mt.tag)}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-mono transition-colors",
                          activeKey
                            ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {mt.tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SettingsDialog template={template} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
