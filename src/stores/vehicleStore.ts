import { create } from "zustand";

interface VehicleStore {
  activeVehicleId: number | null;
  setActiveVehicleId: (id: number | null) => void;
}

export const useVehicleStore = create<VehicleStore>((set) => ({
  activeVehicleId: null,
  setActiveVehicleId: (id) => set({ activeVehicleId: id }),
}));
