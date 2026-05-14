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
}

export default function FilterBar({
  filter, search, isLocalized, showColumnFilters,
  onFilterChange, onSearchChange, onToggleColumnFilters,
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
      {/* Context label — communicates that these buttons filter, not set status */}
      <span style={{
        fontSize: 10, color: "var(--text-3)", flexShrink: 0,
        textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
      }}>
        {t("filter.filter_label")}
      </span>

      {/* Filter pills — height and color scheme match status badges */}
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
