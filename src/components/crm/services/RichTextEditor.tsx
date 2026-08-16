"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
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
} from "lucide-react";

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
        ${active ? "bg-slate-700 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}
    >
      {children}
    </button>
  );
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false }),
      Underline,
      TextAlign.configure({ types: ["paragraph"] }),
      Image,
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
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
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

  if (!editor) return null;

  return (
    <div className="rounded-md border border-slate-200 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400 transition-shadow">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
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

        <div className="mx-1.5 h-4 w-px bg-slate-200" />

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

        <div className="mx-1.5 h-4 w-px bg-slate-200" />

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

        <div className="mx-1.5 h-4 w-px bg-slate-200" />

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
      </div>

      {/* Editor area */}
      <div className="px-3 py-2 text-sm text-slate-800">
        {!value && !editor.isFocused && (
          <p className="pointer-events-none absolute text-slate-400 text-sm">{placeholder}</p>
        )}
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .ProseMirror ul { list-style-type: disc; padding-left: 1.25rem; }
        .ProseMirror ol { list-style-type: decimal; padding-left: 1.25rem; }
        .ProseMirror p { margin: 0 0 0.25rem; }
        .ProseMirror p:last-child { margin-bottom: 0; }
      `}</style>
    </div>
  );
});
RichTextEditor.displayName = "RichTextEditor";
