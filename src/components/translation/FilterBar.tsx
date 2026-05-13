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

  const FILTERS: Array<{ key: FilterMode; label: string; color: string }> = [
    { key: "all",          label: t("filter.all"),          color: "var(--accent)" },
    { key: "untranslated", label: t("filter.untranslated"), color: "#ef4444" },
    { key: "pending",      label: t("filter.pending"),      color: "#f59e0b" },
    { key: "validated",    label: t("filter.validated"),    color: "#22c55e" },
    { key: "ignored",      label: t("filter.ignored"),      color: "#64748b" },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "6px 10px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-filter, var(--bg-card))",
      flexShrink: 0,
    }}>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: 3 }}>
        {FILTERS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            style={{
              padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontSize: 11,
              fontWeight: filter === key ? 700 : 400,
              background: filter === key ? color : "var(--bg-hover)",
              color: filter === key ? "#fff" : "var(--text-2)",
              border: "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={t("filter.search_placeholder")}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1, minWidth: 160, padding: "4px 10px", borderRadius: 5, fontSize: 12,
          background: "var(--bg-hover)", color: "var(--text-1)",
          border: "1px solid var(--border)", outline: "none",
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
          padding: "4px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer",
          background: showColumnFilters ? "var(--accent)" : "var(--bg-hover)",
          color: showColumnFilters ? "#fff" : "var(--text-2)",
          border: showColumnFilters ? "none" : "1px solid var(--border)",
          fontWeight: showColumnFilters ? 700 : 400,
          flexShrink: 0,
        }}
      >
        ⊟ {t("filter.column_filters")}
      </button>
    </div>
  );
}
