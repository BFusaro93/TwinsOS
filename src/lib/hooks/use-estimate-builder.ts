import { useMutation } from "@tanstack/react-query";

export function useGenerateProposal() {
  return useMutation({
    mutationFn: async (transcript: string) => {
      const res = await fetch("/api/tools/estimate-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to generate proposal");
      }
      const data = (await res.json()) as { proposal: string };
      return data.proposal;
    },
  });
}
