"use client";

import { create } from "zustand";

interface POUIState {
  selectedPOId: string | null;
  selectedRequisitionId: string | null;
  selectedReceiptId: string | null;
  selectedProjectId: string | null;
  setSelectedPOId: (id: string | null) => void;
  setSelectedRequisitionId: (id: string | null) => void;
  setSelectedReceiptId: (id: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
}

export const usePOStore = create<POUIState>((set) => ({
  selectedPOId: null,
  selectedRequisitionId: null,
  selectedReceiptId: null,
  selectedProjectId: null,
  setSelectedPOId: (id) => set({ selectedPOId: id }),
  setSelectedRequisitionId: (id) => set({ selectedRequisitionId: id }),
  setSelectedReceiptId: (id) => set({ selectedReceiptId: id }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
