'use client';

import { createContext, useContext } from 'react';

/**
 * Sidekick-open state, published by the shell (f-shell owns the toggle in
 * `hub-shell.tsx`). Surfaces that must sit *beside* the sidekick rather than
 * under it — the task sheet's reposition (`right: 392px` when open, f-task-sheet
 * §11) — read it here instead of threading a prop through the whole main column.
 */
export interface SidekickState {
  open: boolean;
}

const SidekickContext = createContext<SidekickState>({ open: false });

/** Provider — the shell wraps its content in this with the live open state. */
export const SidekickProvider = SidekickContext.Provider;

/** Read whether the sidekick column is currently open. */
export function useSidekick(): SidekickState {
  return useContext(SidekickContext);
}
