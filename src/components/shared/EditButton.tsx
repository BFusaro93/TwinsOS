"use client";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditButtonProps {
  onClick?: () => void;
}

export function EditButton({ onClick }: EditButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={onClick}
    >
      <Pencil className="h-3.5 w-3.5" />
      Edit
    </Button>
  );
}
