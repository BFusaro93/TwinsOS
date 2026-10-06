"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemedToaster } from "@/components/themed-toaster";
import { RadixLayerCleanup } from "@/components/shared/RadixLayerCleanup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <RadixLayerCleanup />
        {/* Explicit auto-dismiss: success/info clear after 4.5 s. sonner pauses
          its timer while the toast is hovered or the tab is hidden, so a
          visible close button guarantees a stale toast can always be cleared.
          Error toasts pass their own longer duration where it matters. */}
        <ThemedToaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
