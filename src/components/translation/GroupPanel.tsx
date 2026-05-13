import { useState } from "react";
import { useTranslation } from "react-i18next";
import { startDrag } from "../../hooks/useLayout";
import type { GroupStats } from "../../types";

/** Number formatted with a non-breaking space as the thousands separator */
const fmtN = (n: number) => n.toLocaleString("fr-FR");

const DEFAULT_COLOR = "#64748b";

interface Props {
  groups:          GroupStats[];
  selectedGroup:   string | null;
  totalEntries:    number;
  onSelectGroup:   (group: string | null) => void;
  sidebarWidth:    number;
  onSidebarResize: (delta: number) => void;
  recordColors:    Record<string, string>;
}

export default function GroupPanel({
  groups, selectedGroup, totalEntries, onSelectGroup,
  sidebarWidth, onSidebarResize, recordColors,
}: Props) {
  const { t } = useTranslation();
  const [handleHover, setHandleHover] = useState(false);

  const totalValidated = groups.reduce((s, g) => s + g.validated, 0);
  const totalIgnored   = groups.reduce((s, g) => s + g.ignored, 0);
  const totalPending   = groups.reduce((s, g) => s + g.pending, 0);
  const overallPercent = totalEntries > 0
    ? Math.round(((totalValidated + totalIgnored) / totalEntries) * 100)
    : 0;

  return (
    <div style={{
      width: sidebarWidth,
      flexShrink: 0,
      display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(0,0,0,0.3)",
      background: "var(--bg-sidebar)",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* Scroll list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* "All" row merged with the overall progress */}
        <button
          onClick={() => onSelectGroup(null)}
          style={{
            display: "flex", flexDirection: "column", gap: 5,
            width: "100%", padding: "9px 10px 8px",
            background: selectedGroup === null ? "rgba(255,255,255,0.06)" : "transparent",
            borderLeft: `3px solid ${selectedGroup === null ? "var(--accent)" : "transparent"}`,
            border: "none", borderTop: "none", borderRight: "none",
            borderBottom: "1px solid var(--border)",
            cursor: "pointer", textAlign: "left",
            flexShrink: 0,
          }}
        >
          {/* Ligne titre */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "var(--accent)" }}>
              {t("group.all")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {totalPending > 0 && (
                <span style={{ fontSize: 10, color: "#f59e0b" }}>?{fmtN(totalPending)}</span>
              )}
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                {fmtN(totalValidated)}/{fmtN(totalEntries)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                {overallPercent}%
              </span>
            </div>
          </div>
          {/* Progress bar — no inline label (% already shown above) */}
          <GradientBar pct={overallPercent} color="var(--accent)" height={10} showLabel={false} />
        </button>

        {groups.map((g) => (
          <GroupRow
            key={g.record_type}
            label={g.record_type}
            color={recordColors[g.record_type] ?? DEFAULT_COLOR}
            total={g.total}
            validated={g.validated}
            pending={g.pending}
            selected={selectedGroup === g.record_type}
            onClick={() => onSelectGroup(selectedGroup === g.record_type ? null : g.record_type)}
          />
        ))}
      </div>

      {/* ── Resize handle (right edge) ── */}
      <div
        onMouseDown={(e) => startDrag(e, "h", onSidebarResize)}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        style={{
          position: "absolute", top: 0, right: 0,
          width: 5, height: "100%",
          cursor: "col-resize",
          zIndex: 20,
          display: "flex", alignItems: "stretch",
          justifyContent: "center",
        }}
      >
        {/* Ligne visuelle */}
        <div style={{
          width: 2, height: "100%",
          background: handleHover ? "var(--accent)" : "transparent",
          transition: "background 0.15s",
          borderRadius: 1,
        }} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradientBar({ pct, color, height = 12, showLabel = true }: { pct: number; color: string; height?: number; showLabel?: boolean }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", position: "relative" }}>
      <div style={{
        height: "100%", width: `${pct}%`,
        borderRadius: height / 2,
        background: `linear-gradient(90deg, ${color}55 0%, ${color} 100%)`,
        transition: "width 0.3s",
        minWidth: pct > 0 ? 3 : 0,
      }} />
      {showLabel && pct >= 10 && (
        <span style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.95)",
          pointerEvents: "none", letterSpacing: "0.03em",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}>
          {pct}%
        </span>
      )}
    </div>
  );
}

function GroupRow({
  label, color, total, validated, pending, selected, onClick,
}: {
  label: string; color: string; total: number; validated: number; pending: number;
  selected: boolean; onClick: () => void;
}) {
  const pct = total > 0 ? Math.round((validated / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 3,
        width: "100%", padding: "7px 10px",
        background: selected ? "rgba(255,255,255,0.06)" : "transparent",
        borderLeft: `3px solid ${selected ? color : "transparent"}`,
        border: "none", borderTop: "none", borderRight: "none",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "monospace", color }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)", display: "flex", gap: 4, alignItems: "center" }}>
          {pending > 0 && <span style={{ color: "#f59e0b" }}>?{fmtN(pending)}</span>}
          <span>{fmtN(validated)}/{fmtN(total)}</span>
        </span>
      </div>
      <GradientBar pct={pct} color={color} height={10} />
    </button>
  );
}
