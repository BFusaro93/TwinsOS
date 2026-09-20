"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Promise-based replacement for the browser's native `window.confirm()`.
 *
 * Native `confirm()` blocks the tab's main thread for as long as the dialog is
 * up, and — in embedded browsers, automated sessions and some webviews — is
 * silently auto-dismissed, returning `false`. The caller then no-ops with zero
 * feedback, which is exactly how the invoice "Void" button appeared to do
 * nothing while freezing the tab (F-02). Everything destructive goes through a
 * real Radix layer instead.
 *
 * Usage mirrors the native call closely enough to be a near drop-in:
 *
 *   const [confirm, confirmDialog] = useConfirm();
 *   ...
 *   async function remove() {
 *     if (!(await confirm({ title: "Delete this?", destructive: true }))) return;
 *     ...
 *   }
 *   return (<>{...}{confirmDialog}</>);
 */

export type ConfirmOptions = {
  /** Headline question, e.g. "Void invoice #1042?" */
  title: ReactNode;
  /** Optional supporting copy — consequences, what is irreversible, etc. */
  description?: ReactNode;
  /** Label on the affirmative button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label on the dismissive button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Renders the affirmative button in the destructive style. */
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export function useConfirm(): [ConfirmFn, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  // The dialog stays mounted through its exit animation, so rendering straight
  // from `options` would blank the title and flip the buttons back to the
  // generic "Cancel"/"Confirm" labels for the length of the fade-out.
  const shownRef = useRef<ConfirmOptions | null>(null);
  if (options) shownRef.current = options;
  const shown = shownRef.current;
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second confirm while one is already open resolves the first as
    // cancelled rather than orphaning its promise.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const dialog = (
    <AlertDialog
      open={options !== null}
      onOpenChange={(open) => { if (!open) settle(false); }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{shown?.title}</AlertDialogTitle>
          {shown?.description ? (
            <AlertDialogDescription>{shown.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {shown?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={cn(shown?.destructive && buttonVariants({ variant: "destructive" }))}
          >
            {shown?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, dialog];
}
