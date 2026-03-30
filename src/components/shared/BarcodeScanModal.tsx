"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Keyboard, CheckCircle2, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// BarcodeDetector is not in TypeScript's default lib yet
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | Blob | ImageData
  ): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

/** Returns the native BarcodeDetector when available (Chrome/Android),
 *  or the ZXing-based polyfill for Safari / Firefox. */
async function getBarcodeDetector(): Promise<typeof BarcodeDetector> {
  if ("BarcodeDetector" in window) {
    return window.BarcodeDetector as unknown as typeof BarcodeDetector;
  }
  const { BarcodeDetector: Polyfill } = await import("barcode-detector");
  return Polyfill as unknown as typeof BarcodeDetector;
}

interface BarcodeScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the raw barcode string when a code is detected or manually submitted. */
  onScan: (value: string) => void;
  title?: string;
  description?: string;
}

export function BarcodeScanModal({
  open,
  onOpenChange,
  onScan,
  title = "Scan Barcode",
  description = "Point the camera at the barcode on the asset tag.",
}: BarcodeScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleFound = useCallback(
    (value: string) => {
      setDetected(value);
      stopCamera();
      setTimeout(() => {
        onScan(value);
        onOpenChange(false);
      }, 700);
    },
    [onScan, onOpenChange, stopCamera]
  );

  // ── camera + BarcodeDetector ──────────────────────────────────────────────

  useEffect(() => {
    if (!open || mode !== "camera") return;

    let cancelled = false;

    async function start() {
      try {
        const DetectorClass = await getBarcodeDetector();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new DetectorClass({
          formats: [
            "code_128",
            "code_39",
            "code_93",
            "qr_code",
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "itf",
            "data_matrix",
          ],
        });

        async function detect() {
          if (cancelled) return;
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(detect);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && !cancelled) {
              handleFound(codes[0].rawValue);
              return;
            }
          } catch {
            // detection errors are expected on some frames — continue
          }
          if (!cancelled) rafRef.current = requestAnimationFrame(detect);
        }

        rafRef.current = requestAnimationFrame(detect);
      } catch {
        if (!cancelled) {
          setCameraError("Camera access denied or unavailable on this device.");
          setMode("manual");
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, mode, handleFound, stopCamera]);

  // ── reset on close ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      stopCamera();
      setDetected(null);
      setManualInput("");
      setCameraError(null);
      setMode("camera");
    }
  }, [open, stopCamera]);

  // ── render ────────────────────────────────────────────────────────────────

  function handleManualSubmit() {
    const v = manualInput.trim();
    if (v) handleFound(v);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) stopCamera();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* ── Success state ── */}
        {detected ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-slate-700">
              Code detected — looking up record…
            </p>
          </div>
        ) : mode === "camera" ? (
          /* ── Camera state ── */
          <div className="flex flex-col gap-4">
            {/* Viewfinder */}
            <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "1 / 1" }}>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />

              {/* Dark corners */}
              <div className="absolute inset-0 bg-black/30" />

              {/* Clear center window */}
              <div className="absolute inset-[20%] rounded-sm bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />

              {/* Corner tick marks */}
              {[
                "top-[20%] left-[20%] border-t-[3px] border-l-[3px] rounded-tl-sm",
                "top-[20%] right-[20%] border-t-[3px] border-r-[3px] rounded-tr-sm",
                "bottom-[20%] left-[20%] border-b-[3px] border-l-[3px] rounded-bl-sm",
                "bottom-[20%] right-[20%] border-b-[3px] border-r-[3px] rounded-br-sm",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`absolute h-6 w-6 border-brand-400 ${cls}`}
                />
              ))}

              {/* Animated scan line */}
              <div
                className="absolute left-[21%] right-[21%] h-0.5 bg-brand-400 opacity-90"
                style={{
                  animation: "scanLine 2s ease-in-out infinite",
                  top: "20%",
                }}
              />

              {/* Label */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
                  Align barcode within frame
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setMode("manual")}
            >
              <Keyboard className="mr-1.5 h-3.5 w-3.5" />
              Enter barcode manually
            </Button>
          </div>
        ) : (
          /* ── Manual entry state ── */
          <div className="flex flex-col gap-4">
            {cameraError && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {cameraError}
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="e.g. SKS-001"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                autoFocus
              />
              <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
                Lookup
              </Button>
            </div>

            {!cameraError && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { setCameraError(null); setMode("camera"); }}
              >
                <ScanLine className="mr-1.5 h-3.5 w-3.5" />
                Use camera instead
              </Button>
            )}
          </div>
        )}
      </DialogContent>

      {/* Scan line keyframe animation */}
      <style>{`
        @keyframes scanLine {
          0%   { top: 21%; }
          50%  { top: 77%; }
          100% { top: 21%; }
        }
      `}</style>
    </Dialog>
  );
}
