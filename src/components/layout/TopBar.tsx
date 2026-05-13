interface Props {
  pluginName:    string | null;
  onOpenPlugin:  () => void;
  onSettings:    () => void;
  onSave?:       () => void;
  onExport?:     () => void;
  loading?:      boolean;
}

export default function TopBar({ pluginName, onOpenPlugin, onSettings, onSave, onExport, loading }: Props) {
  return (
    <header style={{
      height: 40,
      display: "flex",
      alignItems: "center",
      padding: "0 10px",
      background: "var(--bg-card)",
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
      gap: 8,
      userSelect: "none",
    }}>
      {/* Logo */}
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", marginRight: 8 }}>
        BGS<span style={{ color: "var(--accent)" }}>Translator</span>
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--border)" }} />

      {/* Open plugin */}
      <button
        onClick={onOpenPlugin}
        disabled={loading}
        style={{
          padding: "4px 12px", borderRadius: 5, fontSize: 12, cursor: loading ? "wait" : "pointer",
          background: pluginName ? "var(--bg-hover)" : "var(--accent)",
          color: pluginName ? "var(--text-2)" : "#fff",
          border: "none", fontWeight: pluginName ? 400 : 600,
        }}
      >
        {loading ? "Chargement…" : pluginName ? "Changer de plugin…" : "Ouvrir un plugin…"}
      </button>

      {/* Plugin name */}
      {pluginName && (
        <span style={{
          fontSize: 11, color: "var(--text-3)", fontFamily: "monospace",
          maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={pluginName}>
          {pluginName}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions plugin */}
      {pluginName && onSave && (
        <button onClick={onSave} style={{ padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
          Sauvegarder
        </button>
      )}
      {pluginName && onExport && (
        <button onClick={onExport} style={{ padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", fontWeight: 600 }}>
          Exporter
        </button>
      )}

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--border)" }} />

      {/* Settings */}
      <button
        onClick={onSettings}
        title="Paramètres"
        style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-2)", border: "1px solid var(--border)" }}
      >
        ⚙ Paramètres
      </button>

      {/* Version */}
      <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 4 }}>v0.1.0</span>
    </header>
  );
}
