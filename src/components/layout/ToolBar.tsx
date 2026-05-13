// ── Toolbar with icons ────────────────────────────────────────────────────────
import React from "react";
import { useTranslation } from "react-i18next";
import type { IconSetId } from "../../themes";

interface Props {
  pluginName:      string | null;
  loading?:        boolean;
  loadingProgress?: number | null;
  onOpenPlugin:    () => void;
  onOpenSession:   () => void;
  onSave?:         () => void;
  onExport?:       () => void;
  onSettings:      () => void;
  iconSet?:        IconSetId;
  lastAutosave?:   Date | null;
}

export default function ToolBar({ pluginName, loading, loadingProgress, onOpenPlugin, onOpenSession, onSave, onExport, onSettings, iconSet = "minimal", lastAutosave }: Props) {
  const { t } = useTranslation();

  const openTitle = loading
    ? t("toolbar.open_file_loading")
    : pluginName
      ? t("toolbar.open_file_another")
      : t("toolbar.open_file");

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "0 8px",
      gap: 2,
      background: "var(--bg-toolbar)",
      borderBottom: "1px solid rgba(0,0,0,0.3)",
      boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03)",
      height: 36,
      flexShrink: 0,
      userSelect: "none",
    }}>
      {/* ── Groupe Fichier ─────────────────────── */}
      <ToolGroup>
        <ToolBtn
          title={openTitle}
          onClick={onOpenPlugin}
          disabled={loading}
          accent={!pluginName && !loading}
        >
          <IconOpenFolder set={iconSet} />
        </ToolBtn>

        <ToolBtn
          title={t("toolbar.open_session")}
          onClick={onOpenSession}
          disabled={loading}
        >
          <IconOpenSession set={iconSet} />
        </ToolBtn>

        <ToolBtn
          title={t("toolbar.save_session")}
          onClick={onSave}
          disabled={!pluginName || !onSave}
        >
          <IconSave set={iconSet} />
        </ToolBtn>

        <ToolBtn
          title={t("toolbar.export_plugin")}
          onClick={onExport}
          disabled={!pluginName || !onExport}
        >
          <IconExport set={iconSet} />
        </ToolBtn>
      </ToolGroup>

      <Divider />

      {/* ── Settings ───────────────────────────── */}
      <ToolGroup>
        <ToolBtn title={t("toolbar.settings")} onClick={onSettings}>
          <IconSettings set={iconSet} />
        </ToolBtn>
      </ToolGroup>

      {/* ── Fichier ouvert ─────────────────────── */}
      {pluginName && (
        <>
          <Divider />
          <span style={{
            fontSize: 11, color: "var(--text-3)", fontFamily: "monospace",
            paddingLeft: 6,
            maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={pluginName}>
            {pluginName}
          </span>
          {loading && (
            <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <SpinSVG />
              {loadingProgress != null && loadingProgress > 0
                ? `${loadingProgress.toLocaleString()} …`
                : t("toolbar.loading")}
            </span>
          )}
          {!loading && lastAutosave && (
            <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 10, opacity: 0.7 }}
              title={lastAutosave.toLocaleTimeString()}>
              {t("toolbar.autosaved", { time: lastAutosave.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 1 }}>{children}</div>;
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />;
}

function ToolBtn({
  children, title, onClick, disabled, accent,
}: {
  children:  React.ReactNode;
  title:     string;
  onClick?:  () => void;
  disabled?: boolean;
  accent?:   boolean;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28, height: 28, padding: 0,
        borderRadius: 5, border: "none", cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: accent
          ? hovered ? "var(--accent-hover, color-mix(in srgb, var(--accent) 85%, #000))" : "var(--accent)"
          : hovered && !disabled ? "var(--bg-hover)" : "transparent",
        opacity: disabled ? 0.35 : 1,
        color: accent ? "#fff" : "var(--text-2)",
        transition: "background 0.12s, opacity 0.12s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── SVG Icons — 3 jeux ────────────────────────────────────────────────────────

type IconProps = { set: IconSetId };

// ── Ouvrir dossier ────────────────────────────────────────────────────────────

function IconOpenFolder({ set }: IconProps) {
  if (set === "material") {
    // Material: dossier filled
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>
    );
  }
  if (set === "classic") {
    // Classic: dossier avec onglet et bord 3D
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="8" width="20" height="13" rx="1" fill="currentColor" fillOpacity="0.18"/>
        <rect x="2" y="8" width="20" height="13" rx="1"/>
        <path d="M2 8l2-4h7l2 4" fill="currentColor" fillOpacity="0.28"/>
        <path d="M2 8l2-4h7l2 4"/>
        <line x1="6" y1="13" x2="18" y2="13" strokeOpacity="0.45"/>
      </svg>
    );
  }
  // minimal (default)
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

// ── Ouvrir session ────────────────────────────────────────────────────────────

function IconOpenSession({ set }: IconProps) {
  if (set === "material") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-4 6l3 3 3-3h-2v-3h-2v3H8z"/>
      </svg>
    );
  }
  if (set === "classic") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="currentColor" fillOpacity="0.15"/>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <polyline points="9 15 12 18 15 15"/>
      </svg>
    );
  }
  // minimal
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <polyline points="9 15 12 18 15 15"/>
    </svg>
  );
}

