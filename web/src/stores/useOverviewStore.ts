import { create } from "zustand";

const STORAGE_KEY = "cccc-overview-open";

/** The overview is the home page: it opens first until the viewer leaves it for a Group. */
function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function store(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // The overview still opens and closes for this visit.
  }
}

type OverviewState = {
  /** The cross-Group overview covers the conversation area while open. */
  open: boolean;
  show: () => void;
  hide: () => void;
};

export const useOverviewStore = create<OverviewState>((set) => ({
  open: typeof window === "undefined" ? true : readStored(),
  show: () => {
    store(true);
    set({ open: true });
  },
  hide: () => {
    store(false);
    set({ open: false });
  },
}));
