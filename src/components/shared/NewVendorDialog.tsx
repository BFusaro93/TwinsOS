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
import { PhoneInput } from "@/components/shared/PhoneInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Vendor } from "@/types";
import { useCreateVendor, useUpdateVendor, useVendors } from "@/lib/hooks/use-vendors";

/** Case-insensitive, trimmed name comparison — same normalization as the
 * duplicate-name check in useBulkImportVendors's CSV import path. */
function normalizeVendorName(name: string): string {
  return name.trim().toLowerCase();
}

/** Basic, permissive email format check — not RFC-5322-exhaustive, just
 * enough to catch obviously malformed input before it's saved. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [isActive, setIsActive] = useState(true);
  // Not editable from this form (no Vendor Type / W9 date fields here) —
  // preserved as-is so saving an edit doesn't clobber values set elsewhere
  // (e.g. CSV import, or a future W9 document workflow).
  const [vendorType, setVendorType] = useState<string | null>(null);
  const [w9ReceivedDate, setW9ReceivedDate] = useState<string | null>(null);
  const [w9ExpirationDate, setW9ExpirationDate] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateVendor, setDuplicateVendor] = useState<Vendor | null>(null);

  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const { data: existingVendors } = useVendors();

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
      setIsActive(initialData.isActive);
      setVendorType(initialData.vendorType ?? null);
      setW9ReceivedDate(initialData.w9ReceivedDate ?? null);
      setW9ExpirationDate(initialData.w9ExpirationDate ?? null);
    }
  }, [open, initialData]);

  const isValid = name.trim() !== "";

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
    setIsActive(true);
    setVendorType(null);
    setW9ReceivedDate(null);
    setW9ExpirationDate(null);
    setFormError(null);
    setDuplicateVendor(null);
  }

  function submitVendor() {
    const payload = {
      name,
      contactName,
      email,
      phone: phone || "",
      address: address || "",
      website: website || null,
      notes: notes || null,
      vendorType,
      isActive,
      w9Status: (w9Status as Vendor["w9Status"]) || "not_requested",
      w9ReceivedDate,
      w9ExpirationDate,
    };

    if (isEditing && initialData) {
      updateVendor.mutate(
        { id: initialData.id, ...payload },
        {
          onSuccess: () => handleClose(),
          onError: () => toast.error("Failed to save vendor"),
        }
      );
    } else {
      createVendor.mutate(payload, {
        onSuccess: (vendor) => {
          onCreated?.(vendor);
          handleClose();
        },
        onError: () => toast.error("Failed to create vendor"),
      });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail !== "" && !EMAIL_RE.test(trimmedEmail)) {
      setFormError("Enter a valid email address, or leave it blank.");
      return;
    }

    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits !== "" && phoneDigits.length !== 10) {
      setFormError("Enter a valid 10-digit phone number, or leave it blank.");
      return;
    }

    // Duplicate/merge detection: only relevant when creating a new vendor —
    // editing an existing one can't collide with itself. Soft-warn rather
    // than hard-block, since two genuinely different vendors can share a
    // name; the user confirms via the "Create Anyway" action below.
    if (!isEditing) {
      const normalized = normalizeVendorName(name);
      const match = (existingVendors ?? []).find(
        (v) => normalizeVendorName(v.name) === normalized
      );
      if (match) {
        setDuplicateVendor(match);
        return;
      }
    }

    submitVendor();
  }

  function handleCreateAnyway() {
    setDuplicateVendor(null);
    submitVendor();
  }

  const saving = createVendor.isPending || updateVendor.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Vendor" : "New Vendor"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update this vendor's contact information." : "Add a new vendor or supplier contact."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Vendor Name — full width */}
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-name">
                Vendor Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="vendor-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDuplicateVendor(null);
                }}
                placeholder="Company or vendor name"
              />
            </div>

            {/* Contact Name — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-contact-name">Contact Name</Label>
              <Input
                id="vendor-contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Primary contact"
              />
            </div>

            {/* Email — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-email">Email</Label>
              <Input
                id="vendor-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                placeholder="contact@vendor.com"
              />
            </div>

            {/* Phone — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-phone">Phone</Label>
              <PhoneInput
                id="vendor-phone"
                value={phone}
                onChange={(v) => { setPhone(v); setFormError(null); }}
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
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-address">Address</Label>
              <Input
                id="vendor-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, State, ZIP"
              />
            </div>

            {/* Notes — full width */}
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this vendor"
              />
            </div>

            {/* Status toggle — half width (edit mode only) */}
            {isEditing && (
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <div className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isActive ? "bg-brand-500" : "bg-slate-200"}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                  <span className="text-sm text-slate-700">{isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            )}

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

          {formError && (
            <p className="text-sm text-red-600">{formError}</p>
          )}

          {duplicateVendor && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2.5">
              <p className="text-sm text-yellow-800">
                A vendor named <strong>{duplicateVendor.name}</strong> already exists. Are you sure you
                want to create a duplicate?
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDuplicateVendor(null)}
                >
                  Go Back
                </Button>
                <Button type="button" size="sm" onClick={handleCreateAnyway} disabled={saving}>
                  {saving ? "Saving..." : "Create Anyway"}
                </Button>
              </div>
            </div>
          )}

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
