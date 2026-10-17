"use client";

import { useState } from "react";
import { Truck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EquipmentItem } from "@/lib/hooks/use-crew-board";

/** Round photo of a piece of equipment, falling back to an icon when it has none (or the image fails to load). */
export function EquipmentAvatar({
  item,
  className,
}: {
  item: Pick<EquipmentItem, "photoUrl" | "isVehicle" | "name">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = item.isVehicle ? Truck : Wrench;
  if (item.photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- same plain <img> the CMMS asset lists use for photo_url
      <img
        src={item.photoUrl}
        alt={item.name}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-black/10", className)}
      />
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-neutral-700 dark:text-neutral-300", className)}>
      <Icon className="h-1/2 w-1/2" />
    </span>
  );
}
