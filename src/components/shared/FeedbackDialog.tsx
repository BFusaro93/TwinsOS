"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSubmitFeedback, type FeedbackCategory } from "@/lib/hooks/use-feedback";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const submitFeedback = useSubmitFeedback();

  function reset() {
    setCategory("bug");
    setMessage("");
    setScreenshot(null);
    setScreenshotPreview(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  function handleRemoveScreenshot() {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!message.trim()) {
      toast.error("Please describe the issue or idea before submitting.");
      return;
    }
    try {
      await submitFeedback.mutateAsync({
        category,
        message: message.trim(),
        pageUrl: pathname,
        screenshotFile: screenshot,
      });
      toast.success("Thanks! Your feedback was submitted.");
      handleOpenChange(false);
    } catch (err) {
      console.error("[FeedbackDialog]", err);
      toast.error("Couldn't submit feedback. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            We&apos;re in beta — tell us about a bug or an idea. This goes straight to the team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="idea">Idea</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">
              {category === "bug" ? "Describe the bug" : "Describe your idea"}
            </Label>
            <Textarea
              id="feedback-message"
              rows={5}
              placeholder={
                category === "bug"
                  ? "What happened? What did you expect instead?"
                  : "What would you like to see?"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshot (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
            {screenshotPreview ? (
              <div className="relative w-fit">
                <img
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  className="max-h-40 rounded-md border border-slate-200"
                />
                <button
                  type="button"
                  onClick={handleRemoveScreenshot}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
                  aria-label="Remove screenshot"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                Attach a screenshot
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
