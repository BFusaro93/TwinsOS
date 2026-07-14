"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateInvoice } from "@/lib/hooks/use-invoices";
import { useClients } from "@/lib/hooks/use-clients";
import { useEmployees } from "@/lib/hooks/use-employees";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { toast } from "sonner";

const schema = z.object({
  clientId:    z.string().min(1, "Client required"),
  description: z.string().min(1, "Description required"),
  invoiceDate: z.string().min(1),
  dueDate:     z.string(),
  salesRepId:  z.string(),
});
type FormValues = z.infer<typeof schema>;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function thirtyOut() {
  const d = new Date(Date.now() + 30*24*60*60*1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultClientId?: string;
  onCreated?: (invoiceId: string) => void;
}

export function NewInvoiceDialog({ open, onOpenChange, defaultClientId, onCreated }: Props) {
  const { data: clients } = useClients();
  const { data: employees } = useEmployees();
  const salesReps = (employees ?? []).filter((e) => e.isSalesRep && e.userId);
  const { mutateAsync: create, isPending } = useCreateInvoice();
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      description: "",
      invoiceDate: todayStr(),
      dueDate: thirtyOut(),
      salesRepId: "",
    },
  });

  async function onSubmit(v: FormValues) {
    try {
      const inv = await create({
        clientId: v.clientId,
        salesRepId: v.salesRepId || null,
        description: v.description,
        invoiceDate: v.invoiceDate,
        dueDate: v.dueDate || undefined,
      });
      if (onCreated) {
        onCreated(inv.id);
      } else {
        toast.success("Invoice created");
        onOpenChange(false);
      }
    } catch {
      toast.error("Failed to create invoice");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 py-2">
          {!defaultClientId && (
            <div className="flex flex-col gap-1.5">
              <Label>Client *</Label>
              <ClientCombobox
                value={watch("clientId")}
                onValueChange={(v) => setValue("clientId", v)}
                clients={clients ?? []}
                noneLabel="Select client..."
              />
              {errors.clientId && <p className="text-xs text-red-500">{errors.clientId.message}</p>}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Description *</Label>
            <Input {...register("description")} placeholder="e.g. Spring Cleanup Services" className={errors.description ? "border-red-400" : ""} />
            {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" {...register("invoiceDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due Date</Label>
              <Input type="date" {...register("dueDate")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sales Rep</Label>
            <Select value={watch("salesRepId")} onValueChange={(v) => setValue("salesRepId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Assign sales rep…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {salesReps.map((e) => (
                  <SelectItem key={e.userId as string} value={e.userId as string}>
                    {e.firstName} {e.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isPending}>
            {isPending ? "Creating…" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
