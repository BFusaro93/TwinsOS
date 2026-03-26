"use client";

import { create } from "zustand";

interface CMMSUIState {
  selectedWorkOrderId: string | null;
  selectedAssetId: string | null;
  selectedVehicleId: string | null;
  selectedPartId: string | null;
  selectedPMScheduleId: string | null;
  selectedRequestId: string | null;
  selectedMeterId: string | null;
  setSelectedWorkOrderId: (id: string | null) => void;
  setSelectedAssetId: (id: string | null) => void;
  setSelectedVehicleId: (id: string | null) => void;
  setSelectedPartId: (id: string | null) => void;
  setSelectedPMScheduleId: (id: string | null) => void;
  setSelectedRequestId: (id: string | null) => void;
  setSelectedMeterId: (id: string | null) => void;
}

export const useCMMSStore = create<CMMSUIState>((set) => ({
  selectedWorkOrderId: null,
  selectedAssetId: null,
  selectedVehicleId: null,
  selectedPartId: null,
  selectedPMScheduleId: null,
  selectedRequestId: null,
  selectedMeterId: null,
  setSelectedWorkOrderId: (id) => set({ selectedWorkOrderId: id }),
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  setSelectedVehicleId: (id) => set({ selectedVehicleId: id }),
  setSelectedPartId: (id) => set({ selectedPartId: id }),
  setSelectedPMScheduleId: (id) => set({ selectedPMScheduleId: id }),
  setSelectedRequestId: (id) => set({ selectedRequestId: id }),
  setSelectedMeterId: (id) => set({ selectedMeterId: id }),
}));
