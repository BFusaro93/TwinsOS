"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Indent } from "@/lib/tiptap/indent";
import { TextStyle } from "@/lib/tiptap/text-style";
import { RICH_TEXT_FONTS, RICH_TEXT_FONT_SIZES, matchRichTextFont } from "@/lib/rich-text-fonts";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { forwardRef, useState, useEffect, useImperativeHandle, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getStorageOrgPrefix } from "@/lib/supabase/storage-org-prefix";
import { toast } from "sonner";

export interface RichTextEditorHandle {
  insertContent: (text: string) => void;
  focus: () => void;
}
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImageIcon,
  Palette,
  Highlighter,
  Strikethrough,
  Code2,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Minus,
  IndentIncrease,
  IndentDecrease,
} from "lucide-react";

const COLOR_SWATCHES = [
  "#000000", "#475569", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

// Same bucket/limits as the CRM Document Builder's image blocks — public
// (not signed URLs) because these need to stay resolvable indefinitely once
// embedded in a generated estimate PDF.
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const IMAGE_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const IMAGE_MAX_BYTES = 20 * 1024 * 1024; // keep in sync with the document-images bucket's file_size_limit

interface Props {
  value: string;           // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Show the image button + accept images. Off for notes, which are never rendered on a public page. */
  allowImages?: boolean;
}

const HIGHLIGHT_SWATCHES = [
  "#fef08a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fed7aa",
  "#e2e8f0", "#fca5a5", "#c4b5fd", "#99f6e4", "#ffffff",
];

function ColorPopover({
  title,
  icon,
  swatches = COLOR_SWATCHES,
  onPick,
}: {
  title: string;
  icon: React.ReactNode;
  swatches?: string[];
  onPick: (color: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-slate-700 dark:hover:text-neutral-300"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onPick(c)}
              className="h-6 w-6 rounded border border-border"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            Custom
            <input
              type="color"
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
              onChange={(e) => onPick(e.target.value)}
            />
          </label>
          <button type="button" className="rounded px-1.5 py-0.5 hover:bg-muted" onClick={() => onPick(null)}>
            Reset
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors
        ${active ? "bg-slate-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-slate-700 dark:hover:text-neutral-300"}`}
    >
      {children}
    </button>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
function RichTextEditor({ value, onChange, placeholder, minHeight = 120, allowImages = true }, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false }),
      Underline,
      TextStyle,
      Indent,
      Subscript,
      Superscript,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["paragraph"] }),
      ...(allowImages
        ? [
            Image.configure({
              // Drag a corner to resize; width/height are saved on the <img> and
              // carry through to the preview, email and PDF.
              resize: {
                enabled: true,
                directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
                minWidth: 40,
                minHeight: 40,
                alwaysPreserveAspectRatio: true,
              },
            }),
          ]
        : []),
    ],
    content: value || "",
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Return empty string for empty-looking docs
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: "outline-none prose prose-sm max-w-none",
        style: `min-height:${minHeight}px`,
      },
    },
  });

  useImperativeHandle(ref, () => ({
    insertContent: (text: string) => {
      editor?.chain().focus().insertContent(text).run();
    },
    focus: () => {
      editor?.commands.focus();
    },
  }), [editor]);

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (current !== incoming && incoming !== (current === "<p></p>" ? "" : current)) {
      editor.commands.setContent(incoming);
    }
  }, [value, editor]);

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !editor) return;

    if (!IMAGE_ALLOWED_TYPES.has(file.type)) {
      toast.error(
        file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name)
          ? "HEIC photos aren't supported yet — please use JPG, PNG, WEBP, GIF, or AVIF."
          : "Unsupported image type — please use JPG, PNG, WEBP, GIF, or AVIF."
      );
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — max size is 20MB.`);
      return;
    }

    try {
      const supabase = createClient();
      const orgPrefix = await getStorageOrgPrefix(supabase);
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${orgPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("document-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("document-images").getPublicUrl(path);
      editor.chain().focus().setImage({ src: data.publicUrl }).run();
    } catch (err) {
      console.error("[RichTextEditor] image upload failed", err);
      toast.error(err instanceof Error ? `Failed to upload image: ${err.message}` : "Failed to upload image");
    }
  }

  // Switching back from source view re-parses the HTML through the same
  // allowlist the client-facing pages use, so pasted markup can't smuggle in
  // anything the visual editor couldn't produce.
  function toggleSource() {
    if (!editor) return;
    if (sourceMode) {
      editor.commands.setContent(sanitizeHtml(sourceText));
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
      setSourceMode(false);
    } else {
      setSourceText(editor.getHTML());
      setSourceMode(true);
    }
  }

  if (!editor) return null;

  return (
    <div className="rounded-md border border-border focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400 transition-shadow">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-muted/40 px-2 py-1.5">
        <select
          title="Font family"
          value={matchRichTextFont(editor.getAttributes("textStyle").fontFamily as string | undefined)?.label ?? ""}
          onChange={(e) => editor.chain().focus().setTextStyle({ fontFamily: e.target.value || null }).run()}
          className="h-7 max-w-[7.5rem] rounded border border-border bg-card px-1 text-xs text-muted-foreground"
        >
          <option value="">Font</option>
          {RICH_TEXT_FONTS.map((f) => (
            <option key={f.label} value={f.label}>{f.label}</option>
          ))}
        </select>
        <select
          title="Font size"
          value={((editor.getAttributes("textStyle").fontSize as string | undefined) ?? "").replace("px", "")}
          onChange={(e) => editor.chain().focus().setTextStyle({ fontSize: e.target.value ? `${e.target.value}px` : null }).run()}
          className="h-7 w-14 rounded border border-border bg-card px-1 text-xs text-muted-foreground"
        >
          <option value="">Size</option>
          {RICH_TEXT_FONT_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("subscript")}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          title="Subscript"
        >
          <SubscriptIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("superscript")}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          title="Superscript"
        >
          <SuperscriptIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

        <ToolbarButton
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align center"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().outdent().run()} title="Decrease indent">
          <IndentDecrease className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().indent().run()} title="Increase indent">
          <IndentIncrease className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Table"
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${editor.isActive("table") ? "bg-slate-700 text-white" : "text-muted-foreground hover:bg-muted hover:text-slate-700 dark:hover:text-neutral-300"}`}
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            {([
              ["Insert table (3×3)", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false],
              ["Add row below", () => editor.chain().focus().addRowAfter().run(), true],
              ["Add column right", () => editor.chain().focus().addColumnAfter().run(), true],
              ["Delete row", () => editor.chain().focus().deleteRow().run(), true],
              ["Delete column", () => editor.chain().focus().deleteColumn().run(), true],
              ["Toggle header row", () => editor.chain().focus().toggleHeaderRow().run(), true],
              ["Delete table", () => editor.chain().focus().deleteTable().run(), true],
            ] as [string, () => void, boolean][]).map(([label, run, needsTable]) => (
              <button
                key={label}
                type="button"
                disabled={needsTable && !editor.isActive("table")}
                onClick={run}
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

        <ColorPopover
          title="Text color"
          icon={<Palette className="h-3.5 w-3.5" style={{ color: (editor.getAttributes("textStyle").color as string | undefined) ?? undefined }} />}
          onPick={(c) => editor.chain().focus().setTextStyle({ color: c }).run()}
        />
        <ColorPopover
          title="Highlight color"
          swatches={HIGHLIGHT_SWATCHES}
          icon={<Highlighter className="h-3.5 w-3.5" style={{ color: (editor.getAttributes("textStyle").backgroundColor as string | undefined) ?? undefined }} />}
          onPick={(c) => editor.chain().focus().setTextStyle({ backgroundColor: c }).run()}
        />

        {allowImages && (
          <>
            <div className="mx-1.5 h-4 w-px bg-slate-200 dark:bg-neutral-700" />

            <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insert image">
              <ImageIcon className="h-3.5 w-3.5" />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={handleImageFile}
            />
          </>
        )}

        <div className="ml-auto" />
        <ToolbarButton active={sourceMode} onClick={toggleSource} title="HTML source">
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="px-3 py-2 text-sm text-slate-800 dark:text-neutral-100">
        {!value && !editor.isFocused && (
          <p className="pointer-events-none absolute text-slate-400 dark:text-neutral-500 text-sm">{placeholder}</p>
        )}
        {sourceMode && (
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            spellCheck={false}
            className="w-full resize-y rounded border border-border bg-card p-2 font-mono text-xs"
            style={{ minHeight }}
          />
        )}
        <div className={sourceMode ? "hidden" : undefined}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <style>{`
        .ProseMirror ul { list-style-type: disc; padding-left: 1.25rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.25rem; }
        .ProseMirror p { margin: 0 0 0.25rem; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.25rem 0; table-layout: fixed; }
        .ProseMirror td, .ProseMirror th { border: 1px solid #cbd5e1; padding: 4px 8px; vertical-align: top; position: relative; }
        .ProseMirror th { background: #f1f5f9; font-weight: 600; text-align: left; }
        .ProseMirror .selectedCell { background: rgba(59,130,246,.15); }
        .ProseMirror hr { border: none; border-top: 1px solid #cbd5e1; margin: 0.5rem 0; }
        .ProseMirror sub { font-size: 0.75em; vertical-align: sub; }
        .ProseMirror sup { font-size: 0.75em; vertical-align: super; }
        .ProseMirror [data-resize-wrapper] { position: relative; display: inline-block; line-height: 0; }
        .ProseMirror [data-resize-handle] {
          width: 10px; height: 10px; z-index: 10; background: #fff;
          border: 2px solid #3b82f6; border-radius: 2px; opacity: 0; transition: opacity .1s;
        }
        .ProseMirror [data-resize-container]:hover [data-resize-handle],
        .ProseMirror [data-resize-container][data-resize-state="true"] [data-resize-handle],
        .ProseMirror .ProseMirror-selectednode [data-resize-handle] { opacity: 1; }
        .ProseMirror [data-resize-handle="top-left"] { margin: -5px 0 0 -5px; cursor: nwse-resize; }
        .ProseMirror [data-resize-handle="top-right"] { margin: -5px -5px 0 0; cursor: nesw-resize; }
        .ProseMirror [data-resize-handle="bottom-left"] { margin: 0 0 -5px -5px; cursor: nesw-resize; }
        .ProseMirror [data-resize-handle="bottom-right"] { margin: 0 -5px -5px 0; cursor: nwse-resize; }
      `}</style>
    </div>
  );
});
RichTextEditor.displayName = "RichTextEditor";
