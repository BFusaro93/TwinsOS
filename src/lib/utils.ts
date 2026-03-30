import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoString));
}

export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

export function formatDateShort(isoString: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(new Date(isoString));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Generates a deterministic Tailwind bg color class from a string (for vendor avatars) */
export function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-orange-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-rose-500",
    "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Given a lastCompletedDate and a PM frequency, returns the ISO date string
 * for the next due date. If no lastCompletedDate is provided, returns null
 * (caller should fall back to the stored nextDueDate).
 */
export function calculateNextDueDate(
  lastCompletedDate: string | null,
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual"
): string | null {
  if (!lastCompletedDate) return null;
  const base = new Date(lastCompletedDate);
  switch (frequency) {
    case "daily":
      base.setDate(base.getDate() + 1);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
    case "monthly":
      base.setMonth(base.getMonth() + 1);
      break;
    case "quarterly":
      base.setMonth(base.getMonth() + 3);
      break;
    case "annual":
      base.setFullYear(base.getFullYear() + 1);
      break;
  }
  return base.toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Returns true when a record's string field matches the active filter.
 * Supports both single-value (legacy) and multi-value (array) filter modes.
 *   - undefined / empty array / "all"  → always matches (no filter active)
 *   - string[]                         → matches if value is in the array
 *   - string                           → matches if value === filter
 */
export function matchesFilter(
  value: string,
  filter: string | string[] | undefined
): boolean {
  if (!filter) return true;
  if (Array.isArray(filter)) return filter.length === 0 || filter.includes(value);
  return filter === "all" || filter === value;
}

/**
 * Same as matchesFilter but for boolean active/inactive patterns where options
 * are the strings "active" and "inactive" rather than the record field value.
 */
export function matchesIsActiveFilter(
  isActive: boolean,
  filter: string | string[] | undefined
): boolean {
  const check = (s: string): boolean => {
    if (s === "all") return true;
    if (s === "active") return isActive;
    if (s === "inactive") return !isActive;
    return true;
  };
  if (!filter) return true;
  if (Array.isArray(filter)) return filter.length === 0 || filter.some(check);
  return check(filter);
}

export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoString);
}
