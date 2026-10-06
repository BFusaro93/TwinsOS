import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** Supabase/PostgREST errors that mean "your session is no longer valid". */
function isAuthError(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string } | null;
  if (!e) return false;
  return (
    e.status === 401 ||
    e.code === "PGRST301" ||
    /jwt|not authenticated|session/i.test(e.message ?? "")
  );
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // Safety net: a failed save used to be completely silent unless the
    // individual hook defined its own onError (e.g. after the session expired
    // the edit was dropped and the old value reappeared on reload).
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return; // hook handles it itself
      toast.error(
        isAuthError(err)
          ? "Your session expired — your changes were not saved. Please sign in again."
          : "Your changes could not be saved. Please try again."
      );
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});
