"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePhotoJob } from "@/modules/photo-docs/hooks/usePhotoJobs";
import { useClients } from "@/lib/hooks/use-clients";
import type { PhotoJob } from "@/modules/photo-docs/types/photo.types";

interface NewPhotoJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selects the client link — used when creating a photo job scoped to a known client (e.g. from a client's detail page). */
  defaultClientId?: string;
  /** Called with the created job after a successful create. */
  onCreated?: (job: PhotoJob) => void;
}

export function NewPhotoJobDialog({ open, onOpenChange, defaultClientId, onCreated }: NewPhotoJobDialogProps) {
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");
  const createJob = useCreatePhotoJob();
  const { data: clients = [] } = useClients();

  useEffect(() => {
    if (open && defaultClientId) {
      const client = clients.find((c) => c.id === defaultClientId);
      setCustomerName(client?.displayName ?? "");
      setAddress(client?.billingAddress ?? "");
      setCity(client?.billingCity ?? "");
      setState(client?.billingState ?? "");
      setZip(client?.billingZip ?? "");
    }
  }, [open, defaultClientId, clients]);

  const isValid = name.trim() !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setCustomerName("");
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    createJob.mutate(
      { name, customerName, address, city, state, zip, notes: notes || undefined, clientId: defaultClientId },
      { onSuccess: (job) => { onCreated?.(job); handleClose(); } },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New Photo Job</DialogTitle>
          <DialogDescription>Create a new job site for photo documentation.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="photo-job-name">
                Job Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="photo-job-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 123 Main St — Lawn & Mulch"
              />
            </div>

            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="photo-job-customer">Customer Name</Label>
              <Input
                id="photo-job-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="photo-job-address">Street Address</Label>
              <Input
                id="photo-job-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="photo-job-city">City</Label>
              <Input id="photo-job-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Springfield" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="photo-job-state">State</Label>
                <Input id="photo-job-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="IL" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="photo-job-zip">ZIP</Label>
                <Input id="photo-job-zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="62701" />
              </div>
            </div>

            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="photo-job-notes">Notes</Label>
              <Textarea
                id="photo-job-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scope, special instructions…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || createJob.isPending}>
              {createJob.isPending ? "Creating…" : "Create Job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
