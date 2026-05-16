import { useTranslation } from "react-i18next";
import type { DiffStats } from "../../types";

interface Props {
  stats: DiffStats;
}

export default function DiffStatsBar({ stats }: Props) {
  const { t } = useTranslation();

  const chips: Array<{ label: string; value: number; color: string; bg: string }> = [
    { label: t("compare.stat_added"),       value: stats.added,       color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
    { label: t("compare.stat_removed"),     value: stats.removed,     color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
    { label: t("compare.stat_modified"),    value: stats.modified,    color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    { label: t("compare.stat_unchanged"),   value: stats.unchanged,   color: "#64748b", bg: "rgba(100,116,139,0.10)"},
  ];

  return (
    <div style={{
      padding: "10px 16px",
      background: "var(--bg-sidebar)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}>
      {chips.map(({ label, value, color, bg }) => (
        <div key={label} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: bg,
          border: `1px solid ${color}33`,
          borderRadius: 6,
          padding: "3px 10px",
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
            {value.toLocaleString()}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
        </div>
      ))}

      {stats.recoverable > 0 && (
        <>
          <div style={{ height: 20, width: 1, background: "var(--border)" }} />
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 6,
            padding: "3px 10px",
          }}>
            <span style={{ fontSize: 13 }}>✨</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#818cf8", fontVariantNumeric: "tabular-nums" }}>
              {stats.recoverable.toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-2)" }}>{t("compare.stat_recoverable")}</span>
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "var(--text-3, var(--text-2))", opacity: 0.6 }}>
        {t("compare.stat_total_changed", { count: stats.total_fields_changed })}
      </span>
    </div>
  );
}
