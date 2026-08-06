"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Pencil, Trash2, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useAutomations,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
} from "@/lib/hooks/use-crm-automations";
import { toast } from "sonner";

interface Props {
  newDialogOpen: boolean;
  onNewDialogOpenChange: (open: boolean) => void;
}

export function AutomationsList({ newDialogOpen, onNewDialogOpenChange }: Props) {
  const router = useRouter();
  const { data: automations = [], isLoading } = useAutomations();
  const createAutomation = useCreateAutomation();
  const updateAutomation = useUpdateAutomation();
  const deleteAutomation = useDeleteAutomation();

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const automation = await createAutomation.mutateAsync({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      onNewDialogOpenChange(false);
      setNewName("");
      setNewDescription("");
      router.push(`/crm/communication/automations/${automation.id}`);
    } catch {
      toast.error("Failed to create automation");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete automation "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAutomation.mutateAsync(id);
    } catch {
      toast.error("Failed to delete automation");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      {automations.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automations yet"
          description="Create an automation to build event-driven client sequences."
          action={
            <Button size="sm" onClick={() => onNewDialogOpenChange(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Automation
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => router.push(`/crm/communication/automations/${a.id}`)}
                >
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {a.description ? (
                      <span className="line-clamp-1 max-w-xs">{a.description}</span>
                    ) : (
                      <span className="italic text-slate-300">No description</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {format(new Date(a.updatedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={a.isActive}
                        onCheckedChange={(checked) =>
                          updateAutomation.mutate(
                            { id: a.id, updates: { isActive: checked } },
                            { onError: () => toast.error("Failed to update automation") }
                          )
                        }
                      />
                      {a.isActive ? (
                        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">
                          Disabled
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => router.push(`/crm/communication/automations/${a.id}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => handleDelete(a.id, a.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={newDialogOpen} onOpenChange={onNewDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-name">Name</Label>
              <Input
                id="auto-name"
                placeholder="e.g. New client welcome sequence"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-desc">Description</Label>
              <Textarea
                id="auto-desc"
                placeholder="Optional description…"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNewDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
