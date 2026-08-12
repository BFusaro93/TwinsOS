"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateEvent } from "@/lib/hooks/use-crm-automations";
import { useUsers } from "@/lib/hooks/use-users";
import { useOrgList } from "@/lib/hooks/use-org-lists";
import { useCustomFieldDefs } from "@/lib/hooks/use-client-custom-fields";
import type { CRMSequenceEvent } from "@/types/crm-automations";
import { toast } from "sonner";

// CSR was removed — it isn't a real field anywhere in the app (no
// clients.csr column, no CSR concept outside this picker and a document
// merge-tag preview placeholder).
const UPDATE_FIELDS = [
  { value: "sales_person", label: "Sales person" },
  { value: "client_source", label: "Client source" },
  { value: "billing_term", label: "Billing term" },
  { value: "custom_field", label: "Custom field" },
];

// Fields backed by a fixed set of options get a Select instead of free text.
// sales_person is resolved to a user picker separately below since its
// options come from the users list, not a static array.
const BILLING_TERM_OPTIONS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_10", label: "Net 10" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

const USER_PICKER_FIELDS = new Set(["sales_person"]);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: CRMSequenceEvent;
}

export function UpdateEventDialog({ open, onOpenChange, event }: Props) {
  const updateEvent = useUpdateEvent();
  const { data: users } = useUsers();
  const { data: clientSources } = useOrgList("client_sources");
  const { data: customFieldDefs } = useCustomFieldDefs();
  const [field, setField] = useState("sales_person");
  const [value, setValue] = useState("");
  const [customFieldId, setCustomFieldId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setField(event.config.field ?? "sales_person");
      setValue(event.config.value ?? "");
      setCustomFieldId(event.config.customFieldId ?? "");
    }
  }, [open, event]);

  // Changing which field is being updated invalidates whatever value was
  // picked for the previous field's input type (e.g. a user id doesn't mean
  // anything once you switch to billing_term).
  function handleFieldChange(next: string) {
    setField(next);
    setValue("");
    setCustomFieldId("");
  }

  const selectedCustomFieldDef = customFieldDefs?.find((d) => d.id === customFieldId);
  const isCustomFieldIncomplete = field === "custom_field" && !customFieldId;

  async function handleSave() {
    setSaving(true);
    try {
      await updateEvent.mutateAsync({
        id: event.id,
        sequenceId: event.sequenceId,
        config: field === "custom_field" ? { field, value, customFieldId } : { field, value },
      });
      onOpenChange(false);
    } catch {
      toast.error("Failed to save update event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Update</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Field to update</Label>
            <Select value={field} onValueChange={handleFieldChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPDATE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {field === "custom_field" && (
            <div className="flex flex-col gap-1.5">
              <Label>Custom field</Label>
              <Select value={customFieldId} onValueChange={(v) => { setCustomFieldId(v); setValue(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a custom field" />
                </SelectTrigger>
                <SelectContent>
                  {(customFieldDefs ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>New value</Label>
            {USER_PICKER_FIELDS.has(field) ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field === "client_source" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client source" />
                </SelectTrigger>
                <SelectContent>
                  {(clientSources ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.value}>
                      {o.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field === "billing_term" ? (
              <Select value={value} onValueChange={setValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select billing term" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_TERM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field === "custom_field" ? (
              <Input
                type={selectedCustomFieldDef?.fieldType === "number" ? "number" : "text"}
                placeholder={customFieldId ? "Enter the value to set…" : "Select a custom field first"}
                disabled={!customFieldId}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <Input
                placeholder="Enter the value to set…"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!field || isCustomFieldIncomplete || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
