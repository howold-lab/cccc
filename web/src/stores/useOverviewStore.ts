import { create } from "zustand";

const STORAGE_KEY = "cccc-overview-open";

/** The cross-Group pages that cover the conversation area: the overview and the task board. */
export type OverviewView = "overview" | "tasks";

type Stored = { open: boolean; view: OverviewView };

/** The overview is the home page: it opens first until the viewer leaves it for a Group. */
function readStored(): Stored {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "0") return { open: false, view: "overview" };
    if (value === "tasks") return { open: true, view: "tasks" };
    return { open: true, view: "overview" };
  } catch {
    return { open: true, view: "overview" };
  }
}

function store(open: boolean, view: OverviewView) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? (view === "tasks" ? "tasks" : "1") : "0");
  } catch {
    // The page still opens and closes for this visit.
  }
}

type OverviewState = {
  /** A cross-Group page covers the conversation area while open. */
  open: boolean;
  /** Which cross-Group page is shown while open. */
  view: OverviewView;
  show: (view?: OverviewView) => void;
  hide: () => void;
};

const initial: Stored =
  typeof window === "undefined" ? { open: true, view: "overview" } : readStored();

export const useOverviewStore = create<OverviewState>((set, get) => ({
  open: initial.open,
  view: initial.view,
  show: (view) => {
    const next = view ?? get().view;
    store(true, next);
    set({ open: true, view: next });
  },
  hide: () => {
    store(false, get().view);
    set({ open: false });
  },
}));
