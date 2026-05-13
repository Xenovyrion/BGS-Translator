import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TranslationEntry, EntryStatus, SortConfig } from "../../types";
import { entryKey } from "../../hooks/usePlugin";
import type { ColumnWidths } from "../../hooks/useLayout";
import { startDrag } from "../../hooks/useLayout";


const STATUS_COLORS: Record<EntryStatus, string> = {
  untranslated: "#ef4444",
  pending:      "#f59e0b",
  validated:    "#22c55e",
  ignored:      "#64748b",
};

type SortCol = SortConfig["column"];

/** Colonnes fixes (px) — dans l'ordre d'affichage */
const FIXED_COLS: Array<{
  key:       string;
  labelKey:  string;
  resizable?: keyof ColumnWidths;
  align?:    "center" | "left";
  sortable?: SortCol;
}> = [
  { key: "_dot",        labelKey: "",                    align: "center" },
  { key: "record_type", labelKey: "table.col_type",      resizable: "record_type", sortable: "record_type" },
  { key: "form_id",     labelKey: "table.col_id",        resizable: "form_id",     sortable: "form_id" },
  { key: "editor_id",   labelKey: "table.col_edid",      resizable: "editor_id" },
  { key: "sub_type",    labelKey: "table.col_field",     resizable: "sub_type",    sortable: "sub_type" },
];

const DOT_WIDTH = 22; // largeur fixe non-redimensionnable

