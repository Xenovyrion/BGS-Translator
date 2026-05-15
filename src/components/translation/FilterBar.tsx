import { useTranslation } from "react-i18next";
import type { FilterMode } from "../../types";

interface Props {
  filter:               FilterMode;
  search:               string;
  isLocalized:          boolean;
  showColumnFilters:    boolean;
  onFilterChange:       (f: FilterMode) => void;
  onSearchChange:       (s: string) => void;
  onToggleColumnFilters: () => void;
  // Multi-selection helpers
  selectedCount?:   number;
  totalVisible?:    number;
  onSelectAll?:     () => void;
  onClearSelection?: () => void;
}

export default function FilterBar({
  filter, search, isLocalized, showColumnFilters,
  onFilterChange, onSearchChange, onToggleColumnFilters,
  selectedCount = 0, totalVisible = 0,
  onSelectAll, onClearSelection,
}: Props) {
  const { t } = useTranslation();

  const allSelected  = totalVisible > 0 && selectedCount === totalVisible;

  const FILTERS: Array<{ key: FilterMode; label: string; color: string; icon?: string }> = [
    { key: "all",          label: t("filter.all"),          color: "var(--accent)" },
    { key: "untranslated", label: t("filter.untranslated"), color: "#ef4444", icon: "—" },
    { key: "pending",      label: t("filter.pending"),      color: "#f59e0b", icon: "?" },
    { key: "validated",    label: t("filter.validated"),    color: "#22c55e", icon: "✓" },
    { key: "ignored",      label: t("filter.ignored"),      color: "#64748b", icon: "×" },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-filter, var(--bg-card))",
      flexShrink: 0,
    }}>
      {/* Context label */}
      <span style={{
        fontSize: 10, color: "var(--text-3)", flexShrink: 0,
        textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
      }}>
        {t("filter.filter_label")}
      </span>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 3 }}>
        {FILTERS.map(({ key, label, color, icon }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              style={{
                height: 26, padding: "0 10px",
                borderRadius: 5, cursor: "pointer",
                fontSize: 11, fontWeight: active ? 700 : 400,
                background: active ? color : "transparent",
                color: active ? "#fff" : color,
                border: `1px solid ${color}`,
                opacity: active ? 1 : 0.6,
                transition: "opacity 0.12s, background 0.12s",
                boxSizing: "border-box",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {icon && <span style={{ fontWeight: 700, lineHeight: 1 }}>{icon}</span>}
              {label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={t("filter.search_placeholder")}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1, minWidth: 160,
          height: 26, padding: "0 10px",
          borderRadius: 5, fontSize: 12,
          background: "var(--bg-hover)", color: "var(--text-1)",
          border: "1px solid var(--border)", outline: "none",
          boxSizing: "border-box",
        }}
      />

      {isLocalized && (
        <span style={{ fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
          {t("filter.localized_badge")}
        </span>
      )}

      {/* ── Multi-selection controls ─────────────────────────────────── */}
      {onSelectAll && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {/* Divider */}
          <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />

          {/* Select-all / deselect-all toggle */}
          <button
            onClick={allSelected ? onClearSelection : onSelectAll}
            title={allSelected
              ? t("filter.deselect_all_title")
              : t("filter.select_all_title", { count: totalVisible })}
            style={{
              height: 26, padding: "0 8px",
              borderRadius: 5, cursor: "pointer", fontSize: 11,
              background: allSelected ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
              color: allSelected ? "var(--accent)" : "var(--text-2)",
              border: allSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
              fontWeight: allSelected ? 600 : 400,
              display: "flex", alignItems: "center", gap: 4,
              boxSizing: "border-box",
              transition: "all 0.12s",
            }}
          >
            {/* Checkbox indicator */}
            <span style={{ fontSize: 12, lineHeight: 1 }}>
              {allSelected ? "☑" : selectedCount > 0 ? "⊟" : "☐"}
            </span>
            {selectedCount > 0
              ? t("filter.n_selected", { count: selectedCount, total: totalVisible })
              : t("filter.select_all")}
          </button>

          {/* Hint icon — explains Ctrl+Click / Shift+Click */}
          <span
            title={t("filter.selection_hint")}
            style={{
              fontSize: 11, color: "var(--text-3)", cursor: "help",
              width: 18, height: 18, borderRadius: "50%",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, userSelect: "none",
            }}
          >
            ?
          </span>
        </div>
      )}

      {/* Column filters toggle */}
      <button
        onClick={onToggleColumnFilters}
        title={t("filter.column_filters_title")}
        style={{
          height: 26, padding: "0 10px",
          borderRadius: 5, fontSize: 11, cursor: "pointer",
          background: showColumnFilters ? "var(--accent)" : "var(--bg-hover)",
          color: showColumnFilters ? "#fff" : "var(--text-2)",
          border: showColumnFilters ? "none" : "1px solid var(--border)",
          fontWeight: showColumnFilters ? 700 : 400,
          flexShrink: 0, boxSizing: "border-box",
        }}
      >
        ⊟ {t("filter.column_filters")}
      </button>
    </div>
  );
}
