import { create } from "zustand";
import type { OrgUser } from "@/types";

const PLACEHOLDER_USER: OrgUser = {
  id: "",
  orgId: "",
  name: "Loading…",
  email: "",
  role: "viewer",
  avatarUrl: null,
  status: "active",
  createdAt: "",
};

interface CurrentUserStore {
  currentUser: OrgUser;
  setCurrentUser: (user: OrgUser) => void;
}

export const useCurrentUserStore = create<CurrentUserStore>((set) => ({
  currentUser: PLACEHOLDER_USER,
  setCurrentUser: (user) => set({ currentUser: user }),
}));
