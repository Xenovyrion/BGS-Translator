import { useState, useRef, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { RecordDiff, FieldDiff, ChangeKind } from "../../types";

// ── Colours per change kind ───────────────────────────────────────────────────

const KIND_COLOR: Record<ChangeKind, string> = {
  added:     "#22c55e",
  removed:   "#ef4444",
  modified:  "#f59e0b",
  unchanged: "#64748b",
};

const KIND_BG: Record<ChangeKind, string> = {
  added:     "rgba(34,197,94,0.06)",
  removed:   "rgba(239,68,68,0.06)",
  modified:  "rgba(245,158,11,0.06)",
  unchanged: "transparent",
};

const KIND_LABEL: Record<ChangeKind, string> = {
  added:     "+",
  removed:   "−",
  modified:  "~",
  unchanged: "=",
};

// ── Column resize ─────────────────────────────────────────────────────────────

const LS_KEY = "bgs_diff_col_widths";
// [type, formid, edid, old, new, translation, action]
const DEFAULT_WIDTHS = [88, 98, 128, 200, 200, 158, 108];
const MIN_COL_W = 40;

function loadWidths(): number[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === DEFAULT_WIDTHS.length &&
        (parsed as unknown[]).every((n) => typeof n === "number" && n >= MIN_COL_W)
      ) {
        return parsed as number[];
      }
    }
  } catch { /* ignore */ }
  return [...DEFAULT_WIDTHS];
}

function colGrid(widths: number[]): string {
  return `28px ${widths.map(w => `${w}px`).join(" ")}`;
}

// ── Flat row model (for virtualisation) ──────────────────────────────────────

type FlatRow =
  | { type: "record"; record: RecordDiff; expanded: boolean }
  | { type: "field";  record: RecordDiff; field: FieldDiff };

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = "type" | "formid" | "edid" | "kind";
type SortDir = "asc" | "desc";

