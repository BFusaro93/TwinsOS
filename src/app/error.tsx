"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/utils/chunk-load-recovery";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Stale tab after a deploy: reload to pick up the new build instead of
    // showing an error (and don't report it as an app exception).
    if (reloadOnceForChunkError(error)) return;
    Sentry.captureException(error);
  }, [error]);

  if (isChunkLoadError(error)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">Updating to the latest version</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Twins OS was updated while this page was open. Reload to continue.
        </p>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Reload
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-neutral-100">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <Button onClick={reset} variant="outline" size="sm">
        Try again
      </Button>
    </div>
  );
}
