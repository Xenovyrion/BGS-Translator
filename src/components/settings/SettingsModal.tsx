import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { appLogDir } from "@tauri-apps/api/path";
import { THEME_PRESETS } from "../../themes";
import type { ThemePreset } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../hooks/useSettings";
import type { ShortcutDef, KeyboardShortcuts } from "../../types";
import { DEFAULT_SHORTCUTS } from "../../types";

type Tab = "apparence" | "raccourcis" | "database" | "systeme";
type TabProps = { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void; onOpenThemeManager?: () => void; onResetLayout?: () => void };

// ── Modal principal ───────────────────────────────────────────────────────────

interface Props {
  settings:           AppSettings;
  onUpdate:           (updates: Partial<AppSettings>) => void;
  onClose:            () => void;
  onOpenThemeManager: () => void;
  onResetLayout?:     () => void;
}

export default function SettingsModal({ settings, onUpdate, onClose, onOpenThemeManager, onResetLayout }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("apparence");

  const TABS: Array<{ id: Tab; labelKey: string; icon: string }> = [
    { id: "apparence",  labelKey: "settings_modal.tab_appearance", icon: "✦" },
    { id: "raccourcis", labelKey: "settings_modal.tab_shortcuts",  icon: "⌨" },
    { id: "database",   labelKey: "settings_modal.tab_database",   icon: "▤" },
    { id: "systeme",    labelKey: "settings_modal.tab_system",     icon: "⚙" },
  ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Sync debug mode with the backend
  useEffect(() => {
    invoke("set_debug_mode_cmd", { enabled: settings.debugMode }).catch(() => {});
  }, [settings.debugMode]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-primary)",
          borderRadius: 12,
          width: 700,
          height: 680,
          display: "flex", flexDirection: "column",
          border: "1px solid var(--border)",
          boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "14px 20px 12px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, marginRight: 10, opacity: 0.7 }}>⚙</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", flex: 1 }}>{t("settings_modal.title")}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 18, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          padding: "0 16px",
          flexShrink: 0,
        }}>
          {TABS.map((tabDef) => (
            <button
              key={tabDef.id}
              onClick={() => setTab(tabDef.id)}
              style={{
                padding: "0 16px", height: 40,
                background: "none", border: "none",
                borderBottom: tab === tabDef.id ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === tabDef.id ? "var(--accent)" : "var(--text-2)",
                fontSize: 13, fontWeight: tab === tabDef.id ? 600 : 400,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                whiteSpace: "nowrap", transition: "color 0.15s",
              }}
            >
              <span style={{ fontSize: 12, opacity: tab === tabDef.id ? 1 : 0.7 }}>{tabDef.icon}</span>
              {t(tabDef.labelKey)}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {tab === "apparence"  && <AppearanceTab settings={settings} onUpdate={onUpdate} onOpenThemeManager={onOpenThemeManager} onResetLayout={onResetLayout} />}
          {tab === "raccourcis" && <ShortcutsTab  settings={settings} onUpdate={onUpdate} />}
          {tab === "database"   && <DatabaseTab   settings={settings} onUpdate={onUpdate} />}
          {tab === "systeme"    && <SystemeTab    settings={settings} onUpdate={onUpdate} />}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 10,
          padding: "12px 20px",
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
            {t("settings_modal.footer_hint")}
          </span>
          <button onClick={onClose} style={footerBtn(true)}>{t("settings_modal.close")}</button>
        </div>
      </div>
    </div>
  );
}

function footerBtn(primary: boolean): React.CSSProperties {
  return {
    padding: "8px 22px", borderRadius: 8, cursor: "pointer",
    fontSize: 13, fontWeight: 500,
    background: primary ? "var(--accent)" : "var(--bg-hover)",
    color: primary ? "#fff" : "var(--text-1)",
    border: primary ? "none" : "1px solid var(--border)",
  };
}

// ── Utility: open a local folder in the OS explorer ──────────────────────────
async function openFolder(dir: string) {
  if (!dir) return;
  // file:/// + slashes normalized for Windows and macOS
  const url = "file:///" + dir.replace(/\\/g, "/").replace(/^\//, "");
  await openUrl(url).catch(() => {});
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab({ settings, onUpdate, onOpenThemeManager, onResetLayout }: TabProps) {
  const { t } = useTranslation();
  const allThemes = [...THEME_PRESETS, ...(settings.customThemes ?? [])];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      <Section label={t("settings_modal.appearance.theme_section")}>
        {/* Theme manager button */}
        <button
          onClick={onOpenThemeManager}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "10px 14px", marginBottom: 14,
            background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 8,
            cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontSize: 16 }}>🎨</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{t("settings_modal.appearance.theme_manager")}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t("settings_modal.appearance.theme_manager_desc")}</div>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--accent)" }}>→</span>
        </button>

        {/* Quick grid */}
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{t("settings_modal.appearance.quick_select")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {allThemes.map((p) => (
            <ThemeCard
              key={p.id}
              preset={p}
              active={settings.themeId === p.id}
              onClick={() => onUpdate({ themeId: p.id, customThemeVars: {} })}
            />
          ))}
        </div>
      </Section>

      <Section label={t("settings_modal.appearance.alt_rows_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.appearance.alt_rows_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.appearance.alt_rows_on")}  active={settings.alternateRows !== false} onClick={() => onUpdate({ alternateRows: true  })} />
          <PillBtn label={t("settings_modal.appearance.alt_rows_off")} active={settings.alternateRows === false}  onClick={() => onUpdate({ alternateRows: false })} />
        </div>
      </Section>

      <Section label={t("settings_modal.appearance.interface_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.appearance.reset_layout_desc")}
        </p>
        <button
          onClick={() => { onResetLayout?.(); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px",
            background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 8,
            cursor: "pointer", color: "var(--text-1)", fontSize: 13, fontWeight: 500,
          }}
        >
          <span style={{ fontSize: 15, opacity: 0.8 }}>↺</span>
          {t("settings_modal.appearance.reset_layout_btn")}
        </button>
      </Section>
    </div>
  );
}

