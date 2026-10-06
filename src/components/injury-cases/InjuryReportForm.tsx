"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateInjuryCase } from "@/lib/hooks/use-injury-cases";
import { InjuryCaseForm } from "./InjuryCaseForm";

/** Field "Injury Report" — submitting opens a new Injury Case. */
export function InjuryReportForm() {
  const createCase = useCreateInjuryCase();
  const [submitted, setSubmitted] = useState<string | null>(null);
  // Bumped to remount the form (clearing it) when filing another report.
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="mx-auto w-full max-w-xl p-4 md:p-6">
      <h1 className="text-xl font-semibold">Injury / Near-Miss Report</h1>
      <p className="mb-4 text-sm text-muted-foreground">Report a work-related injury, illness or near miss — no matter how minor. This opens a case for the office to follow up on; complete it within 48 hours of the incident.</p>
      {submitted ? (
        <div className="space-y-4 rounded-lg border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-400" />
          <p className="font-medium">Report submitted — case {submitted} opened.</p>
          <Button variant="outline" onClick={() => { setSubmitted(null); setFormKey((k) => k + 1); createCase.reset(); }}>
            File another report
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <InjuryCaseForm
            key={formKey}
            submitLabel="Submit Report"
            pendingLabel="Submitting…"
            pending={createCase.isPending}
            error={createCase.error}
            onSubmit={async (values) => {
              try {
                const created = await createCase.mutateAsync(values);
                setSubmitted(created.caseNumber);
              } catch {
                // shown under the form
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
