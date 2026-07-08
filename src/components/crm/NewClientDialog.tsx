"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateClient, useClient } from "@/lib/hooks/use-clients";
import { EditClientDialogExport } from "./ClientDetailPanel";
import { toast } from "sonner";
import type { Client } from "@/types/crm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: Client) => void;
}

export function NewClientDialog({ open, onOpenChange, onCreated }: Props) {
  const { mutateAsync: createClient, isPending } = useCreateClient();

  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"residential" | "commercial">("residential");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");

  // After quick create: open full edit dialog on the new client
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { data: createdClient } = useClient(createdId ?? "");

  async function handleCreate() {
    if (!displayName.trim()) { toast.error("Display name is required"); return; }
    try {
      const client = await createClient({
        displayName: displayName.trim(),
        accountType,
        primaryPhone: primaryPhone.trim(),
        primaryEmail: primaryEmail.trim(),
        billingAddress: "",
        billingCity: "",
        billingState: "",
        billingZip: "",
        source: "",
        salesRepId: "",
      });
      toast.success(`${client.displayName} created — fill in the details below`);
      setCreatedId(client.id);
      // Close quick-create dialog, open full edit dialog
      onOpenChange(false);
      setEditOpen(true);
      onCreated?.(client);
    } catch {
      toast.error("Failed to create client");
    }
  }

  function handleEditClose(o: boolean) {
    setEditOpen(o);
    if (!o) {
      // Reset quick-create form for next use
      setDisplayName("");
      setPrimaryPhone("");
      setPrimaryEmail("");
      setAccountType("residential");
      setCreatedId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Client</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label>Display Name *</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Christine Ward"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Account Type</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as "residential" | "commercial")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residential">Residential</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Phone</Label>
                <PhoneInput
                  value={primaryPhone}
                  onChange={setPrimaryPhone}
                  placeholder="(978) 555-0100"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input
                  value={primaryEmail}
                  onChange={(e) => setPrimaryEmail(e.target.value)}
                  type="email"
                  placeholder="client@email.com"
                />
              </div>
            </div>

            <p className="text-xs text-slate-400">
              After creating, you&apos;ll be able to fill in address, billing, custom fields, and more.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={isPending || !displayName.trim()}>
              {isPending ? "Creating…" : "Create & Continue →"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full edit dialog opens immediately after quick-create */}
      {createdClient && (
        <EditClientDialogExport
          client={createdClient}
          open={editOpen}
          onOpenChange={handleEditClose}
        />
      )}
    </>
  );
}
