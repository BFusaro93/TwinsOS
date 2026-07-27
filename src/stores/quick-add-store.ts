"use client";

import { create } from "zustand";

export type QuickAddType =
  | "client"
  | "estimate"
  | "ticket"
  | "invoice"
  | "payment"
  | "job"
  | "requisition"
  | "purchase_order"
  | "work_order"
  | "vendor"
  | null;

interface QuickAddState {
  type: QuickAddType;
  open: (type: NonNullable<QuickAddType>) => void;
  close: () => void;
}

export const useQuickAddStore = create<QuickAddState>((set) => ({
  type: null,
  open: (type) => set({ type }),
  close: () => set({ type: null }),
}));
