import { create } from "zustand";

/** Whether the quick-jump palette (⌘K) is open. */
type QuickJumpState = { open: boolean; setOpen: (open: boolean) => void; toggle: () => void };

export const useQuickJumpStore = create<QuickJumpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
