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
import { Separator } from "@/components/ui/separator";
import { CheckCircle2 } from "lucide-react";

interface EditProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
  const { currentUser, setCurrentUser } = useCurrentUserStore();

  // Name section
  const [name, setName] = useState("");

  // Email section
  const [newEmail, setNewEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // Password section
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentUser.name === "Loading…" ? "" : currentUser.name);
      setNewEmail("");
      setEmailSent(false);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(false);
    }
  }, [open, currentUser.name]);

  // ── Save name ──────────────────────────────────────────────────────────────
  const saveName = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", currentUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setCurrentUser({ ...currentUser, name: name.trim() });
    },
  });

  const nameChanged = name.trim().length > 0 && name.trim() !== currentUser.name;

  // ── Change email ───────────────────────────────────────────────────────────
  // Supabase sends a confirmation link to the NEW address; email only updates
  // after the user clicks that link. We just need to call auth.updateUser().
  const changeEmail = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmailSent(true);
      setNewEmail("");
    },
  });

  const emailValid =
    newEmail.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) &&
    newEmail.trim() !== currentUser.email;

  // ── Change password ────────────────────────────────────────────────────────
  const changePassword = useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  const passwordValid =
    newPassword.length >= 8 && newPassword === confirmPassword;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your name, email address, or password.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-1 px-0.5">

          {/* ── Display name ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Display Name
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <div className="flex gap-2">
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={!nameChanged || saveName.isPending}
                  onClick={() => saveName.mutate()}
                >
                  {saveName.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
              {saveName.isSuccess && (
                <p className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Name updated.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-500">Role</Label>
              <p className="text-sm capitalize text-slate-600">{currentUser.role}</p>
            </div>
          </div>

          <Separator />

          {/* ── Email address ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Email Address
            </p>
            <div className="grid gap-1.5">
              <Label className="text-slate-500">Current email</Label>
              <p className="text-sm text-slate-600">{currentUser.email}</p>
            </div>
            {emailSent ? (
              <p className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmation sent to your new address — click the link to confirm.
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="profile-email">New email address</Label>
                <div className="flex gap-2">
                  <Input
                    id="profile-email"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="new@example.com"
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={!emailValid || changeEmail.isPending}
                    onClick={() => changeEmail.mutate()}
                  >
                    {changeEmail.isPending ? "Sending…" : "Send"}
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  A confirmation link will be sent to the new address.
                </p>
                {changeEmail.isError && (
                  <p className="text-xs text-red-500">
                    {(changeEmail.error as Error).message}
                  </p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* ── Password ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Password
            </p>
            {passwordSaved ? (
              <p className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Password updated.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-password">New password</Label>
                  <Input
                    id="profile-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="profile-password-confirm">Confirm password</Label>
                  <Input
                    id="profile-password-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                </div>
                {confirmPassword && !passwordValid && (
                  <p className="text-xs text-red-500">
                    {newPassword.length < 8
                      ? "Password must be at least 8 characters."
                      : "Passwords do not match."}
                  </p>
                )}
                <Button
                  size="sm"
                  disabled={!passwordValid || changePassword.isPending}
                  onClick={() => changePassword.mutate()}
                >
                  {changePassword.isPending ? "Updating…" : "Update Password"}
                </Button>
                {changePassword.isError && (
                  <p className="text-xs text-red-500">
                    {(changePassword.error as Error).message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
