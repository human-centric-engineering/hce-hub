'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Breadcrumb leaf-label override (f-projects, filling the f-shell seam).
 *
 * The topbar derives breadcrumbs from the pathname alone, so a dynamic segment
 * (a project id like `/projects/chubproject`) shows the raw id. This generic,
 * module-agnostic mechanism lets a deep page register a human label for its
 * segment — the topbar reads it, the page sets it while mounted. It stays
 * within the composable-shell guardrail: the shell assumes no project/module,
 * it just provides a label-override map any module can write to (like the module
 * registry). Keyed by **segment value** so it matches `deriveBreadcrumbs`.
 */

type Overrides = Record<string, string>;

interface BreadcrumbLabelContextValue {
  overrides: Overrides;
  setLabel: (segment: string, label: string) => void;
  clearLabel: (segment: string) => void;
}

const BreadcrumbLabelContext = createContext<BreadcrumbLabelContextValue | null>(null);

export function BreadcrumbLabelProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  const setLabel = useCallback((segment: string, label: string) => {
    setOverrides((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label }));
  }, []);

  const clearLabel = useCallback((segment: string) => {
    setOverrides((prev) => {
      if (!Object.hasOwn(prev, segment)) return prev;
      const next = { ...prev };
      delete next[segment];
      return next;
    });
  }, []);

  return (
    <BreadcrumbLabelContext.Provider value={{ overrides, setLabel, clearLabel }}>
      {children}
    </BreadcrumbLabelContext.Provider>
  );
}

/** The current segment→label overrides (read by the topbar). Empty with no provider. */
export function useBreadcrumbLabels(): Overrides {
  return useContext(BreadcrumbLabelContext)?.overrides ?? {};
}

/**
 * Renders nothing; registers `label` for `segment` while mounted (and clears it
 * on unmount). Drop this in a page to override its breadcrumb leaf — e.g.
 * `<BreadcrumbLabel segment={project.id} label={project.name} />`.
 */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const ctx = useContext(BreadcrumbLabelContext);
  const setLabel = ctx?.setLabel;
  const clearLabel = ctx?.clearLabel;

  useEffect(() => {
    if (!setLabel || !clearLabel) return;
    setLabel(segment, label);
    return () => clearLabel(segment);
  }, [setLabel, clearLabel, segment, label]);

  return null;
}