function ThemeCard({ preset, active, onClick }: { preset: ThemePreset; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const themeName = t(`theme.name.${preset.id}`, { defaultValue: preset.name });
  const menubar = preset.vars["--bg-menubar"]   ?? "#060a14";
  const bg      = preset.vars["--bg-primary"]   ?? "#08080f";
  const sidebar = preset.vars["--bg-sidebar"]   ?? "#0c1020";
  const accent  = preset.vars["--accent"]       ?? "#3b82f6";
  const text2   = preset.vars["--text-2"]       ?? "#94a3b8";
  const menuTxt = preset.vars["--menubar-text"] ?? "#5a7090";

  return (
    <button
      onClick={onClick}
      title={themeName}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: 0,
        border: active ? "2px solid var(--accent)" : "2px solid var(--border)",
        borderRadius: 10, cursor: "pointer", background: "none", overflow: "hidden",
        transition: "border-color 0.15s",
      }}
    >
      {/* Thumbnail preview */}
      <div style={{ width: "100%", height: 70, background: bg, display: "flex", flexDirection: "column" }}>
        {/* Simulated menubar */}
        <div style={{ height: 10, background: menubar, display: "flex", alignItems: "center", padding: "0 6px", gap: 4, flexShrink: 0 }}>
          <div style={{ width: 14, height: 4, borderRadius: 2, background: menuTxt, opacity: 0.6 }} />
          <div style={{ width: 14, height: 4, borderRadius: 2, background: menuTxt, opacity: 0.4 }} />
          <div style={{ width: 14, height: 4, borderRadius: 2, background: accent, opacity: 0.85 }} />
        </div>
        {/* Content + sidebar */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: 18, background: sidebar, borderRight: "1px solid rgba(0,0,0,0.3)", flexShrink: 0 }} />
          {/* Simulated table */}
          <div style={{ flex: 1, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: accent }} />
              <div style={{ width: "40%", height: 4, borderRadius: 2, background: text2, opacity: 0.5 }} />
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: text2, opacity: 0.35 }} />
              <div style={{ width: "45%", height: 4, borderRadius: 2, background: text2, opacity: 0.25 }} />
            </div>
          </div>
        </div>
        {/* Simulated status bar */}
        <div style={{ height: 8, background: menubar, flexShrink: 0 }} />
      </div>
      {/* Name */}
      <div style={{
        width: "100%", padding: "4px 6px 6px",
        background: "var(--bg-card)",
        fontSize: 10, fontWeight: active ? 700 : 400,
        color: active ? "var(--accent)" : "var(--text-2)", textAlign: "center",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}>
        {preset.isCustom && <span style={{ fontSize: 8, opacity: 0.7 }}>✎</span>}
        {themeName}
      </div>
    </button>
  );
}

