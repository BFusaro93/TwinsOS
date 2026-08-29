"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { useClients } from "@/lib/hooks/use-clients";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useTickets } from "@/lib/hooks/use-tickets";
import {
  useSalesReps,
  useSalesMeetings,
  useCreateSalesMeeting,
  useUpdateSalesMeeting,
  useDeleteSalesMeeting,
  type SalesMeetingWithClient,
} from "@/lib/hooks/use-sales-meetings";
import { toast } from "sonner";

const schema = z.object({
  salesRepId: z.string().min(1, "Sales rep is required"),
  clientId: z.string(),
  leadName: z.string(),
  title: z.string().min(1, "Title is required"),
  meetingType: z.enum(["in_person", "phone", "video"]),
  location: z.string(),
  scheduledDate: z.string().min(1, "Date is required"),
  scheduledTime: z.string().min(1, "Time is required"),
  durationMinutes: z.coerce.number().int().min(5, "Duration is required"),
  notes: z.string(),
  estimateId: z.string(),
  ticketId: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toLocalDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: SalesMeetingWithClient | null;
  defaultSalesRepId?: string;
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // HH:mm
}

export function SalesMeetingDialog({
  open,
  onOpenChange,
  meeting,
  defaultSalesRepId,
  defaultDate,
  defaultTime,
}: Props) {
  const { data: reps } = useSalesReps();
  const { data: clients } = useClients();
  const createMeeting = useCreateSalesMeeting();
  const updateMeeting = useUpdateSalesMeeting();
  const deleteMeeting = useDeleteSalesMeeting();

  const isEditing = !!meeting;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      salesRepId: defaultSalesRepId ?? "",
      clientId: "",
      leadName: "",
      title: "",
      meetingType: "in_person",
      location: "",
      scheduledDate: defaultDate ?? "",
      scheduledTime: defaultTime ?? "09:00",
      durationMinutes: 60,
      notes: "",
      estimateId: "",
      ticketId: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (meeting) {
      const { date, time } = toLocalDateTimeParts(meeting.scheduledAt);
      reset({
        salesRepId: meeting.salesRepId,
        clientId: meeting.clientId ?? "",
        leadName: meeting.leadName ?? "",
        title: meeting.title,
        meetingType: meeting.meetingType,
        location: meeting.location ?? "",
        scheduledDate: date,
        scheduledTime: time,
        durationMinutes: meeting.durationMinutes,
        notes: meeting.notes ?? "",
        estimateId: meeting.estimateId ?? "",
        ticketId: meeting.ticketId ?? "",
      });
    } else {
      reset({
        salesRepId: defaultSalesRepId ?? "",
        clientId: "",
        leadName: "",
        title: "",
        meetingType: "in_person",
        location: "",
        scheduledDate: defaultDate ?? "",
        scheduledTime: defaultTime ?? "09:00",
        durationMinutes: 60,
        notes: "",
        estimateId: "",
        ticketId: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting, defaultSalesRepId, defaultDate, defaultTime]);

  const clientId = watch("clientId");
  const { data: clientEstimates } = useEstimates(clientId || undefined);
  const { data: clientTickets } = useTickets(clientId ? { clientId } : undefined);

  // Warn (don't block — matches the same-class overlap warning on the
  // dispatch board) when this rep already has another meeting overlapping
  // the picked time. Scoped to just the picked day so this stays a light
  // query, not a full-calendar fetch.
  const salesRepId = watch("salesRepId");
  const scheduledDate = watch("scheduledDate");
  const scheduledTime = watch("scheduledTime");
  const durationMinutes = watch("durationMinutes");
  const dayStart = scheduledDate ? `${scheduledDate}T00:00:00.000Z` : "";
  const dayEnd = scheduledDate ? `${scheduledDate}T23:59:59.999Z` : "";
  const { data: dayMeetings } = useSalesMeetings(dayStart, dayEnd);

  function findConflict(): SalesMeetingWithClient | null {
    if (!salesRepId || !scheduledDate || !scheduledTime || !durationMinutes) return null;
    const start = new Date(`${scheduledDate}T${scheduledTime}:00`).getTime();
    const end = start + durationMinutes * 60_000;
    return (
      (dayMeetings ?? []).find((m) => {
        if (m.salesRepId !== salesRepId) return false;
        if (meeting && m.id === meeting.id) return false; // editing this same meeting
        if (m.status === "canceled") return false;
        const mStart = new Date(m.scheduledAt).getTime();
        const mEnd = mStart + m.durationMinutes * 60_000;
        return start < mEnd && mStart < end;
      }) ?? null
    );
  }

  const selectableClients = useMemo(
    () => (clients ?? []).map((c) => ({ id: c.id, displayName: c.displayName, billingAddress: c.billingAddress })),
    [clients]
  );

  async function onSubmit(values: FormValues) {
    const scheduledAt = new Date(`${values.scheduledDate}T${values.scheduledTime}:00`).toISOString();
    const payload = {
      salesRepId: values.salesRepId,
      clientId: values.clientId || null,
      leadName: values.clientId ? null : (values.leadName || null),
      title: values.title,
      meetingType: values.meetingType,
      location: values.location || null,
      scheduledAt,
      durationMinutes: values.durationMinutes,
      notes: values.notes || null,
      estimateId: values.estimateId || null,
      ticketId: values.ticketId || null,
    };
    const conflict = findConflict();
    if (conflict) {
      const { time } = toLocalDateTimeParts(conflict.scheduledAt);
      toast.warning(`This rep already has "${conflict.title}" at ${time} — double-check for a scheduling conflict.`);
    }

    try {
      if (isEditing && meeting) {
        await updateMeeting.mutateAsync({ id: meeting.id, values: payload });
        toast.success("Meeting updated");
      } else {
        await createMeeting.mutateAsync(payload);
        toast.success("Meeting booked");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save meeting");
    }
  }

  async function handleDelete() {
    if (!meeting) return;
    if (!confirm("Cancel this meeting?")) return;
    try {
      await deleteMeeting.mutateAsync(meeting.id);
      toast.success("Meeting canceled");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel meeting");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Meeting" : "Book Meeting"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 py-2 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label>Sales Rep *</Label>
            <Controller
              control={control}
              name="salesRepId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="Select sales rep..." /></SelectTrigger>
                  <SelectContent>
                    {(reps ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.salesRepId && <p className="text-xs text-red-500">{errors.salesRepId.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Client</Label>
            <ClientCombobox
              clients={selectableClients}
              value={clientId}
              onValueChange={(v) => setValue("clientId", v)}
              noneLabel="No client (new lead)"
            />
          </div>

          {!clientId && (
            <div className="flex flex-col gap-1.5">
              <Label>Lead Name</Label>
              <Input {...register("leadName")} placeholder="Name of prospect, if not an existing client" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Title *</Label>
            <Input {...register("title")} placeholder="e.g. Estimate walkthrough" />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date *</Label>
              <Input type="date" {...register("scheduledDate")} />
              {errors.scheduledDate && <p className="text-xs text-red-500">{errors.scheduledDate.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Time *</Label>
              <Input type="time" {...register("scheduledTime")} />
              {errors.scheduledTime && <p className="text-xs text-red-500">{errors.scheduledTime.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Duration (min) *</Label>
              <Input type="number" step={5} min={5} {...register("durationMinutes")} />
              {errors.durationMinutes && <p className="text-xs text-red-500">{errors.durationMinutes.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Controller
                control={control}
                name="meetingType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_person">In Person</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Location</Label>
            <Input {...register("location")} placeholder="Address or meeting link" />
          </div>

          {clientId && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Link to Estimate</Label>
                <Controller
                  control={control}
                  name="estimateId"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(clientEstimates ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            #{e.estimateNumber} — {e.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Link to Ticket</Label>
                <Controller
                  control={control}
                  name="ticketId"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(clientTickets ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            #{t.ticketNumber} — {t.subject ?? "(no subject)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea {...register("notes")} rows={3} />
          </div>

          <DialogFooter className="mt-2 flex items-center sm:justify-between">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={handleDelete}
              >
                Cancel Meeting
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isEditing ? "Save Changes" : "Book Meeting"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
