"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, GripVertical } from "lucide-react";
import { EstimateDetail } from "./EstimateDetail";

interface Props {
  estimateId: string | null;
  onOpenChange: (open: boolean) => void;
}

const MIN_WIDTH = 600;

export function EstimateDetailSheet({ estimateId, onOpenChange }: Props) {
  // Lazy-initialized on mount (not at module scope) so it reflects the
  // actual viewport instead of whatever window.innerWidth was when this
  // chunk first happened to be evaluated.
  const [width, setWidth] = useState(() => Math.max(MIN_WIDTH, Math.min(1200, typeof window !== "undefined" ? window.innerWidth * 0.85 : 1200)));
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 40, startW.current + delta));
      setWidth(next);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent) {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }

  if (!estimateId) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex shadow-2xl"
        style={{ width }}
      >
        {/* Drag handle + close */}
        <div
          className="flex w-8 cursor-ew-resize flex-col items-center bg-slate-100 hover:bg-slate-200 transition-colors flex-shrink-0 border-r border-slate-200"
          onMouseDown={startDrag}
        >
          <button
            className="mt-3 rounded p-1 text-slate-400 hover:bg-slate-300 hover:text-slate-700 transition-colors cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onOpenChange(false)}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center">
            <GripVertical className="h-4 w-4 text-slate-300" />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden bg-white">
          <EstimateDetail estimateId={estimateId} onClose={() => onOpenChange(false)} compact />

        </div>
      </div>
    </>,
    document.body
  );
}
