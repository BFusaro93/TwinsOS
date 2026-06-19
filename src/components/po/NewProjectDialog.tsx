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
import { useSettingsStore } from "@/stores/settings-store";
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
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState("sold");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [contractPrice, setContractPrice] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [budgetHours, setBudgetHours] = useState("");
  const [notes, setNotes] = useState("");
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const { breakevenLaborRateCents, burdenedLaborRateCents } = useSettingsStore();

  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name);
      setCustomerName(initialData.customerName);
      setAddress(initialData.address ?? "");
      setCity(initialData.city ?? "");
      setState(initialData.state ?? "");
      setZip(initialData.zip ?? "");
      setStatus(initialData.status);
      setStartDate(initialData.startDate ?? "");
      setEndDate(initialData.endDate ?? "");
      setContractPrice(initialData.contractPrice > 0 ? (initialData.contractPrice / 100).toFixed(2) : "");
      setLaborHours(initialData.laborHours != null ? String(initialData.laborHours) : "");
      setBudgetHours(initialData.budgetHours != null ? String(initialData.budgetHours) : "");
      setNotes(initialData.notes ?? "");
    }
  }, [open, initialData]);

  const isValid = name.trim() !== "" && customerName.trim() !== "";

  function handleClose() {
    onOpenChange(false);
    setName("");
    setCustomerName("");
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setStatus("sold");
    setStartDate("");
    setEndDate("");
    setContractPrice("");
    setLaborHours("");
    setBudgetHours("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const contractPriceCents = Math.round((parseFloat(contractPrice) || 0) * 100);
    const payload = {
      name,
      customerName,
      address: address,
      city,
      state,
      zip,
      status: status as import("@/types/project").ProjectStatus,
      startDate: startDate,
      endDate: endDate || null,
      contractPrice: contractPriceCents,
      laborHours: parseFloat(laborHours) > 0 ? parseFloat(laborHours) : null,
      budgetHours: parseFloat(budgetHours) > 0 ? parseFloat(budgetHours) : null,
      notes: notes || null,
    };
    if (isEditing && initialData) {
      updateProject.mutate({ id: initialData.id, ...payload }, { onSuccess: () => handleClose() });
    } else {
      createProject.mutate({
        ...payload,
        laborRateCents: breakevenLaborRateCents,
        burdenedRateCents: burdenedLaborRateCents,
      }, { onSuccess: () => handleClose() });
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Project Name — full width */}
            <div className="sm:sm:col-span-2 grid gap-1.5">
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
            <div className="sm:col-span-2 grid gap-1.5">
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

            {/* Address — split into street / city / state / zip */}
            <div className="sm:col-span-2 grid gap-1.5">
              <Label htmlFor="project-address">Street Address</Label>
              <Input
                id="project-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="project-city">City</Label>
              <Input id="project-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Springfield" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="project-state">State</Label>
                <Input id="project-state" value={state} onChange={(e) => setState(e.target.value)} placeholder="IL" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="project-zip">ZIP</Label>
                <Input id="project-zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="62701" />
              </div>
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

            {/* Contract Price — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-contract-price">Contract Price ($)</Label>
              <Input
                id="project-contract-price"
                type="number"
                min="0"
                step="0.01"
                value={contractPrice}
                onChange={(e) => setContractPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Budget Hours — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-budget-hours">Budget Hours</Label>
              <Input
                id="project-budget-hours"
                type="number"
                min="0"
                step="any"
                value={budgetHours}
                onChange={(e) => setBudgetHours(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Actual Labor Hours — half width */}
            <div className="grid gap-1.5">
              <Label htmlFor="project-labor-hours">Actual Labor Hours</Label>
              <Input
                id="project-labor-hours"
                type="number"
                min="0"
                step="any"
                value={laborHours}
                onChange={(e) => setLaborHours(e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Notes — full width */}
            <div className="sm:col-span-2 grid gap-1.5">
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
