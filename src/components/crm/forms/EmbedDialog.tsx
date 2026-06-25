"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

interface Props {
  formName: string;
  slug: string;
  publicUrl: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type EmbedTab = "iframe" | "script" | "link";

export function EmbedDialog({ formName, slug, publicUrl, open, onOpenChange }: Props) {
  const [tab, setTab] = useState<EmbedTab>("iframe");
  const [copied, setCopied] = useState(false);

  const iframeCode = `<iframe
  src="${publicUrl}"
  width="100%"
  height="600"
  frameborder="0"
  style="border:none; max-width:640px; width:100%;"
  title="${formName}"
></iframe>`;

  const scriptCode = `<!-- ${formName} -->
<div id="twins-form-${slug}"></div>
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${publicUrl}';
    iframe.style.cssText = 'width:100%;max-width:640px;height:600px;border:none;display:block;';
    iframe.title = '${formName}';
    document.getElementById('twins-form-${slug}').appendChild(iframe);

    // Auto-resize to form content height
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'twins-form-height') {
        iframe.style.height = e.data.height + 'px';
      }
    });
  })();
</script>`;

  const code: Record<EmbedTab, string> = {
    iframe: iframeCode,
    script: scriptCode,
    link: publicUrl,
  };

  function copyCode() {
    navigator.clipboard.writeText(code[tab]).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const TABS: { key: EmbedTab; label: string; description: string }[] = [
    {
      key: "iframe",
      label: "iFrame",
      description: "Paste directly into any HTML page or website builder (Squarespace, Wix, Webflow, WordPress custom HTML block).",
    },
    {
      key: "script",
      label: "Script",
      description: "JavaScript snippet — more flexible, auto-resizes the form height to fit content.",
    },
    {
      key: "link",
      label: "Direct Link",
      description: "Share or link directly to the standalone form page.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Embed — {formName}</DialogTitle>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex gap-1 rounded-lg border bg-slate-50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setCopied(false); }}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Description */}
        <p className="text-xs text-slate-500">
          {TABS.find((t) => t.key === tab)?.description}
        </p>

        {/* Code block */}
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border bg-slate-900 p-4 text-xs text-slate-100 leading-relaxed whitespace-pre-wrap break-all">
            {code[tab]}
          </pre>
          <button
            onClick={copyCode}
            className={cn(
              "absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              copied
                ? "bg-green-500 text-white"
                : "bg-white/10 text-slate-200 hover:bg-white/20"
            )}
          >
            {copied ? (
              <><Check className="h-3 w-3" /> Copied!</>
            ) : (
              <><Copy className="h-3 w-3" /> Copy</>
            )}
          </button>
        </div>

        {/* Preview hint */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="shrink-0 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs text-slate-600">
            <span className="font-medium">Tip:</span> The form must be{" "}
            <span className="font-semibold text-green-700">Published</span> before it will load on your website.
            Responses appear in the <span className="font-medium">Responses</span> tab.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
