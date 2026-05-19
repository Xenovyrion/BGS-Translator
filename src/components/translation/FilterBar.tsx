import { useTranslation } from "react-i18next";
import type { FilterMode } from "../../types";
import { IconFilter, IconSearch as IconSuggestion } from "../../icons";

interface Props {
  filter:               FilterMode;
  search:               string;
  showColumnFilters:    boolean;
  onFilterChange:       (f: FilterMode) => void;
  onSearchChange:       (s: string) => void;
  onToggleColumnFilters: () => void;
  /** Fuzzy-only filter toggle */
  filterFuzzyOnly?:     boolean;
  onToggleFuzzyOnly?:   () => void;
  fuzzyMatchCount?:     number;
}

export default function FilterBar({
  filter, search, showColumnFilters,
  onFilterChange, onSearchChange, onToggleColumnFilters,
  filterFuzzyOnly = false, onToggleFuzzyOnly, fuzzyMatchCount = 0,
}: Props) {
  const { t } = useTranslation();

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

      {/* Search — first, most used action */}
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

      {/* Thin divider */}
      <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
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
                flexShrink: 0,
              }}
            >
              {icon && <span style={{ fontWeight: 700, lineHeight: 1 }}>{icon}</span>}
              {label}
            </button>
          );
        })}
      </div>

      {/* Fuzzy-only chip — only shown when there are suggestions */}
      {onToggleFuzzyOnly && fuzzyMatchCount > 0 && (
        <button
          onClick={onToggleFuzzyOnly}
          title={`${fuzzyMatchCount} suggestion(s) automatique(s)`}
          style={{
            height: 26, padding: "0 10px",
            borderRadius: 5, cursor: "pointer",
            fontSize: 11, fontWeight: filterFuzzyOnly ? 700 : 400,
            background: filterFuzzyOnly ? "#f97316" : "transparent",
            color: filterFuzzyOnly ? "#fff" : "#f97316",
            border: "1px solid #f97316",
            opacity: filterFuzzyOnly ? 1 : 0.7,
            transition: "opacity 0.12s, background 0.12s",
            boxSizing: "border-box", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <IconSuggestion size={11} /> {t("filter.fuzzy_only")}
          <span style={{
            background: filterFuzzyOnly ? "rgba(255,255,255,0.3)" : "rgba(249,115,22,0.2)",
            borderRadius: 8, padding: "0 5px", fontSize: 10, fontWeight: 700,
          }}>
            {fuzzyMatchCount}
          </span>
        </button>
      )}

      {/* Column filters toggle — rightmost */}
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
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <IconFilter size={12} /> {t("filter.column_filters")}
      </button>
    </div>
  );
}
