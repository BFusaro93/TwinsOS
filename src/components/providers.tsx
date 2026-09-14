"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";
import { RadixLayerCleanup } from "@/components/shared/RadixLayerCleanup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <RadixLayerCleanup />
      {/* Explicit auto-dismiss: success/info clear after 4.5 s. sonner pauses
          its timer while the toast is hovered or the tab is hidden, so a
          visible close button guarantees a stale toast can always be cleared.
          Error toasts pass their own longer duration where it matters. */}
      <Toaster position="bottom-right" richColors closeButton duration={4500} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
