"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;

interface AnnotationEditorProps {
  photoId: string;
  projectId: string;
}

export function AnnotationEditor({ photoId, projectId }: AnnotationEditorProps) {
  const router = useRouter();
  const { currentUser } = useCurrentUserStore();
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const fabricRef      = useRef<FabricCanvas>(null);
  // Stores the removeEventListener calls added inside the async init so the
  // synchronous effect cleanup can reach them even if the component unmounts early.
  const domCleanupRef  = useRef<(() => void) | null>(null);
  // Store current tool/color in refs so event handlers always see the latest values
  const toolRef    = useRef<DrawTool>("select");
  const colorRef   = useRef<DrawColor>("#ef4444");

  const [tool,  setToolState]  = useState<DrawTool>("select");
  const [color, setColorState] = useState<DrawColor>("#ef4444");
  const [fabricReady, setFabricReady] = useState(false);

  function setTool(t: DrawTool)  { toolRef.current  = t; setToolState(t); }
  function setColor(c: DrawColor){ colorRef.current = c; setColorState(c); }

  const { data: photo } = useJobPhoto(photoId);
  const { data: existingAnnotation } = usePhotoAnnotation(photoId);
  const { mutate: saveAnnotation, isPending: saving } = useSaveAnnotation(photoId, projectId);

  // ── Load Fabric.js + image ─────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || !photo?.publicUrl) return;

    let disposed = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("fabric").then(async (mod: any) => {
      if (disposed) return;
      const fabric = mod.fabric ?? mod;

      const canvas = new fabric.Canvas(canvasRef.current, {
        selection: true,
        isDrawingMode: false,
      });
      fabricRef.current = canvas;

      // v7: must create a PencilBrush manually — freeDrawingBrush is not auto-created
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = colorRef.current;
      canvas.freeDrawingBrush.width = 4;

      // Attach native pointer events to the UPPER canvas (where Fabric also listens).
      // Fabric's own selection and freehand brush handlers also live on upperCanvasEl,
      // so attaching here means both our handlers AND Fabric's handlers fire for the
      // same events — no interference, no Fabric event-system uncertainty.
      const upper = canvas.upperCanvasEl as HTMLElement;

      let startX = 0;
      let startY = 0;

      function getCanvasXY(e: PointerEvent): { x: number; y: number } {
        const rect = upper.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }

      function onPointerDown(e: PointerEvent) {
        const pt = getCanvasXY(e);
        startX = pt.x;
        startY = pt.y;
      }

      function onPointerUp(e: PointerEvent) {
        const t = toolRef.current;
        const c = colorRef.current;
        // For select and freehand, Fabric's own handlers do the work — bail out.
        if (t === "select" || t === "freehand") return;

        const pt  = getCanvasXY(e);
        const dx  = Math.abs(pt.x - startX);
        const dy  = Math.abs(pt.y - startY);

        if (t === "arrow" && (dx > 5 || dy > 5)) {
          const angle   = Math.atan2(pt.y - startY, pt.x - startX);
          const headLen = 15;
          const pts = [
            { x: pt.x,   y: pt.y },
            { x: pt.x - headLen * Math.cos(angle - Math.PI / 7), y: pt.y - headLen * Math.sin(angle - Math.PI / 7) },
            { x: pt.x - headLen * Math.cos(angle + Math.PI / 7), y: pt.y - headLen * Math.sin(angle + Math.PI / 7) },
            { x: pt.x,   y: pt.y },
            { x: startX, y: startY },
          ];
          canvas.add(new fabric.Polyline(pts, { fill: "transparent", stroke: c, strokeWidth: 3 }));
        } else if (t === "circle") {
          canvas.add(new fabric.Circle({ left: startX - 40, top: startY - 40, radius: 40, fill: "transparent", stroke: c, strokeWidth: 3 }));
        } else if (t === "text") {
          canvas.add(new fabric.IText("Label", { left: startX, top: startY, fill: c, fontSize: 18, fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.4)" }));
        }
        canvas.renderAll();
      }

      upper.addEventListener("pointerdown", onPointerDown);
      upper.addEventListener("pointerup",   onPointerUp);
      // Store DOM cleanup so the effect cleanup (outside the Promise) can call it.
      domCleanupRef.current = () => {
        upper.removeEventListener("pointerdown", onPointerDown);
        upper.removeEventListener("pointerup",   onPointerUp);
      };

      // ── Load image ──────────────────────────────────────────────────────────
      const ImageClass: { fromURL: (url: string) => Promise<FabricCanvas> } =
        fabric.FabricImage ?? fabric.Image;

      try {
        const r    = await fetch(photo.publicUrl!);
        if (disposed) return;
        const blob = await r.blob();
        const blobUrl = URL.createObjectURL(blob);

        const img: FabricCanvas = await ImageClass.fromURL(blobUrl);
        URL.revokeObjectURL(blobUrl);
        if (disposed) return;

        // Use the underlying <img> element's natural dimensions — the FabricImage
        // property may be 0 before the first render cycle.
        const el      = img.getElement?.() as HTMLImageElement | undefined;
        const naturalW = el?.naturalWidth  || img.width  || 900;
        const naturalH = el?.naturalHeight || img.height || 600;

        // Scale to fill available container width (minus padding), max 1 (no upscale)
        const containerW = (containerRef.current?.clientWidth  ?? 900) - 32;
        const containerH = (containerRef.current?.clientHeight ?? 600) - 32;
        const scale = Math.min(containerW / naturalW, containerH / naturalH, 1);
        const w = Math.round(naturalW * scale);
        const h = Math.round(naturalH * scale);

        // v7: setWidth/setHeight removed
        canvas.setDimensions({ width: w, height: h });

        img.set({
          left: 0, top: 0,
          originX: "left", originY: "top",
          scaleX: scale, scaleY: scale,
          selectable: false, evented: false,
        });
        canvas.backgroundImage = img;
        canvas.renderAll();

        if (existingAnnotation?.fabricJson) {
          await canvas.loadFromJSON(existingAnnotation.fabricJson);
          canvas.renderAll();
        }

        if (!disposed) setFabricReady(true);
      } catch (err: unknown) {
        console.error("[AnnotationEditor] failed to load image", err);
      }
    });

    return () => {
      disposed = true;
      domCleanupRef.current?.();
      domCleanupRef.current = null;
      fabricRef.current?.dispose();
      fabricRef.current = null;
      setFabricReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.publicUrl]);

  // ── Sync tool / color changes to the canvas ────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !fabricReady) return;
    canvas.isDrawingMode = tool === "freehand";
    if (tool === "freehand" && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = color;
      canvas.freeDrawingBrush.width = 4;
    }
    canvas.selection      = tool === "select";
    canvas.defaultCursor  = tool === "select" ? "default" : "crosshair";
  }, [tool, color, fabricReady]);

  // ── Helpers ────────────────────────────────────────────────────────────────

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
      canvas.getElement().toBlob(
        (b: Blob | null) => (b ? res(b) : rej(new Error("toBlob failed"))),
        "image/png",
        1.0,
      ),
    );

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles").select("org_id").eq("id", currentUser.id).single();
    if (!profile?.org_id) { toast.error("Could not determine org"); return; }

    saveAnnotation(
      { fabricJson, compositeBlob: blob, orgId: profile.org_id },
      {
        onSuccess: () => { toast.success("Annotation saved"); router.push(`/jobs/${projectId}/photos`); },
        onError:   () => toast.error("Failed to save annotation"),
      },
    );
  }

  const tools: { tool: DrawTool; icon: React.ReactNode; label: string }[] = [
    { tool: "select",   icon: <MousePointer className="h-4 w-4" />, label: "Select" },
    { tool: "arrow",    icon: <MoveRight    className="h-4 w-4" />, label: "Arrow" },
    { tool: "circle",   icon: <Circle       className="h-4 w-4" />, label: "Circle" },
    { tool: "text",     icon: <Type         className="h-4 w-4" />, label: "Text" },
    { tool: "freehand", icon: <Pencil       className="h-4 w-4" />, label: "Draw" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#3a3a3a] bg-[#2a2a2a] p-3">
        <div className="flex items-center gap-1">
          {tools.map((t) => (
            <button
              key={t.tool}
              title={t.label}
              onClick={() => setTool(t.tool)}
              className={cn(
                "rounded-md p-2 transition-colors",
                tool === t.tool
                  ? "bg-white/20 text-brand-400"
                  : "text-brand-500 hover:bg-[#3a3a3a] hover:text-brand-400",
              )}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-[#4a4a4a]" />
        <div className="flex items-center gap-1.5">
          {DRAW_COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => setColor(c.value)}
              style={{ backgroundColor: c.value }}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                color === c.value ? "scale-110 border-white" : "border-transparent hover:scale-105",
              )}
            />
          ))}
        </div>
        <div className="h-5 w-px bg-[#4a4a4a]" />
        <div className="flex items-center gap-1">
          <button title="Undo" onClick={undo}
            className="rounded-md p-2 text-brand-500 hover:bg-[#3a3a3a] hover:text-brand-400">
            <Undo2 className="h-4 w-4" />
          </button>
          <button title="Delete selected" onClick={deleteSelected}
            className="rounded-md p-2 text-brand-500 hover:bg-red-950/70 hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <Button
          size="sm"
          className="ml-auto gap-1.5 bg-slate-200 text-slate-800 hover:bg-slate-300"
          onClick={handleSave}
          disabled={saving || !fabricReady}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Annotation"}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        {tool === "arrow"    && "Click and drag to draw an arrow"}
        {tool === "circle"   && "Click to place a circle"}
        {tool === "text"     && "Click to place a text label — double-click to edit"}
        {tool === "freehand" && "Draw freely on the photo"}
        {tool === "select"   && "Click objects to select · Delete key removes selected"}
      </p>

      <div
        ref={containerRef}
        className="flex flex-1 items-start justify-center overflow-auto rounded-xl border border-[#3a3a3a] bg-[#111111] p-4"
      >
        {!fabricReady && (
          <div className="flex h-64 w-full items-center justify-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className={cn(!fabricReady && "hidden")} />
      </div>
    </div>
  );
}
