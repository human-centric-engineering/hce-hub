'use client';

import { createContext, useContext } from 'react';

/** Open/close controls for the deep-linkable task sheet (f-task-sheet §11). */
export interface TaskSheetControls {
  /** Open the sheet for a task — writes `?task=<id>` so it's shareable + refresh-safe. */
  open: (taskId: string) => void;
  /** Close the sheet — clears `?task=`. */
  close: () => void;
}

// Defaults to a no-op so a Plan row / Board card renders (and its tests run)
// outside a `TaskSheetProvider` without crashing — clicking simply does nothing.
const TaskSheetContext = createContext<TaskSheetControls>({ open: () => {}, close: () => {} });

/** Provider — `TaskSheetProvider` supplies the real URL-writing controls. */
export const TaskSheetControlsProvider = TaskSheetContext.Provider;

/** Open/close the task sheet from any surface (Plan row, Board card, …). */
export function useTaskSheet(): TaskSheetControls {
  return useContext(TaskSheetContext);
}
