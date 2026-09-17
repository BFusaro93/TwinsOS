"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Copy, Check, Loader2, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { useGenerateProposal } from "@/lib/hooks/use-estimate-builder";

function cleanVttTranscript(text: string): string {
  return text
    .replace(/WEBVTT\n?/g, "")
    .replace(/^[a-f0-9-]{36}-\d+$/gm, "")
    .replace(/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function EstimateBuilderTool() {
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateProposal = useGenerateProposal();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setTranscript(cleanVttTranscript(text));
  }

  function handleGenerate() {
    if (!transcript.trim()) return;
    generateProposal.mutate(transcript);
  }

  function handleCopy() {
    if (!generateProposal.data) return;
    navigator.clipboard.writeText(generateProposal.data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClear() {
    setTranscript("");
    setFileName("");
    generateProposal.reset();
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-brand-600">Estimate Text/Language Generator</h1>
        <p className="text-sm text-slate-500">
          Upload or paste a site visit transcript to get proposal-ready line item text
        </p>
      </div>

      <hr className="my-4 border-slate-200" />

      <Card className="mb-5 border-brand-200 bg-brand-50/50">
        <CardContent className="pt-6 text-sm leading-relaxed">
          <p className="mb-2 text-sm font-semibold text-brand-600">📋 How to Use This Tool</p>
          <ol className="list-decimal space-y-1 pl-5 text-slate-700">
            <li>
              Upload a transcript file <strong>(.txt, .vtt)</strong> <em>or</em> paste the transcript
              text directly into the box below.
            </li>
            <li>
              Click <strong>&ldquo;Generate Proposal&rdquo;</strong> to generate ready-to-use line item
              text.
            </li>
            <li>
              Review the output carefully before pasting it into the estimate — always verify scope,
              quantities, and pricing.
            </li>
            <li>
              Click <strong>&ldquo;Copy to Clipboard&rdquo;</strong> and paste into the appropriate
              estimate line item.
            </li>
          </ol>
          <p className="mb-1 mt-3 font-semibold text-slate-800">
            Review Checklist Before Pasting into the Estimate:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>All service areas and locations are accurately described</li>
            <li>Quantities and yardage match what has been calculated</li>
            <li>Any exclusions are clearly noted</li>
            <li>Pricing matches what was calculated</li>
            <li>Any clarification flags in the output have been resolved</li>
          </ul>
          <p className="mt-3 italic text-slate-400">
            Note: This tool does not set pricing, submit the estimate, or replace the estimator&rsquo;s
            review.
          </p>
        </CardContent>
      </Card>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          Upload Transcript File{" "}
          <span className="font-normal text-slate-400">(optional — .txt, .vtt)</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100">
            <Upload className="h-3.5 w-3.5" />
            Choose File
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.vtt"
              onChange={handleFile}
              className="hidden"
            />
          </label>
          {fileName ? (
            <span className="text-sm font-medium text-brand-600">{fileName}</span>
          ) : (
            <span className="text-sm text-slate-400">No file selected</span>
          )}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          Transcript Text{" "}
          <span className="font-normal text-slate-400">
            (paste here, or auto-filled from file upload above)
          </span>
        </label>
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste transcript here — or upload a file above to auto-fill..."
          className="min-h-[190px]"
        />
      </div>

      <div className="mb-6 flex gap-2">
        <Button
          onClick={handleGenerate}
          disabled={generateProposal.isPending || !transcript.trim()}
        >
          {generateProposal.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Proposal
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>

      {generateProposal.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{generateProposal.error.message}</AlertDescription>
        </Alert>
      )}

      {generateProposal.data && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-bold text-slate-700">
              Generated Proposal — Ready to paste into the estimate
            </label>
            <Button
              size="sm"
              variant={copied ? "default" : "outline"}
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy to Clipboard
                </>
              )}
            </Button>
          </div>
          <div className="min-h-[120px] whitespace-pre-wrap rounded-md border bg-slate-50 p-5 text-sm leading-relaxed">
            {generateProposal.data}
          </div>
          <p className="mt-2 text-xs italic text-slate-400">
            Always review before pasting into the estimate. Verify scope, quantities, and pricing
            with the estimator.
          </p>
        </div>
      )}
    </div>
  );
}
