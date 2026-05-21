import { useTranslation } from "react-i18next";
import type { DiffStats } from "../../types";

interface Props {
  stats: DiffStats;
}

export default function DiffStatsBar({ stats }: Props) {
  const { t } = useTranslation();

  const chips: Array<{ label: string; value: number; color: string; bg: string }> = [
    { label: t("compare.stat_added"),     value: stats.added,     color: "var(--diff-added)",     bg: "color-mix(in srgb, var(--diff-added) 12%, transparent)"     },
    { label: t("compare.stat_removed"),   value: stats.removed,   color: "var(--diff-removed)",   bg: "color-mix(in srgb, var(--diff-removed) 12%, transparent)"   },
    { label: t("compare.stat_modified"),  value: stats.modified,  color: "var(--diff-modified)",  bg: "color-mix(in srgb, var(--diff-modified) 12%, transparent)"  },
    { label: t("compare.stat_unchanged"), value: stats.unchanged, color: "var(--diff-unchanged)", bg: "color-mix(in srgb, var(--diff-unchanged) 10%, transparent)" },
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
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          borderRadius: 6,
          padding: "3px 10px",
        }}>
          <span style={{ fontSize: "var(--fz-table)", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
            {value.toLocaleString()}
          </span>
          <span style={{ fontSize: "var(--fz-ui)", color: "var(--text-2)", fontWeight: 500 }}>{label}</span>
        </div>
      ))}

      {stats.recoverable > 0 && (
        <>
          <div style={{ height: 20, width: 1, background: "var(--border)" }} />
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "color-mix(in srgb, var(--diff-recoverable) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--diff-recoverable) 30%, transparent)",
            borderRadius: 6,
            padding: "3px 10px",
          }}>
            <span style={{ fontSize: 13 }}>✨</span>
            <span style={{ fontSize: "var(--fz-table)", fontWeight: 700, color: "var(--diff-recoverable)", fontVariantNumeric: "tabular-nums" }}>
              {stats.recoverable.toLocaleString()}
            </span>
            <span style={{ fontSize: "var(--fz-ui)", color: "var(--text-2)" }}>{t("compare.stat_recoverable")}</span>
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: "var(--fz-ui)", color: "var(--text-3, var(--text-2))", opacity: 0.6 }}>
        {t("compare.stat_total_changed", { count: stats.total_fields_changed })}
      </span>
    </div>
  );
}