const KIND_ORDER: Record<ChangeKind, number> = {
  added: 0, removed: 1, modified: 2, unchanged: 3,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  records:               RecordDiff[];
  filterKinds:           Set<ChangeKind>;
  filterQuery:           string;
  filterRecoverableOnly: boolean;
  /** Called when user clicks "Récupérer" on a single field. */
  onRecover:    (formId: number, subType: string, textNew: string | null, translation: string) => void;
  /** Called when user clicks "Récupérer tout". */
  onRecoverAll: (recoveries: Array<{ formId: number; subType: string; textNew: string | null; translation: string }>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiffTable({
  records,
  filterKinds,
  filterQuery,
  filterRecoverableOnly,
  onRecover,
  onRecoverAll,
}: Props) {
  const { t } = useTranslation();

  // Which record form_ids are expanded
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Column widths (resizable)
  const [colWidths, setColWidths] = useState<number[]>(loadWidths);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return key; }
      setSortDir("asc");
      return key;
    });
  }, []);

  const handleResize = useCallback((colIdx: number, delta: number) => {
    setColWidths(prev => {
      const next = prev.map((w, i) => i === colIdx ? Math.max(MIN_COL_W, w + delta) : w);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((formId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId); else next.add(formId);
      return next;
    });
  }, []);

  // Filter + search
  const filteredRecords = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    const filtered = records.filter(r => {
      if (!filterKinds.has(r.change_kind)) return false;
      if (filterRecoverableOnly && r.recoverable_count === 0) return false;
      if (q) {
        const hit =
          r.editor_id.toLowerCase().includes(q) ||
          r.record_type.toLowerCase().includes(q) ||
          r.form_id.toString(16).padStart(8, "0").includes(q) ||
          r.fields.some(f =>
            f.text_old?.toLowerCase().includes(q) ||
            f.text_new?.toLowerCase().includes(q)
          );
        if (!hit) return false;
      }
      return true;
    });

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "type":   cmp = a.record_type.localeCompare(b.record_type); break;
        case "formid": cmp = a.form_id - b.form_id; break;
        case "edid":   cmp = a.editor_id.localeCompare(b.editor_id); break;
        case "kind":   cmp = KIND_ORDER[a.change_kind] - KIND_ORDER[b.change_kind]; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [records, filterKinds, filterQuery, filterRecoverableOnly, sortKey, sortDir]);

  // Build flat row list (records + expanded field children)
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    for (const record of filteredRecords) {
      const isExpanded = expanded.has(record.form_id);
      rows.push({ type: "record", record, expanded: isExpanded });
      if (isExpanded) {
        const fieldsToShow = record.change_kind === "unchanged"
          ? record.fields
          : record.fields.filter(f => f.change_kind !== "unchanged");
        for (const field of fieldsToShow) {
          rows.push({ type: "field", record, field });
        }
      }
    }
    return rows;
  }, [filteredRecords, expanded]);

  // "Recover all" payload
  const allRecoveries = useMemo(() =>
    filteredRecords.flatMap(r =>
      r.fields
        .filter(f => f.change_kind !== "unchanged" && f.translation)
        .map(f => ({ formId: r.form_id, subType: f.sub_type, textNew: f.text_new, translation: f.translation! }))
    ),
    [filteredRecords]
  );

  // TanStack Virtual
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count:            flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     (i) => flatRows[i].type === "record" ? 30 : 40,
    overscan:         8,
  });

  const grid = colGrid(colWidths);

  const formIdHex = (id: number) =>
    id.toString(16).toUpperCase().padStart(8, "0");

  if (filteredRecords.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-2)", fontSize: "var(--fz-ui, 11px)",
        fontFamily: "var(--font-ui)",
      }}>
        {t("compare.no_results")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Recover all bar */}
      {allRecoveries.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 14px",
          background: "rgba(99,102,241,0.08)",
          borderBottom: "1px solid rgba(99,102,241,0.2)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "var(--fz-ui, 11px)", fontFamily: "var(--font-ui)", color: "var(--text-2)" }}>
            {t("compare.recover_all_hint", { count: allRecoveries.length })}
          </span>
          <button
            onClick={() => onRecoverAll(allRecoveries)}
            style={{
              padding: "3px 12px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              fontSize: "var(--fz-ui, 11px)",
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("compare.recover_all", { count: allRecoveries.length })}
          </button>
        </div>
      )}

      {/* Column header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: grid,
        padding: "0 6px",
        height: 24,
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--bg-table-header)",
        fontSize: "var(--fz-ui, 11px)",
        fontFamily: "var(--font-ui)",
        fontWeight: 600,
        color: "var(--text-2)",
        userSelect: "none",
        position: "relative",
      }}>
        {/* Sort by kind — the dot column */}
        <SortHeader label="•" sortKey="kind" current={sortKey} dir={sortDir} onSort={handleSort}
          title={t("compare.col_sort_kind")} />
        <SortHeader label={t("compare.col_type")}   sortKey="type"   current={sortKey} dir={sortDir} onSort={handleSort}
          onResize={delta => handleResize(0, delta)} />
        <SortHeader label={t("compare.col_formid")} sortKey="formid" current={sortKey} dir={sortDir} onSort={handleSort}
          onResize={delta => handleResize(1, delta)} />
        <SortHeader label={t("compare.col_edid")}   sortKey="edid"   current={sortKey} dir={sortDir} onSort={handleSort}
          onResize={delta => handleResize(2, delta)} />
        <HeaderCell label={t("compare.col_old")}         onResize={delta => handleResize(3, delta)} />
        <HeaderCell label={t("compare.col_new")}         onResize={delta => handleResize(4, delta)} />
        <HeaderCell label={t("compare.col_translation")} onResize={delta => handleResize(5, delta)} />
        <span />
      </div>

      {/* Virtual list */}
      <div ref={parentRef} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map(vItem => {
            const row = flatRows[vItem.index];

            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vItem.start}px)`,
                }}
              >
                {row.type === "record"
                  ? <RecordRow
                      record={row.record}
                      expanded={row.expanded}
                      onToggle={() => toggleExpanded(row.record.form_id)}
                      formIdHex={formIdHex}
                      grid={grid}
                    />
                  : <FieldRow
                      record={row.record}
                      field={row.field}
                      onRecover={onRecover}
                      grid={grid}
                      t={t}
                    />
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Record row ────────────────────────────────────────────────────────────────

function RecordRow({
  record, expanded, onToggle, formIdHex, grid,
}: {
  record:    RecordDiff;
  expanded:  boolean;
  onToggle:  () => void;
  formIdHex: (id: number) => string;
  grid:      string;
}) {
  const { t } = useTranslation();
  const color = KIND_COLOR[record.change_kind];
  const bg    = KIND_BG[record.change_kind];

  // Changed fields count for summary
  const changedCount = record.fields.filter(f => f.change_kind !== "unchanged").length;

  return (
    <div
      onClick={onToggle}
      style={{
        display: "grid",
        gridTemplateColumns: grid,
        alignItems: "center",
        height: 30,
        padding: "0 6px",
        background: bg,
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        userSelect: "none",
        fontFamily: "var(--font-ui)",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}14`)}
      onMouseLeave={e => (e.currentTarget.style.background = bg)}
    >
      {/* Indicator dot + expand */}
      <div
        title={t(`compare.kind_${record.change_kind}`)}
        style={{ display: "flex", alignItems: "center", gap: 3 }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: color, flexShrink: 0,
        }} />
        {record.fields.length > 0 && (
          <span style={{ fontSize: 9, color: "var(--text-2)", lineHeight: 1 }}>
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </div>

      {/* Type */}
      <span style={{
        fontSize: "var(--fz-mono, 11px)", fontFamily: "var(--font-mono)",
        color: "var(--text-2)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {record.record_type}
      </span>

      {/* FormID */}
      <span style={{
        fontSize: "var(--fz-mono, 11px)", fontFamily: "var(--font-mono)",
        color: "var(--text-2)", opacity: 0.8,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {formIdHex(record.form_id)}
      </span>

      {/* Editor ID */}
      <span style={{
        fontSize: "var(--fz-ui, 11px)", fontFamily: "var(--font-ui)",
        color: "var(--text-1)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        paddingRight: 6,
      }}>
        {record.editor_id || "—"}
      </span>

      {/* Summary spans the two text columns */}
      <span
        style={{
          gridColumn: "5 / 7",
          fontSize: "var(--fz-ui, 11px)", fontFamily: "var(--font-ui)",
          color: "var(--text-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {record.change_kind === "added"     && t("compare.record_added")}
        {record.change_kind === "removed"   && t("compare.record_removed")}
        {record.change_kind === "modified"  && t("compare.record_modified", { count: changedCount })}
        {record.change_kind === "unchanged" && t("compare.record_unchanged")}
      </span>

      {/* Recoverable badge */}
      <span style={{ fontSize: "var(--fz-ui, 11px)", color: "var(--text-2)" }}>
        {record.recoverable_count > 0 && (
          <span
            title={t("compare.recoverable_hint", { count: record.recoverable_count })}
            style={{
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: "var(--fz-ui, 11px)",
              fontWeight: 600,
              cursor: "help",
            }}
          >
            ✨ {record.recoverable_count}
          </span>
        )}
      </span>

      <span />
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────────

function FieldRow({
  field, record, onRecover, grid, t,
}: {
  field:     FieldDiff;
  record:    RecordDiff;
  onRecover: Props["onRecover"];
  grid:      string;
  t:         ReturnType<typeof useTranslation>["t"];
}) {
  const color = KIND_COLOR[field.change_kind];

  const canRecover = !!field.translation && field.change_kind !== "unchanged";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: grid,
      alignItems: "start",
      minHeight: 36,
      padding: "4px 6px",
      background: "var(--bg-card)",
      borderBottom: "1px solid var(--border)",
      borderLeft: `3px solid ${color}`,
      fontFamily: "var(--font-ui)",
    }}>
      {/* Indent + kind badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 2 }}>
        <span style={{
          fontSize: "var(--fz-ui, 11px)", fontWeight: 700, color,
          width: 14, textAlign: "center",
        }}>
          {KIND_LABEL[field.change_kind]}
        </span>
      </div>

      {/* Sub_type */}
      <span style={{
        fontSize: "var(--fz-mono, 11px)", fontFamily: "var(--font-mono)",
        color: "var(--text-2)", paddingTop: 3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {field.sub_type}
      </span>

      {/* FormID / EDID — empty for field rows */}
      <span />
      <span />

      {/* Old text */}
      <div
        title={field.text_old ?? undefined}
        style={{
          fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content)",
          color: field.text_old ? "var(--text-1)" : "var(--text-2)",
          lineHeight: 1.4, paddingRight: 8,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontStyle: field.text_old ? "normal" : "italic",
          opacity: field.text_old ? 1 : 0.5,
          paddingTop: 2,
        }}
      >
        {field.text_old ?? "—"}
      </div>

      {/* New text */}
      <div
        title={field.text_new ?? undefined}
        style={{
          fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content)",
          color: field.text_new ? "var(--text-1)" : "var(--text-2)",
          lineHeight: 1.4, paddingRight: 8,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontStyle: field.text_new ? "normal" : "italic",
          opacity: field.text_new ? 1 : 0.5,
          paddingTop: 2,
        }}
      >
        {field.text_new ?? "—"}
      </div>

      {/* Translation */}
      <div
        title={field.translation ?? undefined}
        style={{
          fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content)",
          color: field.translation ? "#818cf8" : "var(--text-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 4,
          paddingTop: 2,
        }}
      >
        {field.translation_source === "session" && (
          <span title={t("compare.source_session")} style={{ fontSize: 9, opacity: 0.7, flexShrink: 0 }}>💾</span>
        )}
        {field.translation_source === "ref_db" && (
          <span title={t("compare.source_db")} style={{ fontSize: 9, opacity: 0.7, flexShrink: 0 }}>🗄</span>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{field.translation ?? "—"}</span>
      </div>

      {/* Recover button */}
      <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 1 }}>
        {canRecover && (
          <button
            onClick={e => {
              e.stopPropagation();
              onRecover(record.form_id, field.sub_type, field.text_new, field.translation!);
            }}
            title={t("compare.recover_hint")}
            style={{
              padding: "2px 10px",
              background: "rgba(99,102,241,0.15)",
              color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 4,
              fontSize: "var(--fz-ui, 11px)",
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            {t("compare.recover")}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sort header cell (with resize handle) ─────────────────────────────────────

function SortHeader({
  label, sortKey, current, dir, onSort, title, onResize,
}: {
  label:     string;
  sortKey:   SortKey;
  current:   SortKey | null;
  dir:       SortDir;
  onSort:    (k: SortKey) => void;
  title?:    string;
  onResize?: (delta: number) => void;
}) {
  const active = current === sortKey;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", overflow: "hidden" }}>
      <div
        onClick={() => onSort(sortKey)}
        title={title}
        style={{
          display: "flex", alignItems: "center", gap: 3,
          cursor: "pointer",
          color: active ? "var(--accent)" : "var(--text-2)",
          userSelect: "none",
          overflow: "hidden",
          flex: 1,
        }}
      >
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontWeight: active ? 700 : 600,
        }}>
          {label}
        </span>
        <span style={{ fontSize: 9, opacity: active ? 1 : 0.3, flexShrink: 0 }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </div>
      {onResize && <ResizeHandle onResize={onResize} />}
    </div>
  );
}

// ── Plain header cell (no sort, with resize handle) ───────────────────────────

function HeaderCell({ label, onResize }: { label: string; onResize?: (delta: number) => void }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", overflow: "hidden" }}>
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        fontWeight: 600, color: "var(--text-2)",
      }}>
        {label}
      </span>
      {onResize && <ResizeHandle onResize={onResize} />}
    </div>
  );
}

// ── Resize handle ─────────────────────────────────────────────────────────────

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const startX = useRef<number | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;

    const onMove = (me: MouseEvent) => {
      if (startX.current === null) return;
      const delta = me.clientX - startX.current;
      startX.current = me.clientX;
      onResize(delta);
    };

    const onUp = () => {
      startX.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        right: -2,
        top: 0,
        bottom: 0,
        width: 5,
        cursor: "col-resize",
        zIndex: 2,
        // Subtle visible handle on hover
        background: "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--border)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    />
  );
}
