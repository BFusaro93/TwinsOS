"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MousePointer,
  MoveRight,
  Circle,
  Type,
  Pencil,
  Trash2,
  Save,
  Loader2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useJobPhoto } from "../hooks/useJobPhotos";
import { usePhotoAnnotation, useSaveAnnotation } from "../hooks/useAnnotations";
import { useCurrentUserStore } from "@/stores";
import { DRAW_COLORS } from "../types/photo.types";
import type { DrawTool, DrawColor } from "../types/photo.types";

// Use a loose type for the fabric canvas to avoid strict v7 type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;

interface AnnotationEditorProps {
  photoId: string;
  projectId: string;
}

export function AnnotationEditor({ photoId, projectId }: AnnotationEditorProps) {
  const router = useRouter();
  const { currentUser } = useCurrentUserStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas>(null);

  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<DrawColor>("#ef4444");
  const [fabricReady, setFabricReady] = useState(false);

  const { data: photo } = useJobPhoto(photoId);
  const { data: existingAnnotation } = usePhotoAnnotation(photoId);
  const { mutate: saveAnnotation, isPending: saving } = useSaveAnnotation(photoId, projectId);

  // ── Load Fabric.js dynamically (SSR-safe) ─────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || !photo?.publicUrl) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("fabric").then((mod: any) => {
      const fabric = mod.fabric ?? mod;
      const canvas = new fabric.Canvas(canvasRef.current, {
        selection: true,
        isDrawingMode: false,
      });
      fabricRef.current = canvas;

      // Support both Fabric.js v5 (callback API) and v6 (promise API)
      const ImageClass = fabric.FabricImage ?? fabric.Image;

      function applyImage(img: FabricCanvas) {
        const scaleX = 900 / (img.width ?? 900);
        const scaleY = 600 / (img.height ?? 600);
        const scale = Math.min(scaleX, scaleY, 1);
        canvas.setWidth((img.width ?? 900) * scale);
        canvas.setHeight((img.height ?? 600) * scale);
        img.set({ scaleX: scale, scaleY: scale, selectable: false, evented: false });
        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        if (existingAnnotation?.fabricJson) {
          canvas.loadFromJSON(existingAnnotation.fabricJson, () => canvas.renderAll());
        }
        setFabricReady(true);
      }

      // Pre-fetch the image as a blob to create a local object URL.
      // This sidesteps CORS entirely — Fabric's crossOrigin header on signed
      // Supabase Storage URLs can be silently rejected, keeping the spinner
      // spinning forever. A blob URL is same-origin and never has CORS issues.
      fetch(photo.publicUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          if (fabric.FabricImage) {
            // Fabric.js v6+ — fromURL returns a Promise
            ImageClass.fromURL(blobUrl)
              .then((img: FabricCanvas) => { applyImage(img); URL.revokeObjectURL(blobUrl); })
              .catch((err: unknown) => { console.error("[AnnotationEditor] image load failed", err); URL.revokeObjectURL(blobUrl); });
          } else {
            // Fabric.js v5 — fromURL uses callback
            ImageClass.fromURL(blobUrl, (img: FabricCanvas) => { applyImage(img); URL.revokeObjectURL(blobUrl); });
          }
        })
        .catch((err: unknown) => console.error("[AnnotationEditor] fetch failed", err));
    });

    return () => {
      fabricRef.current?.dispose();
      fabricRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.publicUrl]);

  // ── Apply tool ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricReady) return;
    canvas.isDrawingMode = tool === "freehand";
    if (tool === "freehand") {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = 4;
    }
    canvas.selection = tool === "select";
    canvas.defaultCursor = tool === "select" ? "default" : "crosshair";
  }, [tool, color, fabricReady]);

  // ── Click handlers for arrow / circle / text ──────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricReady || tool === "select" || tool === "freehand") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("fabric").then((mod: any) => {
      const fabric = mod.fabric ?? mod;
      let startX = 0;
      let startY = 0;

      function onDown(opt: FabricCanvas) {
        const ptr = canvas.getPointer(opt.e);
        startX = ptr.x;
        startY = ptr.y;
      }

      function onUp(opt: FabricCanvas) {
        const ptr = canvas.getPointer(opt.e);
        const dx = Math.abs(ptr.x - startX);
        const dy = Math.abs(ptr.y - startY);

        if (tool === "arrow" && (dx > 5 || dy > 5)) {
          const angle = Math.atan2(ptr.y - startY, ptr.x - startX);
          const headLen = 15;
          const pts = [
            { x: ptr.x, y: ptr.y },
            { x: ptr.x - headLen * Math.cos(angle - Math.PI / 7), y: ptr.y - headLen * Math.sin(angle - Math.PI / 7) },
            { x: ptr.x - headLen * Math.cos(angle + Math.PI / 7), y: ptr.y - headLen * Math.sin(angle + Math.PI / 7) },
            { x: ptr.x, y: ptr.y },
            { x: startX, y: startY },
          ];
          canvas.add(new fabric.Polyline(pts, { fill: "transparent", stroke: color, strokeWidth: 3 }));
        } else if (tool === "circle") {
          canvas.add(new fabric.Circle({ left: startX - 40, top: startY - 40, radius: 40, fill: "transparent", stroke: color, strokeWidth: 3 }));
        } else if (tool === "text") {
          canvas.add(new fabric.IText("Label", { left: ptr.x, top: ptr.y, fill: color, fontSize: 18, fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.4)" }));
        }
        canvas.renderAll();
      }

      canvas.on("mouse:down", onDown);
      canvas.on("mouse:up", onUp);
      return () => {
        canvas.off("mouse:down", onDown);
        canvas.off("mouse:up", onUp);
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, fabricReady]);

  function deleteSelected() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((obj: FabricCanvas) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  function undo() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objs = canvas.getObjects();
    if (objs.length > 0) canvas.remove(objs[objs.length - 1]);
    canvas.renderAll();
  }

  async function handleSave() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const fabricJson = canvas.toJSON() as Record<string, unknown>;
    const blob: Blob = await new Promise((res, rej) =>
      canvas.getElement().toBlob((b: Blob | null) => b ? res(b) : rej(new Error("toBlob failed")), "image/png", 1.0),
    );

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", currentUser.id).single();
    if (!profile?.org_id) { toast.error("Could not determine org"); return; }

    saveAnnotation(
      { fabricJson, compositeBlob: blob, orgId: profile.org_id },
      {
        onSuccess: () => { toast.success("Annotation saved"); router.push(`/jobs/${projectId}/photos`); },
        onError: () => toast.error("Failed to save annotation"),
      },
    );
  }

  const tools: { tool: DrawTool; icon: React.ReactNode; label: string }[] = [
    { tool: "select",   icon: <MousePointer className="h-4 w-4" />, label: "Select" },
    { tool: "arrow",    icon: <MoveRight className="h-4 w-4" />,    label: "Arrow" },
    { tool: "circle",   icon: <Circle className="h-4 w-4" />,       label: "Circle" },
    { tool: "text",     icon: <Type className="h-4 w-4" />,         label: "Text" },
    { tool: "freehand", icon: <Pencil className="h-4 w-4" />,       label: "Draw" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
        <div className="flex items-center gap-1">
          {tools.map((t) => (
            <button key={t.tool} title={t.label} onClick={() => setTool(t.tool)}
              className={cn("rounded-md p-2 transition-colors", tool === t.tool ? "bg-white/20 text-white" : "text-slate-400 hover:bg-slate-700 hover:text-white")}>
              {t.icon}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-slate-600" />
        <div className="flex items-center gap-1.5">
          {DRAW_COLORS.map((c) => (
            <button key={c.value} title={c.label} onClick={() => setColor(c.value)}
              style={{ backgroundColor: c.value }}
              className={cn("h-6 w-6 rounded-full border-2 transition-transform", color === c.value ? "scale-110 border-white" : "border-transparent hover:scale-105")}
            />
          ))}
        </div>
        <div className="h-5 w-px bg-slate-600" />
        <div className="flex items-center gap-1">
          <button title="Undo" onClick={undo} className="rounded-md p-2 text-slate-400 hover:bg-slate-700 hover:text-white"><Undo2 className="h-4 w-4" /></button>
          <button title="Delete selected" onClick={deleteSelected} className="rounded-md p-2 text-slate-400 hover:bg-red-900/50 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
        <Button size="sm" className="ml-auto gap-1.5" onClick={handleSave} disabled={saving || !fabricReady}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Annotation"}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        {tool === "arrow" && "Click and drag to draw an arrow"}
        {tool === "circle" && "Click to place a circle"}
        {tool === "text" && "Click to place a text label — double-click to edit"}
        {tool === "freehand" && "Draw freely on the photo"}
        {tool === "select" && "Click objects to select · Delete key removes selected"}
      </p>

      <div className="flex flex-1 items-start justify-center overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-4">
        {!fabricReady && <div className="flex h-64 w-full items-center justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        <canvas ref={canvasRef} className={cn(!fabricReady && "hidden")} />
      </div>
    </div>
  );
}
