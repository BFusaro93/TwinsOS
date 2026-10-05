"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateInjuryCase, useUpdateInjuryCase } from "@/lib/hooks/use-injury-cases";
import { InjuryCaseForm } from "./InjuryCaseForm";
import type { InjuryCase } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
  editCase?: InjuryCase;
}

export function NewInjuryCaseDialog({ open, onOpenChange, onCreated, editCase }: Props) {
  const createCase = useCreateInjuryCase();
  const updateCase = useUpdateInjuryCase();
  const isEdit = !!editCase;
  const mutation = isEdit ? updateCase : createCase;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Injury Case" : "Open Injury Case"}</DialogTitle>
        </DialogHeader>
        {/* key remounts the form so it re-seeds from editCase each time. */}
        <InjuryCaseForm
          key={editCase?.id ?? "new"}
          office
          initial={editCase}
          submitLabel={isEdit ? "Save Changes" : "Open Case"}
          pendingLabel={isEdit ? "Saving…" : "Opening…"}
          pending={mutation.isPending}
          error={mutation.error}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (values) => {
            try {
              if (editCase) {
                await updateCase.mutateAsync({ id: editCase.id, ...values });
              } else {
                const created = await createCase.mutateAsync(values);
                onCreated?.(created.id);
              }
              onOpenChange(false);
            } catch {
              // surfaced via mutation.error below the form
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
