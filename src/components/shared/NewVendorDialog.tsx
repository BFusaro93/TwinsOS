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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Vendor } from "@/types";
import { useCreateVendor, useUpdateVendor } from "@/lib/hooks/use-vendors";

interface NewVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Vendor | null;
  /** Called after a new vendor is saved; receives the created vendor object. */
  onCreated?: (vendor: Vendor) => void;
}

export function NewVendorDialog({ open, onOpenChange, initialData, onCreated }: NewVendorDialogProps) {
  const isEditing = !!initialData;
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [w9Status, setW9Status] = useState("");

  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setContactName(initialData.contactName);
      setEmail(initialData.email);
      setPhone(initialData.phone ?? "");
      setWebsite(initialData.website ?? "");
      setAddress(initialData.address ?? "");
      setNotes(initialData.notes ?? "");
      setW9Status(initialData.w9Status);
    }
  }, [open, initialData]);

  const isValid =
    name.trim() !== "" && contactName.trim() !== "" && email.trim() !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setContactName("");
    setEmail("");
    setPhone("");
    setWebsite("");
    setAddress("");
    setNotes("");
    setW9Status("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      contactName,
      email,
      phone: phone || "",
      address: address || "",
      website: website || null,
      notes: notes || null,
      vendorType: null,
      isActive: true,
      w9Status: (w9Status as Vendor["w9Status"]) || "not_requested",
      w9ReceivedDate: null,
      w9ExpirationDate: null,
    };

    if (isEditing && initialData) {
      updateVendor.mutate(
        { id: initialData.id, ...payload },
        { onSuccess: () => handleClose() }
      );
    } else {
      createVendor.mutate(payload, {
        onSuccess: (vendor) => {
          onCreated?.(vendor);
          handleClose();
        },
      });
    }
  }

  const saving = createVendor.isPending || updateVendor.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Vendor" : "New Vendor"}</DialogTitle>
          <DialogDescription>Add a new vendor or supplier contact.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Vendor Name — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-name">
                Vendor Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vendor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company or vendor name"
              />
            </div>

            {/* Contact Name — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-contact-name">
                Contact Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vendor-contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Primary contact"
              />
            </div>

            {/* Email — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vendor-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@vendor.com"
              />
            </div>

            {/* Phone — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-phone">Phone</Label>
              <Input
                id="vendor-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(000) 000-0000"
              />
            </div>

            {/* Website — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-website">Website</Label>
              <Input
                id="vendor-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://"
              />
            </div>

            {/* Address — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-address">Address</Label>
              <Input
                id="vendor-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, State, ZIP"
              />
            </div>

            {/* Notes — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this vendor"
              />
            </div>

            {/* W9 Status — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-w9">W9 Status</Label>
              <Select value={w9Status} onValueChange={setW9Status}>
                <SelectTrigger id="vendor-w9">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_requested">Not Requested</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