interface Props {
  entries:           TranslationEntry[];
  selectedEntry:     TranslationEntry | null;
  selectedKeys:      Set<string>;
  sortConfig:        SortConfig | null;
  columnFilters:     Partial<Record<string, string>>;
  showColumnFilters: boolean;
  alternateRows?:    boolean;
  columnWidths:      ColumnWidths;
  textSplit:         number;
  recordColors:      Record<string, string>;
  onRowClick:        (entry: TranslationEntry, ctrlKey: boolean, shiftKey: boolean) => void;
  onToggleSort:      (col: SortCol) => void;
  onColumnFilter:    (col: string, value: string) => void;
  onKeyDown:         (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onColumnResize:    (col: keyof ColumnWidths, delta: number) => void;
  onTextSplit:       (delta: number, flexTotal: number) => void;
  tableRef:          React.RefObject<HTMLDivElement>;
}

export default function TranslationTable({
  entries, selectedEntry, selectedKeys, sortConfig, columnFilters, showColumnFilters,
  alternateRows = true,
  columnWidths, textSplit, recordColors,
  onRowClick, onToggleSort, onColumnFilter, onKeyDown,
  onColumnResize, onTextSplit,
  tableRef,
}: Props) {
  const { t } = useTranslation();
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(700);

  /* ── Observer la largeur du conteneur ────────────────────────────────── */
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    obs.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Scroll to the selected row */
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedEntry]);

  /* ── Calcul des largeurs ──────────────────────────────────────────────── */
  const fixedTotal =
    DOT_WIDTH +
    columnWidths.record_type +
    columnWidths.form_id +
    columnWidths.editor_id +
    columnWidths.sub_type;

  const flexTotal      = Math.max(80, containerWidth - fixedTotal);
  const originalWidth  = Math.round(flexTotal * textSplit);
  const translatedWidth = flexTotal - originalWidth;

  /* ── Largeurs des 7 colonnes dans l'ordre ────────────────────────────── */
  const colPx = [
    DOT_WIDTH,
    columnWidths.record_type,
    columnWidths.form_id,
    columnWidths.editor_id,
    columnWidths.sub_type,
    originalWidth,
    translatedWidth,
  ];

  if (entries.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
        {t("translation.empty")}
      </div>
    );
  }

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ flex: 1, overflowY: "auto", outline: "none", fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content, system-ui, sans-serif)" }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          {colPx.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>

        <thead>
          {/* Sortable headers */}
          <tr style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-table-header, var(--bg-card))" }}>
            {/* Dot */}
            <th style={{ padding: "5px 6px", textAlign: "center", width: DOT_WIDTH, borderBottom: showColumnFilters ? "none" : "1px solid var(--border)", position: "relative" }} />

            {/* Colonnes fixes redimensionnables */}
            {FIXED_COLS.slice(1).map((col) => {
              const isSorted = col.sortable && sortConfig?.column === col.sortable;
              const label    = col.labelKey ? t(col.labelKey) : "";
              return (
                <th
                  key={col.key}
                  onClick={col.sortable ? (e) => { e.stopPropagation(); onToggleSort(col.sortable!); } : undefined}
                  style={{
                    padding: "5px 6px",
                    textAlign: col.align ?? "left",
                    fontSize: 10, fontWeight: 700,
                    color: isSorted ? "var(--accent)" : "var(--text-3)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    borderBottom: showColumnFilters ? "none" : "1px solid var(--border)",
                    cursor: col.sortable ? "pointer" : "default",
                    userSelect: "none", whiteSpace: "nowrap",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span>{label}</span>
                    {col.sortable && (
                      <span style={{ fontSize: 9, opacity: isSorted ? 1 : 0, color: "var(--accent)" }}>
                        {sortConfig?.dir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                  {col.resizable && (
                    <ColResizeHandle
                      onDrag={(delta) => onColumnResize(col.resizable!, delta)}
                    />
                  )}
                </th>
              );
            })}

            {/* Original */}
            <th
              onClick={() => onToggleSort("original")}
              style={{
                padding: "5px 6px", textAlign: "left",
                fontSize: 10, fontWeight: 700,
                color: sortConfig?.column === "original" ? "var(--accent)" : "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: showColumnFilters ? "none" : "1px solid var(--border)",
                cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span>{t("table.col_original")}</span>
                <span style={{ fontSize: 9, opacity: sortConfig?.column === "original" ? 1 : 0, color: "var(--accent)" }}>
                  {sortConfig?.dir === "asc" ? "▲" : "▼"}
                </span>
              </div>
              <ColResizeHandle
                onDrag={(delta) => onTextSplit(delta, flexTotal)}
              />
            </th>

            {/* Traduit */}
            <th
              onClick={() => onToggleSort("translated")}
              style={{
                padding: "5px 6px", textAlign: "left",
                fontSize: 10, fontWeight: 700,
                color: sortConfig?.column === "translated" ? "var(--accent)" : "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: showColumnFilters ? "none" : "1px solid var(--border)",
                cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span>{t("table.col_translated")}</span>
                <span style={{ fontSize: 9, opacity: sortConfig?.column === "translated" ? 1 : 0, color: "var(--accent)" }}>
                  {sortConfig?.dir === "asc" ? "▲" : "▼"}
                </span>
              </div>
            </th>
          </tr>

          {/* Ligne de filtres colonnes */}
          {showColumnFilters && (
            <tr style={{ position: "sticky", top: 22, zIndex: 9, background: "var(--bg-table-header, var(--bg-card))" }}>
              {["_dot", "record_type", "form_id", "editor_id", "sub_type", "original", "translated"].map((key) => {
                const canFilter = key !== "_dot";
                return (
                  <th key={key} style={{ padding: "2px 4px", borderBottom: "1px solid var(--border)" }}>
                    {canFilter ? (
                      <input
                        type="text"
                        value={(columnFilters[key] as string) ?? ""}
                        onChange={(e) => onColumnFilter(key, e.target.value)}
                        placeholder="…"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%", padding: "2px 5px", fontSize: 10,
                          background: columnFilters[key] ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                          color: "var(--text-1)", border: "1px solid var(--border)",
                          borderRadius: 3, outline: "none", boxSizing: "border-box",
                        }}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          )}
        </thead>

        <tbody>
          {entries.map((entry, idx) => {
            const key         = entryKey(entry);
            const isPrimary   = selectedEntry ? entryKey(selectedEntry) === key : false;
            const isSelected  = selectedKeys.has(key);
            const statusColor = STATUS_COLORS[entry.status];
            const recordColor = recordColors[entry.record_type] ?? "#64748b";
            const formIdHex   = entry.form_id.toString(16).toUpperCase().padStart(8, "0");

            return (
              <tr
                key={key}
                ref={isPrimary ? selectedRowRef : undefined}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "INPUT") {
                    e.preventDefault();
                  }
                }}
                onClick={(e) => onRowClick(entry, e.ctrlKey || e.metaKey, e.shiftKey)}
                style={{
                  background: isPrimary
                    ? "rgba(99,102,241,0.15)"
                    : isSelected
                    ? "rgba(99,102,241,0.07)"
                    : alternateRows && idx % 2 !== 0 ? "rgba(255,255,255,0.015)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                  borderLeft:   `3px solid ${statusColor}`,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {/* Dot statut */}
                <td style={{ padding: "0 4px", textAlign: "center" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, margin: "0 auto", boxShadow: `0 0 4px ${statusColor}55` }} />
                </td>

                {/* TYPE */}
                <td style={{ padding: "3px 6px" }}>
                  <span style={{ fontSize: "var(--fz-mono, 10px)", fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: recordColor }}>
                    {entry.record_type}
                  </span>
                </td>

                {/* ID (FormID hex) */}
                <td style={{ padding: "3px 6px", fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                  {formIdHex}
                </td>

                {/* EDID */}
                <td style={{ padding: "3px 6px", fontSize: 10, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.editor_id}>
                  {entry.editor_id}
                </td>

                {/* CHAMP */}
                <td style={{ padding: "3px 6px" }}>
                  <span style={{ fontSize: "var(--fz-mono, 10px)", color: "var(--text-3)", fontFamily: "var(--font-mono, monospace)" }}>{entry.sub_type}</span>
                </td>

                {/* Original */}
                <td style={{ padding: "3px 6px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 }} title={entry.original}>
                  {entry.original}
                </td>

                {/* Traduit */}
                <td style={{ padding: "3px 6px", color: entry.translated ? "var(--text-1)" : "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0, fontStyle: entry.translated ? "normal" : "italic" }} title={entry.translated || t("table.not_translated")}>
                  {entry.translated || "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Column resize handle ──────────────────────────────────────────────────────

function ColResizeHandle({ onDrag }: { onDrag: (delta: number) => void }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation(); // prevent sort from triggering
        startDrag(e, "h", onDrag);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        top: 0, right: 0,
        width: 5, height: "100%",
        cursor: "col-resize",
        zIndex: 5,
        display: "flex", alignItems: "stretch", justifyContent: "center",
      }}
    >
      <div style={{
        width: 2, height: "100%",
        background: hover ? "var(--accent)" : "transparent",
        transition: "background 0.15s",
        borderRadius: 1,
      }} />
    </div>
  );
}
