import { Suspense } from "react";
import { InjuryCasesPage } from "@/components/injury-cases/InjuryCasesPage";

export default function InjuryCasesRoute() {
  // useSearchParams (for the ?open= deep link) needs a Suspense boundary.
  return (
    <Suspense>
      <InjuryCasesPage />
    </Suspense>
  );
}