// ── Sauvegarder ───────────────────────────────────────────────────────────────

function IconSave({ set }: IconProps) {
  if (set === "material") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
      </svg>
    );
  }
  if (set === "classic") {
    // Disquette 3½" style classique
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" fillOpacity="0.18"/>
        <rect x="3" y="3" width="18" height="18" rx="1"/>
        {/* label */}
        <rect x="6" y="3" width="12" height="8" rx="0.5" fill="currentColor" fillOpacity="0.3"/>
        <rect x="6" y="3" width="12" height="8" rx="0.5"/>
        {/* metal window */}
        <rect x="9" y="14" width="6" height="5" rx="0.5" fill="currentColor" fillOpacity="0.2"/>
        <rect x="9" y="14" width="6" height="5" rx="0.5"/>
        {/* write notch */}
        <rect x="13" y="4" width="3" height="6" rx="0.3" fill="currentColor" fillOpacity="0.5"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  );
}

// ── Exporter ──────────────────────────────────────────────────────────────────

function IconExport({ set }: IconProps) {
  if (set === "material") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    );
  }
  if (set === "classic") {
    // Classic-style box with downward arrow
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        {/* box */}
        <rect x="3" y="14" width="18" height="7" rx="1" fill="currentColor" fillOpacity="0.18"/>
        <rect x="3" y="14" width="18" height="7" rx="1"/>
        {/* downward arrow */}
        <line x1="12" y1="3" x2="12" y2="13" strokeWidth="1.6" strokeLinecap="round"/>
        <polyline points="8,9 12,14 16,9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function IconSettings({ set }: IconProps) {
  if (set === "material") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>
    );
  }
  if (set === "classic") {
    // Classic-style gear + wrench
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.2"/>
        <circle cx="12" cy="12" r="3.5"/>
        {/* dents d'engrenage */}
        <rect x="10.5" y="2"  width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
        <rect x="10.5" y="19" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
        <rect x="2"  y="10.5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
        <rect x="19" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.5"/>
        <rect x="4.5" y="4.5" width="2.5" height="2.5" rx="0.5" transform="rotate(45 5.75 5.75)" fill="currentColor" fillOpacity="0.4"/>
        <rect x="17" y="4.5" width="2.5" height="2.5" rx="0.5" transform="rotate(45 18.25 5.75)" fill="currentColor" fillOpacity="0.4"/>
        <rect x="4.5" y="17" width="2.5" height="2.5" rx="0.5" transform="rotate(45 5.75 18.25)" fill="currentColor" fillOpacity="0.4"/>
        <rect x="17" y="17" width="2.5" height="2.5" rx="0.5" transform="rotate(45 18.25 18.25)" fill="currentColor" fillOpacity="0.4"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function SpinSVG() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: "spin 1s linear infinite" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}
