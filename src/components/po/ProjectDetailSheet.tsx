"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ProjectDetailPanel } from "./ProjectDetailPanel";
import type { Project } from "@/types";

interface ProjectDetailSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectDetailSheet({ project, open, onOpenChange }: ProjectDetailSheetProps) {
  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[600px] flex-col overflow-hidden p-0 sm:max-w-[600px]">
        <SheetHeader className="sr-only">
          <SheetTitle>{project.name}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <ProjectDetailPanel project={project} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
