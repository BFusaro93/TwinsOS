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
import { useRequiredFields } from "@/lib/hooks/use-required-fields";
import { useVerifyAddress } from "@/lib/hooks/use-verify-address";
import { AddressSuggestion } from "@/components/shared/AddressSuggestion";

type InitialStatus = "lead" | "active";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: Client) => void;
  /** Pre-selected lifecycle status: "active" from Clients (default), "lead" when launched from Leads. */
  initialStatus?: InitialStatus;
}

export function NewClientDialog({ open, onOpenChange, onCreated, initialStatus = "active" }: Props) {
  const { mutateAsync: createClient, isPending } = useCreateClient();
  const rf = useRequiredFields("client");
  const addr = useVerifyAddress();

  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"residential" | "commercial">("residential");
  const [status, setStatus] = useState<InitialStatus>(initialStatus);
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  // The address a crew is dispatched to. Captured here rather than only in the
  // full edit dialog so Settings → Required Fields can actually enforce it —
  // a requirement on a field the create form doesn't show is unenforceable.
  const [serviceAddress, setServiceAddress] = useState("");
  const [serviceCity, setServiceCity] = useState("");
  const [serviceState, setServiceState] = useState("");
  const [serviceZip, setServiceZip] = useState("");

  // After quick create: open full edit dialog on the new client
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const { data: createdClient } = useClient(createdId ?? "");

  async function handleCreate() {
    if (!displayName.trim()) { toast.error("Display name is required"); return; }
    if (rf.isRequired("primary_phone") && !primaryPhone.trim()) { toast.error("Phone is required"); return; }
    if (rf.isRequired("primary_email") && !primaryEmail.trim()) { toast.error("Email is required"); return; }
    if (rf.isRequired("service_address") && !serviceAddress.trim()) { toast.error("Service address is required"); return; }
    try {
      const client = await createClient({
        displayName: displayName.trim(),
        accountType,
        primaryPhone: primaryPhone.trim(),
        primaryEmail: primaryEmail.trim(),
        serviceAddress: serviceAddress.trim(),
        serviceCity: serviceCity.trim(),
        serviceState: serviceState.trim(),
        serviceZip: serviceZip.trim(),
        // Left blank on purpose — useCreateClient mirrors the service address
        // into billing when no separate billing address is given.
        billingAddress: "",
        billingCity: "",
        billingState: "",
        billingZip: "",
        source: "",
        salesRepId: "",
        status,
      });
      toast.success(`${client.displayName} created${status === "lead" ? " as a lead" : ""} — fill in the details below`);
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
      setServiceAddress("");
      setServiceCity("");
      setServiceState("");
      setServiceZip("");
      addr.reset();
      setAccountType("residential");
      setStatus(initialStatus);
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

            <div className="grid grid-cols-2 gap-3">
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
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as InitialStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active client</SelectItem>
                    <SelectItem value="lead">Lead (prospect)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {rf.isVisible("primary_phone") && (
                <div className="flex flex-col gap-1.5">
                  <Label>Phone{rf.req("primary_phone")}</Label>
                  <PhoneInput
                    value={primaryPhone}
                    onChange={setPrimaryPhone}
                    placeholder="(978) 555-0100"
                  />
                </div>
              )}
              {rf.isVisible("primary_email") && (
                <div className="flex flex-col gap-1.5">
                  <Label>Email{rf.req("primary_email")}</Label>
                  <Input
                    value={primaryEmail}
                    onChange={(e) => setPrimaryEmail(e.target.value)}
                    type="email"
                    placeholder="client@email.com"
                  />
                </div>
              )}
            </div>

            {rf.isVisible("service_address") && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Service Address{rf.req("service_address")}</Label>
                  <Input
                    value={serviceAddress}
                    onChange={(e) => setServiceAddress(e.target.value)}
                    onBlur={() => void addr.verify({ address: serviceAddress, city: serviceCity, state: serviceState, zip: serviceZip })}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>City</Label>
                    <Input value={serviceCity} onChange={(e) => setServiceCity(e.target.value)} placeholder="Worcester" />
                  </div>
                  <div className="flex w-20 flex-col gap-1.5">
                    <Label>State</Label>
                    <Input value={serviceState} onChange={(e) => setServiceState(e.target.value)} placeholder="MA" />
                  </div>
                  <div className="flex w-24 flex-col gap-1.5">
                    <Label>Zip</Label>
                    <Input
                      value={serviceZip}
                      onChange={(e) => setServiceZip(e.target.value)}
                      onBlur={() => void addr.verify({ address: serviceAddress, city: serviceCity, state: serviceState, zip: serviceZip })}
                      placeholder="01605"
                    />
                  </div>
                </div>
                <AddressSuggestion
                  typed={{ address: serviceAddress, city: serviceCity, state: serviceState, zip: serviceZip }}
                  state={addr.state}
                  result={addr.result}
                  onAccept={(n) => {
                    setServiceAddress(n.address);
                    setServiceCity(n.city);
                    setServiceState(n.state);
                    setServiceZip(n.zip);
                  }}
                />
              </div>
            )}

            <p className="text-xs text-slate-400">
              After creating, you&apos;ll be able to fill in billing, custom fields, and more.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={
                isPending ||
                !displayName.trim() ||
                (rf.isRequired("primary_phone") && !primaryPhone.trim()) ||
                (rf.isRequired("primary_email") && !primaryEmail.trim()) ||
                (rf.isRequired("service_address") && !serviceAddress.trim())
              }
            >
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