// ── Shortcuts tab ─────────────────────────────────────────────────────────────

function formatShortcut(s: ShortcutDef): string {
  const parts: string[] = [];
  if (s.ctrl)  parts.push("Ctrl");
  if (s.alt)   parts.push("Alt");
  if (s.shift) parts.push("Shift");
  const labels: Record<string, string> = { ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→", Enter: "↵", Escape: "Esc", " ": "Espace" };
  parts.push(labels[s.key] ?? s.key.toUpperCase());
  return parts.join("+");
}

function ShortcutKeyInput({ value, onChange, pressKeyLabel }: { value: ShortcutDef; onChange: (s: ShortcutDef) => void; pressKeyLabel: string }) {
  const [recording, setRecording] = useState(false);
  return (
    <button
      tabIndex={0}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault(); e.stopPropagation();
        if (["Control","Meta","Alt","Shift"].includes(e.key)) return;
        onChange({ key: e.key, ctrl: e.ctrlKey || e.metaKey || undefined, alt: e.altKey || undefined, shift: e.shiftKey || undefined });
        setRecording(false);
      }}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      style={{
        padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
        minWidth: 120, textAlign: "center", fontFamily: "monospace", fontWeight: 600,
        background: recording ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
        color: recording ? "var(--accent)" : "var(--text-1)",
        border: recording ? "1px solid var(--accent)" : "1px solid var(--border)",
        outline: "none",
      }}
    >
      {recording ? pressKeyLabel : formatShortcut(value)}
    </button>
  );
}

function ShortcutsTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const sc = settings.shortcuts ?? DEFAULT_SHORTCUTS;

  const shortcutLabels: Record<keyof KeyboardShortcuts, string> = {
    nextEntry:        t("settings_modal.shortcuts.next_entry"),
    prevEntry:        t("settings_modal.shortcuts.prev_entry"),
    copyOriginal:     t("settings_modal.shortcuts.copy_original"),
    pasteTranslation: t("settings_modal.shortcuts.paste_translation"),
    validateEntry:    t("settings_modal.shortcuts.validate_entry"),
  };

  return (
    <Section label={t("settings_modal.shortcuts.section")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(Object.keys(shortcutLabels) as Array<keyof KeyboardShortcuts>).map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--text-2)", width: 220 }}>{shortcutLabels[k]}</span>
            <ShortcutKeyInput
              value={sc[k]}
              onChange={(def) => onUpdate({ shortcuts: { ...sc, [k]: def } })}
              pressKeyLabel={t("settings_modal.shortcuts.press_key")}
            />
            <button
              onClick={() => onUpdate({ shortcuts: { ...sc, [k]: DEFAULT_SHORTCUTS[k] } })}
              style={{ fontSize: 10, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              {t("settings_modal.shortcuts.reset_default")}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Database tab ──────────────────────────────────────────────────────────────

/** Guesses the game name from a .eet filename.
 *  E.g.: "BDD_Starfield_EN-FR" → "Starfield"
 *        "BDD_SkyrimSE_EN-FR"  → "Skyrim SE"
 *        "BDD_Morrowind_EN-FR" → "Morrowind"
 */
function guessGameName(stem: string): string {
  const SKIP_PREFIXES = new Set(["bdd", "db", "tdb", "base", "translation", "traduction"]);
  // Common ISO 639-1 language codes + language pairs
  const SKIP_LANG = /^([a-z]{2}(-[a-z]{2})?|en-fr|fr-en|de-en|en-de|es-en|it-en|pl-en|ru-en|pt-en)$/i;

  const parts = stem.split(/[_\-\s]+/);
  const filtered = parts.filter((p, i) => {
    if (p.length === 0) return false;
    if (i === 0 && SKIP_PREFIXES.has(p.toLowerCase())) return false;
    if (SKIP_LANG.test(p)) return false;
    return true;
  });

  if (filtered.length === 0) return "";

  // Insert a space before digits attached to letters (SkyrimSE → Skyrim SE)
  return filtered
    .map((w) => w.replace(/([a-zA-Z])([0-9])/g, "$1 $2").replace(/([0-9])([a-zA-Z])/g, "$1 $2"))
    .join(" ");
}

interface DbFileInfo { name: string; path: string; format: string; size: number; game: string }

function DatabaseTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [files, setFiles]           = useState<DbFileInfo[]>([]);
  const [defaultDir, setDefaultDir] = useState<string>("");
  const [converting, setConverting] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [exportFmt, setExportFmt]   = useState<"bgt" | "csv" | "tsv">("bgt");
  const [gameNames, setGameNames]   = useState<Record<string, string>>({});

  const activeDir = settings.dbFolder || defaultDir;

  const refresh = useCallback(async () => {
    try {
      const [dir, list] = await Promise.all([
        invoke<string>("get_databases_dir_cmd", { customDir: null }),
        invoke<DbFileInfo[]>("scan_databases_dir_cmd", { customDir: settings.dbFolder || null }),
      ]);
      setDefaultDir(dir);
      setFiles(list);
      setGameNames((prev) => {
        const next = { ...prev };
        for (const f of list) {
          if (f.format === "eet" && !next[f.path]) {
            const guess = guessGameName(f.name);
            if (guess) next[f.path] = guess;
          }
        }
        return next;
      });
    } catch (e) { setError(String(e)); }
  }, [settings.dbFolder]);

  useEffect(() => { refresh(); }, [refresh]);

  const bgtFiles = files.filter((f) => f.format === "bgt");
  const eetFiles = files.filter((f) => f.format === "eet");

  const pickDbFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: t("settings_modal.db.folder_pick_title") });
      if (dir && typeof dir === "string") onUpdate({ dbFolder: dir });
    } catch {}
  };

  const convertEet = async (file: DbFileInfo) => {
    setConverting(file.path); setError(null);
    try {
      await invoke<DbFileInfo>("convert_eet_cmd", {
        srcPath:  file.path,
        outDir:   settings.dbFolder || null,
        gameName: gameNames[file.path]?.trim() || null,
      });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setConverting(null); }
  };

  const exportDb = async () => {
    const ext  = exportFmt;
    const path = await save({ filters: [{ name: "Export BDD", extensions: [ext] }] });
    if (!path) return;
    try { await invoke("export_db_cmd", { path, format: ext }); }
    catch (e) { setError(String(e)); }
  };

  const openActiveDir = () => openFolder(settings.dbFolder || defaultDir);

  const fmt = (bytes: number) => bytes > 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} Mo`
    : `${(bytes / 1_000).toFixed(0)} Ko`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Database folder */}
      <Section label={t("settings_modal.db.folder_section")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={settings.dbFolder || activeDir}
            onChange={(e) => onUpdate({ dbFolder: e.target.value })}
            placeholder={defaultDir || t("settings_modal.db.folder_placeholder")}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 7, fontSize: 11,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", outline: "none", fontFamily: "monospace",
            }}
          />
          <button onClick={pickDbFolder} title={t("settings_modal.db.folder_pick_title")} style={iconBtn()}>📁</button>
          <button onClick={() => onUpdate({ dbFolder: "" })} title={t("settings_modal.db.folder_reset_title")} style={iconBtn()}>↺</button>
          <button onClick={openActiveDir} title={t("settings_modal.db.folder_open_explorer")} style={smallBtnStyle()}>{t("settings_modal.db.folder_open")}</button>
          <button onClick={refresh} title={t("settings_modal.db.folder_refresh_title")} style={smallBtnStyle()}>↻</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
          {t("settings_modal.db.folder_hint")}
        </p>
      </Section>

      {/* Available databases (read-only list + info) */}
      <Section label={t("settings_modal.db.main_section")}>
        {/* Auto-detection info */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", marginBottom: 10,
          background: "rgba(59,130,246,0.07)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.2)",
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>🎮</span>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            {t("settings_modal.db.auto_info")}
          </p>
        </div>

        {bgtFiles.length === 0 && eetFiles.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
            {t("settings_modal.db.no_bgt")}
          </p>
        )}
        {error && <div style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

        {bgtFiles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bgtFiles.map((f) => (
              <div key={f.path} style={{
                background: "var(--bg-hover)", borderRadius: 7, padding: "8px 12px",
                display: "flex", alignItems: "center", gap: 12, fontSize: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{f.name}</span>
                  {f.game && <span style={{ marginLeft: 8, color: "var(--accent)", fontSize: 11 }}>{f.game}</span>}
                </div>
                <span style={{ color: "var(--text-3)", fontSize: 11, flexShrink: 0 }}>{fmt(f.size)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* .eet conversion */}
      {eetFiles.length > 0 && (
        <Section label={t("settings_modal.db.eet_section")}>
          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>
            {t("settings_modal.db.eet_hint")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {eetFiles.map((f) => (
              <div key={f.path} style={{
                display: "flex", flexDirection: "column", gap: 6,
                background: "var(--bg-hover)", borderRadius: 7, padding: "8px 12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                    <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-3)" }}>{fmt(f.size)}</span>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="text"
                    value={gameNames[f.path] ?? ""}
                    onChange={(e) => setGameNames((prev) => ({ ...prev, [f.path]: e.target.value }))}
                    placeholder={t("settings_modal.db.eet_game_placeholder")}
                    style={{
                      flex: 1, padding: "5px 9px", borderRadius: 6, fontSize: 11,
                      background: "var(--bg-card)", color: "var(--text-1)",
                      border: "1px solid var(--border)", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => convertEet(f)}
                    disabled={converting === f.path}
                    style={btnStyle(converting === f.path ? "var(--bg-hover)" : "var(--accent)")}
                  >
                    {converting === f.path ? t("settings_modal.db.eet_converting") : t("settings_modal.db.eet_convert")}
                  </button>
                </div>
                {!gameNames[f.path]?.trim() && (
                  <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0, lineHeight: 1.4 }}>
                    {t("settings_modal.db.eet_game_hint")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Export the currently loaded DB */}
      <Section label={t("settings_modal.db.export_section")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={exportFmt}
            onChange={(e) => setExportFmt(e.target.value as "bgt" | "csv" | "tsv")}
            style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)" }}
          >
            <option value="bgt">{t("settings_modal.db.export_bgt")}</option>
            <option value="csv">{t("settings_modal.db.export_csv")}</option>
            <option value="tsv">{t("settings_modal.db.export_tsv")}</option>
          </select>
          <button onClick={exportDb} style={smallBtnStyle()}>{t("settings_modal.db.export_btn")}</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
          {t("settings_modal.db.export_hint")}
        </p>
      </Section>
    </div>
  );
}

// ── System tab ────────────────────────────────────────────────────────────────

function SystemeTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [logPath, setLogPath]           = useState<string>("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [copied, setCopied]             = useState(false);

  useEffect(() => {
    appLogDir()
      .then((dir) => {
        // Normalize path separator and ensure a trailing separator
        const normalized = dir.replace(/\\/g, "/").replace(/\/?$/, "/");
        setLogPath(normalized + "bgstranslator.log");
      })
      // Expected path on Windows if the API fails (should not happen)
      .catch(() => setLogPath("%APPDATA%\\io.github.bgstranslator\\logs\\bgstranslator.log"));
  }, []);

  const checkUpdate = async () => {
    setUpdateStatus(t("settings_modal.sys.checking"));
    try {
      const result = await invoke<{ version: string; notes?: string } | null>("check_update");
      setUpdateStatus(
        result
          ? t("settings_modal.sys.update_available", { version: result.version })
          : t("settings_modal.sys.up_to_date")
      );
    } catch (e) { setUpdateStatus(String(e)); }
  };

  const displayLogPath = settings.logFolder || logPath;
  const openLogs = () => {
    // Open the folder containing the log (strips the final filename)
    const dir = displayLogPath.replace(/[/\\][^/\\]+$/, "");
    openFolder(dir);
  };

  const copyLogPath = async () => {
    if (displayLogPath) {
      await navigator.clipboard.writeText(displayLogPath).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const pickLogFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: t("settings_modal.sys.log_pick_title") });
      if (dir && typeof dir === "string") {
        onUpdate({ logFolder: dir });
      }
    } catch {}
  };

  const handleReset = () => {
    if (!resetConfirm) { setResetConfirm(true); setTimeout(() => setResetConfirm(false), 3000); return; }
    onUpdate({ ...DEFAULT_SETTINGS });
    setResetConfirm(false);
  };

  const LANGUAGES = [
    { code: "fr", label: t("settings.lang_fr") },
    { code: "en", label: t("settings.lang_en") },
    { code: "es", label: t("settings.lang_es") },
    { code: "de", label: t("settings.lang_de") },
  ];

  const TARGET_LANGUAGES = [
    ["fr","Français"],["en","English"],["de","Deutsch"],["es","Español"],
    ["it","Italiano"],["pl","Polski"],["ru","Русский"],["zh","中文"],["ja","日本語"],["ko","한국어"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Interface language */}
      <Section label={t("settings_modal.sys.lang_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10 }}>{t("settings_modal.sys.lang_hint")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LANGUAGES.map(({ code, label }) => (
            <PillBtn key={code} label={label} active={(settings.language || "fr") === code} onClick={() => onUpdate({ language: code })} />
          ))}
        </div>
      </Section>

      {/* Translation target language */}
      <Section label={t("settings_modal.sys.target_section")}>
        <select
          value={settings.targetLanguage}
          onChange={(e) => onUpdate({ targetLanguage: e.target.value })}
          style={{ padding: "7px 12px", borderRadius: 7, fontSize: 13, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", cursor: "pointer" }}
        >
          {TARGET_LANGUAGES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Section>

      {/* Log file */}
      <Section label={t("settings_modal.sys.log_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.sys.log_hint")}
        </p>

        {/* Log path */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            type="text"
            value={displayLogPath}
            onChange={(e) => onUpdate({ logFolder: e.target.value })}
            placeholder={logPath || t("settings_modal.sys.log_placeholder")}
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 10,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", fontFamily: "monospace", outline: "none",
            }}
          />
          <button onClick={pickLogFolder} title={t("settings_modal.sys.log_pick_title")} style={iconBtn()}>📁</button>
          <button onClick={() => onUpdate({ logFolder: "" })} title={t("settings_modal.sys.log_reset_title")} style={iconBtn()}>↺</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={openLogs} style={smallBtnStyle()}>{t("settings_modal.sys.log_open_folder")}</button>
          <button
            onClick={copyLogPath}
            style={{ ...smallBtnStyle(), color: copied ? "var(--success)" : "var(--text-1)" }}
          >
            {copied ? t("settings_modal.sys.log_copied") : t("settings_modal.sys.log_copy")}
          </button>
        </div>
      </Section>

      {/* Debug mode */}
      <Section label={t("settings_modal.sys.debug_section")}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text-1)" }}>{t("settings_modal.sys.debug_standard_name")}</strong> — {t("settings_modal.sys.debug_standard_desc")}<br />
              <strong style={{ color: "var(--text-1)" }}>{t("settings_modal.sys.debug_debug_name")}</strong> — {t("settings_modal.sys.debug_debug_desc")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <PillBtn label={t("settings_modal.sys.debug_standard_btn")} active={!settings.debugMode} onClick={() => onUpdate({ debugMode: false })} />
              <PillBtn label={t("settings_modal.sys.debug_debug_btn")}    active={settings.debugMode}  onClick={() => onUpdate({ debugMode: true  })} />
            </div>
            {settings.debugMode && (
              <p style={{ fontSize: 11, color: "var(--warning)", marginTop: 8 }}>
                {t("settings_modal.sys.debug_warning")}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Autosave */}
      <Section label={t("settings_modal.sys.autosave_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.sys.autosave_hint")}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { value: 0,  label: t("settings_modal.sys.autosave_disabled") },
            { value: 5,  label: t("settings_modal.sys.autosave_5min")     },
            { value: 10, label: t("settings_modal.sys.autosave_10min")    },
            { value: 15, label: t("settings_modal.sys.autosave_15min")    },
            { value: 30, label: t("settings_modal.sys.autosave_30min")    },
            { value: 60, label: t("settings_modal.sys.autosave_1h")       },
          ].map(({ value, label }) => (
            <PillBtn
              key={value}
              label={label}
              active={(settings.autosaveInterval ?? 0) === value}
              onClick={() => onUpdate({ autosaveInterval: value })}
            />
          ))}
        </div>
      </Section>

      {/* Updates */}
      <Section label={t("settings_modal.sys.update_section")}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={checkUpdate} style={btnStyle("var(--accent)")}>{t("settings_modal.sys.check_updates_btn")}</button>
          {updateStatus && <span style={{ fontSize: 12, color: "var(--text-2)" }}>{updateStatus}</span>}
        </div>
      </Section>

      {/* Reset */}
      <Section label={t("settings_modal.sys.reset_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.sys.reset_hint")}
        </p>
        <button
          onClick={handleReset}
          style={{
            padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500,
            background: resetConfirm ? "var(--danger)" : "var(--bg-hover)",
            color: resetConfirm ? "#fff" : "var(--danger)",
            border: `1px solid ${resetConfirm ? "var(--danger)" : "var(--border)"}`,
            transition: "all 0.2s",
          }}
        >
          {resetConfirm ? t("settings_modal.sys.reset_confirm") : t("settings_modal.sys.reset_btn")}
        </button>
      </Section>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function btnStyle(bg: string, outline = false): React.CSSProperties {
  return {
    padding: "7px 16px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500,
    background: bg, color: outline ? "var(--text-1)" : "#fff",
    border: outline ? "1px solid var(--border)" : "none", flexShrink: 0,
  };
}

function smallBtnStyle(): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 500,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)",
  };
}

function iconBtn(): React.CSSProperties {
  return {
    padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", flexShrink: 0, lineHeight: 1,
  };
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PillBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 18px", borderRadius: 7, cursor: "pointer",
        border: active ? "2px solid var(--accent)" : "2px solid var(--border)",
        background: active ? "var(--accent-dim)" : "var(--bg-card)",
        color: active ? "var(--accent)" : "var(--text-1)",
        fontSize: 13, fontWeight: active ? 600 : 400, transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}
