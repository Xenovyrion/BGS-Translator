import { useTranslation } from "react-i18next";
import type { View } from "../../types";

interface Props {
  currentView:   View;
  pluginName:    string | null;
  onViewChange:  (v: View) => void;
}

export default function Sidebar({ currentView, pluginName, onViewChange }: Props) {
  const { t } = useTranslation();

  const items: Array<{ view: View; icon: string; label: string; disabled?: boolean }> = [
    { view: "home",        icon: "⌂",  label: "Accueil" },
    { view: "translation", icon: "⌨",  label: t("nav.translation"), disabled: !pluginName },
    { view: "settings",    icon: "⚙",  label: t("nav.settings") },
  ];

  return (
    <aside style={{
      width: 220,
      background: "var(--bg-card)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
          Star<span style={{ color: "var(--accent)" }}>Translator</span>
        </div>
        {pluginName && (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pluginName}>
            {pluginName}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "10px 8px" }}>
        {items.map(({ view, icon, label, disabled }) => (
          <button
            key={view}
            onClick={() => !disabled && onViewChange(view)}
            disabled={disabled}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8, marginBottom: 2,
              background: currentView === view ? "var(--accent-dim)" : "none",
              color: disabled ? "var(--text-3)" : currentView === view ? "var(--accent)" : "var(--text-2)",
              border: "none", cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: currentView === view ? 600 : 400,
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 14, opacity: disabled ? 0.4 : 1 }}>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* Version */}
      <div style={{ padding: "12px 16px", fontSize: 10, color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
        v0.1.0
      </div>
    </aside>
  );
}
