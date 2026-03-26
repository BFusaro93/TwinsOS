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
import { useCreateProject, useUpdateProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/types";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Project | null;
}

export function NewProjectDialog({ open, onOpenChange, initialData }: NewProjectDialogProps) {
  const isEditing = !!initialData;
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("sold");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setCustomerName(initialData.customerName);
      setAddress(initialData.address ?? "");
      setStatus(initialData.status);
      setStartDate(initialData.startDate ?? "");
      setEndDate(initialData.endDate ?? "");
      setNotes(initialData.notes ?? "");
    }
  }, [open, initialData]);

  const isValid = name.trim() !== "" && customerName.trim() !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setCustomerName("");
    setAddress("");
    setStatus("sold");
    setStartDate("");
    setEndDate("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const payload = {
      name,
      customerName,
      address: address,
      status: status as import("@/types/project").ProjectStatus,
      startDate: startDate,
      endDate: endDate || null,
      notes: notes || null,
    };
    if (isEditing && initialData) {
      updateProject.mutate({ id: initialData.id, ...payload }, { onSuccess: () => handleClose() });
    } else {
      createProject.mutate(payload, { onSuccess: () => handleClose() });
    }
  }
  const saving = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            Create a new landscaping project for job cost tracking.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Project Name — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="project-name">
                Project Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
              />
            </div>

            {/* Customer / Client — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="project-customer">
                Customer / Client <span className="text-red-500">*</span>
              </Label>
              <Input
                id="project-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer or client name"
              />
            </div>

            {/* Address — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="project-address">Address</Label>
              <Input
                id="project-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Job site address"
              />
            </div>

            {/* Status — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="project-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-start-date">Start Date</Label>
              <Input
                id="project-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* End Date — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-end-date">End Date (optional)</Label>
              <Input
                id="project-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Notes — full width */}
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="project-notes">Notes</Label>
              <Textarea
                id="project-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional project notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
