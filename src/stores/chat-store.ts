"use client";

import { create } from "zustand";

/** Shared open state for the support ChatDialog — the HelpMenu item starts
 *  a conversation, the floating ChatBubble reopens an existing one; both
 *  need to control the same dialog instance. */
interface ChatState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
