"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SandboxedHtmlPreviewProps {
  /** Untrusted HTML (email bodies, stored templates) to render for staff. */
  html: string;
  className?: string;
  /** Minimum iframe height in px before content is measured. */
  minHeight?: number;
  /** Cap on the auto-sized height in px; content beyond it scrolls inside the frame. */
  maxHeight?: number;
  title?: string;
}

/**
 * Renders HTML inside a sandboxed iframe so markup in email bodies/templates
 * (which can carry client-controlled values such as a display name submitted
 * through a public form) can never execute script in the staff app.
 *
 * `sandbox="allow-same-origin"` WITHOUT `allow-scripts`: no script, inline
 * event handler or javascript: URL runs inside the frame, while same-origin
 * lets the parent read the document height to auto-size it. Links open in a
 * new tab via `allow-popups` + `<base target="_blank">`.
 */
export function SandboxedHtmlPreview({
  html,
  className,
  minHeight = 80,
  maxHeight,
  title = "Email preview",
}: SandboxedHtmlPreviewProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  const srcDoc =
    `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<style>html,body{margin:0;padding:0}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;color:#334155;word-wrap:break-word}img{max-width:100%;height:auto}</style>` +
    `</head><body>${html}</body></html>`;

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(minHeight, doc.documentElement.scrollHeight);
    setHeight(maxHeight ? Math.min(h, maxHeight) : h);
  }, [minHeight, maxHeight]);

  useEffect(() => {
    measure();
  }, [srcDoc, measure]);

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      onLoad={measure}
      className={className}
      style={{ width: "100%", height, border: 0, display: "block" }}
    />
  );
}
