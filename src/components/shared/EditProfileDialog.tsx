"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserStore } from "@/stores";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { currentUser, setCurrentUser } = useCurrentUserStore();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName(currentUser.name === "Loading…" ? "" : currentUser.name);
  }, [open, currentUser.name]);

  const save = useMutation({
    mutationFn: async (newName: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ name: newName.trim() })
        .eq("id", currentUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentUser({ ...currentUser, name: name.trim() });
      onOpenChange(false);
    },
  });

  const isValid = name.trim().length > 0 && name.trim() !== currentUser.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your display name.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              onKeyDown={(e) => e.key === "Enter" && isValid && save.mutate(name)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-slate-500">Email</Label>
            <p className="text-sm text-slate-600">{currentUser.email}</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-slate-500">Role</Label>
            <p className="text-sm capitalize text-slate-600">{currentUser.role}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || save.isPending}
            onClick={() => save.mutate(name)}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
