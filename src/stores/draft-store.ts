"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useCurrentUserStore } from "./current-user-store";

/**
 * Unsent comment / reply drafts, keyed per user + record so they survive tab
 * switches, closing the sheet and page reloads, and never bleed between
 * records or logins. Drafts are only ever written to the box — nothing here
 * sends anything.
 */

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ANON_PREFIX = "anon:"; // user not loaded yet — kept in memory only

interface DraftEntry {
  text: string;
  savedAt: number;
}

interface DraftState {
  drafts: Record<string, DraftEntry>;
  setDraft: (key: string, text: string) => void;
  /** Clear only if the box still holds exactly `sentText` (don't wipe text typed while a send was in flight). */
  clearIfUnchanged: (key: string, sentText: string) => void;
}

let storageWritable = true;

// Storage can throw (private mode, quota, blocked site data) — never let that break typing.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
      storageWritable = true;
    } catch {
      storageWritable = false;
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (key, text) =>
        set((s) => {
          const next = { ...s.drafts };
          if (text === "") delete next[key];
          else next[key] = { text, savedAt: Date.now() };
          return { drafts: next };
        }),
      clearIfUnchanged: (key, sentText) =>
        set((s) => {
          if (s.drafts[key]?.text !== sentText) return s;
          const next = { ...s.drafts };
          delete next[key];
          return { drafts: next };
        }),
    }),
    {
      name: "landscapt-unsent-drafts",
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Hydrate in an effect (see useRecordDraft) so SSR and first client render agree.
      skipHydration: true,
      partialize: (s) => ({
        drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => !k.startsWith(ANON_PREFIX))),
      }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<DraftState> | undefined)?.drafts ?? {};
        const cutoff = Date.now() - MAX_AGE_MS;
        const fresh = Object.fromEntries(
          Object.entries(stored).filter(([, d]) => d && typeof d.text === "string" && d.text !== "" && d.savedAt > cutoff),
        );
        // Keep anything typed in this session before hydration finished.
        return { ...current, drafts: { ...fresh, ...current.drafts } };
      },
    },
  ),
);

let hydrationStarted = false;

/** Persisted draft for one record. `scope` is e.g. the comment record type, `id` the record id. */
export function useRecordDraft(scope: string, id: string) {
  const userId = useCurrentUserStore((s) => s.currentUser.id);
  const key = `${userId || ANON_PREFIX.slice(0, -1)}:${scope}:${id}`;

  useEffect(() => {
    if (hydrationStarted) return;
    hydrationStarted = true;
    void useDraftStore.persist.rehydrate();
  }, []);

  const text = useDraftStore((s) => s.drafts[key]?.text ?? "");
  const setDraft = useDraftStore((s) => s.setDraft);
  const clearIfUnchanged = useDraftStore((s) => s.clearIfUnchanged);

  const setText = useCallback((value: string) => setDraft(key, value), [setDraft, key]);
  /** Call after a successful send, passing the text that was sent. */
  const clearSent = useCallback((sent: string) => clearIfUnchanged(key, sent), [clearIfUnchanged, key]);

  return {
    text,
    setText,
    clearSent,
    /** True when there is an unsent draft that is really stored on this device. */
    saved: text.trim() !== "" && storageWritable && !key.startsWith(ANON_PREFIX),
  };
}
