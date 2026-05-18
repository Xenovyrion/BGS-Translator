// ── Toolbar with icons ────────────────────────────────────────────────────────
import React from "react";
import { useTranslation } from "react-i18next";
import { IconFolder, IconSession, IconSave, IconExport, IconSettings, IconSpinner } from "../../icons";
import type { IconSetId } from "../../themes";

const STATUS_LABELS: Record<string, string> = {
  loading_strings:  "Extraction des strings…",
  parsing_records:  "Lecture des enregistrements…",
};

interface Props {
  pluginName:       string | null;
  loading?:         boolean;
  loadingProgress?: number | null;
  loadingStatus?:   string | null;
  onOpenPlugin:     () => void;
  onOpenSession:    () => void;
  onSave?:          () => void;
  onExport?:        () => void;
  onSettings:       () => void;
  iconSet?:         IconSetId;
  lastAutosave?:    Date | null;
}

export default function ToolBar({ pluginName, loading, loadingProgress, loadingStatus, onOpenPlugin, onOpenSession, onSave, onExport, onSettings, iconSet = "minimal", lastAutosave }: Props) {
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
      {/* ── Groupe Ouvrir ──────────────────────── */}
      <ToolGroup>
        <ToolBtn
          title={openTitle}
          onClick={onOpenPlugin}
          disabled={loading}
          accent={!pluginName && !loading}
        >
          <IconFolder set={iconSet} />
        </ToolBtn>

        <ToolBtn
          title={t("toolbar.open_session")}
          onClick={onOpenSession}
          disabled={loading}
        >
          <IconSession set={iconSet} />
        </ToolBtn>
      </ToolGroup>

      <Divider />

      {/* ── Sauvegarder ────────────────────────── */}
      <ToolGroup>
        <ToolBtn
          title={t("toolbar.save_session")}
          onClick={onSave}
          disabled={!pluginName || !onSave}
        >
          <IconSave set={iconSet} />
        </ToolBtn>
      </ToolGroup>

      <Divider />

      {/* ── Générer fichier traduit ─────────────── */}
      <ToolGroup>
        <ToolBtn
          title={t("toolbar.export_plugin")}
          onClick={onExport}
          disabled={!pluginName || !onExport}
          accent={!!pluginName && !!onExport}
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

      {/* ── Fichier ouvert / indicateur de chargement ─── */}
      {(pluginName || loading) && (
        <>
          <Divider />
          {pluginName && (
            <span style={{
              fontSize: 11, color: "var(--text-3)", fontFamily: "monospace",
              paddingLeft: 6,
              maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={pluginName}>
              {pluginName}
            </span>
          )}
          {loading && (
            <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <IconSpinner size={11} />
              {loadingProgress != null && loadingProgress > 0
                ? `${loadingProgress.toLocaleString()} …`
                : loadingStatus
                  ? (STATUS_LABELS[loadingStatus] ?? loadingStatus)
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
