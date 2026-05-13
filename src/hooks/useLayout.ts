// ── Resizable layout hook ─────────────────────────────────────────────────────

const STORAGE_KEY = "bgstranslator_layout_v1";

export interface ColumnWidths {
  record_type: number;
  form_id:     number;
  editor_id:   number;
  sub_type:    number;
}

export interface LayoutState {
  sidebarWidth:    number;      // GroupPanel width (px)
  editPanelHeight: number;      // EditPanel height (px)
  columnWidths:    ColumnWidths; // fixed column widths (px)
  textSplit:       number;      // 0–1 ratio: Original vs Translated column width
}

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarWidth:    200,
  editPanelHeight: 160,
  columnWidths: {
    record_type: 54,
    form_id:     80,
    editor_id:   160,
    sub_type:    50,
  },
  textSplit: 0.5,
};

// Min/max constraints
export const LAYOUT_CONSTRAINTS = {
  sidebarWidth:    { min: 120, max: 480 },
  editPanelHeight: { min: 100, max: 460 },
  colWidth:        { min: 28 },
  textSplit:       { min: 0.12, max: 0.88 },
};

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function loadLayout(): LayoutState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<LayoutState>;
      return {
        ...DEFAULT_LAYOUT,
        ...parsed,
        columnWidths: { ...DEFAULT_LAYOUT.columnWidths, ...(parsed.columnWidths ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_LAYOUT };
}

function saveLayout(layout: LayoutState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch { /* ignore */ }
}

// ── startDrag helper ──────────────────────────────────────────────────────────
// Starts a drag and calls onMove(delta) on every mouse move.
// direction "h" = horizontal (positive delta = rightward)
// direction "v" = vertical   (positive delta = downward)

export function startDrag(
  e: React.MouseEvent,
  direction: "h" | "v",
  onMove: (delta: number) => void,
) {
  e.preventDefault();
  e.stopPropagation();
  let last = direction === "h" ? e.clientX : e.clientY;
  const cursor = direction === "h" ? "col-resize" : "row-resize";

  const prevCursor = document.body.style.cursor;
  const prevSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";

  const onMouseMove = (ev: MouseEvent) => {
    const pos   = direction === "h" ? ev.clientX : ev.clientY;
    const delta = pos - last;
    last = pos;
    if (delta !== 0) onMove(delta);
  };

  const onMouseUp = () => {
    document.body.style.cursor    = prevCursor;
    document.body.style.userSelect = prevSelect;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup",   onMouseUp);
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup",   onMouseUp);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>(loadLayout);

  const updateLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout(prev => {
      const next: LayoutState = {
        ...prev,
        ...patch,
        columnWidths: { ...prev.columnWidths, ...(patch.columnWidths ?? {}) },
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setLayout({ ...DEFAULT_LAYOUT });
  }, []);

  // Typed helpers for each layout section

  const setSidebarWidth = useCallback((delta: number) => {
    setLayout(prev => {
      const next: LayoutState = {
        ...prev,
        sidebarWidth: clamp(
          prev.sidebarWidth + delta,
          LAYOUT_CONSTRAINTS.sidebarWidth.min,
          LAYOUT_CONSTRAINTS.sidebarWidth.max,
        ),
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const setEditPanelHeight = useCallback((delta: number) => {
    setLayout(prev => {
      const next: LayoutState = {
        ...prev,
        // dragging UP (negative delta) → increases height
        editPanelHeight: clamp(
          prev.editPanelHeight - delta,
          LAYOUT_CONSTRAINTS.editPanelHeight.min,
          LAYOUT_CONSTRAINTS.editPanelHeight.max,
        ),
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const setColumnWidth = useCallback((col: keyof ColumnWidths, delta: number) => {
    setLayout(prev => {
      const next: LayoutState = {
        ...prev,
        columnWidths: {
          ...prev.columnWidths,
          [col]: Math.max(LAYOUT_CONSTRAINTS.colWidth.min, prev.columnWidths[col] + delta),
        },
      };
      saveLayout(next);
      return next;
    });
  }, []);

  const setTextSplit = useCallback((delta: number, flexTotalPx: number) => {
    if (flexTotalPx <= 0) return;
    setLayout(prev => {
      const newSplit = clamp(
        prev.textSplit + delta / flexTotalPx,
        LAYOUT_CONSTRAINTS.textSplit.min,
        LAYOUT_CONSTRAINTS.textSplit.max,
      );
      const next: LayoutState = { ...prev, textSplit: newSplit };
      saveLayout(next);
      return next;
    });
  }, []);

  return {
    layout,
    updateLayout,
    resetLayout,
    setSidebarWidth,
    setEditPanelHeight,
    setColumnWidth,
    setTextSplit,
  };
}
