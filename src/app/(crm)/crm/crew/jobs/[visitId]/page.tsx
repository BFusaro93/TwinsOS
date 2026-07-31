"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Old single-visit crew detail route, kept as a redirect for existing
 * bookmarks/links — the crew tablet now groups visits into stops (see
 * crew/stops/[visitId]). A bare visit id is still a valid stop anchor id
 * whenever the stop it belongs to has only one visit, which is the common
 * case; useStopDetail resolves the rest either way.
 */
export default function LegacyCrewJobDetailRedirect({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/crm/crew/stops/${visitId}`);
  }, [router, visitId]);

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
}
