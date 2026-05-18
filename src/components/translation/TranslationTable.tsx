import { memo, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { TranslationEntry, EntryStatus, SortConfig, FuzzyMatch } from "../../types";
import { fuzzyScoreColor, fuzzyScoreLabel } from "../../types";
import { entryKey } from "../../hooks/usePlugin";
import type { ColumnWidths } from "../../hooks/useLayout";
import { startDrag } from "../../hooks/useLayout";
import { TaggedText } from "../shared/TaggedText";
import { IconSearch } from "../../icons";

const STATUS_COLORS: Record<EntryStatus, string> = {
  untranslated: "var(--status-untranslated)",
  pending:      "var(--status-pending)",
  validated:    "var(--status-validated)",
  ignored:      "var(--status-ignored)",
};

type SortCol = SortConfig["column"];

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

const DOT_WIDTH  = 34;
const COL_COUNT  = 7;
const ROW_HEIGHT = 24; // px — estimation hauteur ligne

interface Props {
  entries:           TranslationEntry[];
  selectedEntry:     TranslationEntry | null;
  selectedKeys:      Set<string>;
  sortConfig:        SortConfig | null;
  columnFilters:     Partial<Record<string, string>>;
  showColumnFilters: boolean;
  alternateRows?:    boolean;
  rowHover?:         boolean;
  columnWidths:      ColumnWidths;
  textSplit:         number;
  recordColors:      Record<string, string>;
  fuzzyMatches?:     Map<number, FuzzyMatch>;
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
  rowHover = true,
  columnWidths, textSplit, recordColors,
  fuzzyMatches,
  onRowClick, onToggleSort, onColumnFilter, onKeyDown,
  onColumnResize, onTextSplit,
  tableRef,
}: Props) {
  const { t } = useTranslation();
  const [containerWidth, setContainerWidth] = useState(700);

  /* ── Virtualizer ─────────────────────────────────────────────────────────── */
  const virtualizer = useVirtualizer({
    count:            entries.length,
    getScrollElement: () => tableRef.current,
    estimateSize:     () => ROW_HEIGHT,
    overscan:         10,
  });

  /* ── Observer la largeur du conteneur ────────────────────────────────────── */
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

  /* ── Scroll vers la ligne sélectionnée ───────────────────────────────────── */
  useEffect(() => {
    if (!selectedEntry) return;
    const idx = entries.findIndex((e) => entryKey(e) === entryKey(selectedEntry));
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Calcul des largeurs ──────────────────────────────────────────────────── */
  const fixedTotal =
    DOT_WIDTH +
    columnWidths.record_type +
    columnWidths.form_id +
    columnWidths.editor_id +
    columnWidths.sub_type;

  const flexTotal       = Math.max(80, containerWidth - fixedTotal);
  const originalWidth   = Math.round(flexTotal * textSplit);
  const translatedWidth = flexTotal - originalWidth;

  const colPx = [
    DOT_WIDTH,
    columnWidths.record_type,
    columnWidths.form_id,
    columnWidths.editor_id,
    columnWidths.sub_type,
    originalWidth,
    translatedWidth,
  ];

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  if (entries.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: 13 }}>
        {t("translation.empty")}
      </div>
    );
  }

  /* ── Virtual items ───────────────────────────────────────────────────────── */
  const virtualItems  = virtualizer.getVirtualItems();
  const totalSize     = virtualizer.getTotalSize();
  const paddingTop    = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

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
          <tr style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg-table-header, var(--bg-card))" }}>
            <th style={{ padding: "5px 6px", textAlign: "center", width: DOT_WIDTH, borderBottom: showColumnFilters ? "none" : "1px solid var(--border)", position: "relative" }} />

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
                    position: "relative", overflow: "hidden",
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
                    <ColResizeHandle onDrag={(delta) => onColumnResize(col.resizable!, delta)} />
                  )}
                </th>
              );
            })}

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
              <ColResizeHandle onDrag={(delta) => onTextSplit(delta, flexTotal)} />
            </th>

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
                          background: columnFilters[key] ? "var(--accent-alt-dim)" : "var(--bg-hover)",
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
          {/* Spacer haut — simule les lignes au-dessus de la zone visible */}
          {paddingTop > 0 && (
            <tr><td colSpan={COL_COUNT} style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
          )}

          {virtualItems.map((vItem) => {
            const entry     = entries[vItem.index];
            const key       = entryKey(entry);
            const isPrimary = selectedEntry ? entryKey(selectedEntry) === key : false;
            return (
              <TableRow
                key={key}
                entry={entry}
                idx={vItem.index}
                isPrimary={isPrimary}
                isSelected={selectedKeys.has(key)}
                alternateRows={alternateRows}
                rowHover={rowHover}
                recordColors={recordColors}
                fuzzyMatch={entry._idx !== undefined ? fuzzyMatches?.get(entry._idx) : undefined}
                onRowClick={onRowClick}
              />
            );
          })}

          {/* Spacer bas — simule les lignes sous la zone visible */}
          {paddingBottom > 0 && (
            <tr><td colSpan={COL_COUNT} style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Memoized table row ────────────────────────────────────────────────────────

interface RowProps {
  entry:              TranslationEntry;
  idx:                number;
  isPrimary:          boolean;
  isSelected:         boolean;
  alternateRows:      boolean;
  rowHover:           boolean;
  recordColors:       Record<string, string>;
  fuzzyMatch?:        FuzzyMatch;
  onRowClick:         (entry: TranslationEntry, ctrlKey: boolean, shiftKey: boolean) => void;
}

const TableRow = memo(function TableRow({
  entry, idx, isPrimary, isSelected, alternateRows, rowHover, recordColors, fuzzyMatch, onRowClick,
}: RowProps) {
  const [hovered, setHovered] = useState(false);
  const statusColor = STATUS_COLORS[entry.status];
  const recordColor = recordColors[entry.record_type] ?? "var(--text-3)";
  const formIdHex   = entry.form_id.toString(16).toUpperCase().padStart(8, "0");

  const rowBg = isPrimary
    ? "var(--accent-alt-dim)"
    : isSelected
    ? "var(--accent-alt-dim)"
    : hovered && rowHover
    ? "var(--bg-row-hover)"
    : alternateRows && idx % 2 !== 0
    ? "var(--bg-row-alt)"
    : "transparent";

  return (
    <tr
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== "TEXTAREA" && (e.target as HTMLElement).tagName !== "INPUT") {
          e.preventDefault();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => onRowClick(entry, e.ctrlKey || e.metaKey, e.shiftKey)}
      style={{
        background:   rowBg,
        borderBottom: "1px solid var(--border)",
        borderLeft:   `3px solid ${statusColor}`,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <td style={{ padding: "0 3px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
          <div
            style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0, boxShadow: `0 0 4px ${statusColor}55` }}
          />
          <span
            title={entry.source.type === "Localized"
              ? `Localisé — string ID ${entry.source.string_id} (${entry.source.kind})`
              : "Intégré dans le plugin (.esp/.esm)"}
            style={{
              fontSize: 10, fontWeight: 800, lineHeight: 1,
              fontFamily: "monospace",
              color: entry.source.type === "Localized" ? "var(--accent-alt)" : "var(--text-3)",
              userSelect: "none",
              flexShrink: 0,
              padding: "3px 4px",
              borderRadius: 3,
              cursor: "default",
            }}
          >
            {entry.source.type === "Localized" ? "L" : "I"}
          </span>
        </div>
      </td>
      <td style={{ padding: "3px 6px" }}>
        <span style={{ fontSize: "var(--fz-mono, 10px)", fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: recordColor }}>
          {entry.record_type}
        </span>
      </td>
      <td style={{ padding: "3px 6px", fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
        {formIdHex}
      </td>
      <td style={{ padding: "3px 6px", fontSize: 10, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.editor_id}>
        {entry.editor_id}
      </td>
      <td style={{ padding: "3px 6px" }}>
        <span style={{ fontSize: "var(--fz-mono, 10px)", color: "var(--text-3)", fontFamily: "var(--font-mono, monospace)" }}>{entry.sub_type}</span>
      </td>
      <td style={{ padding: "3px 6px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 0 }} title={entry.original}>
        <TaggedText text={entry.original} />
      </td>
      <td style={{ padding: "3px 6px", overflow: "hidden", maxWidth: 0 }}>
        {entry.translated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
            <span style={{ color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
              title={entry.translated}>
              <TaggedText text={entry.translated} />
            </span>
          </div>
        ) : fuzzyMatch ? (
          /* Untranslated but has a fuzzy suggestion → show coloured badge */
          <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
            <span
              title={`${fuzzyScoreLabel(fuzzyMatch.score)} — ${fuzzyMatch.matched_src}`}
              style={{
                flexShrink: 0, fontSize: 9, fontWeight: 700,
                color: fuzzyScoreColor(fuzzyMatch.score),
                background: `${fuzzyScoreColor(fuzzyMatch.score)}22`,
                border: `1px solid ${fuzzyScoreColor(fuzzyMatch.score)}55`,
                borderRadius: 4, padding: "1px 4px",
                display: "flex", alignItems: "center", gap: 2,
              }}>
              <IconSearch size={9} /> {fuzzyScoreLabel(fuzzyMatch.score)}
            </span>
            <span style={{ color: fuzzyScoreColor(fuzzyMatch.score), opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.95em", fontStyle: "italic", flex: 1 }}
              title={`Suggestion: ${fuzzyMatch.suggested}`}>
              {fuzzyMatch.suggested}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>–</span>
        )}
      </td>
    </tr>
  );
});

// ── Column resize handle ──────────────────────────────────────────────────────

function ColResizeHandle({ onDrag }: { onDrag: (delta: number) => void }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
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
