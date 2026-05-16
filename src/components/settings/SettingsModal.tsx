import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { THEME_PRESETS } from "../../themes";
import type { ThemePreset } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../hooks/useSettings";
import type { ShortcutDef, KeyboardShortcuts, EditPanelShortcuts } from "../../types";
import { DEFAULT_SHORTCUTS, DEFAULT_EDIT_SHORTCUTS, DEFAULT_FUZZY_SETTINGS } from "../../types";
import {
  IconSettings, IconClose, IconFolder,
  IconReplace, IconCheck, IconDatabase, IconSort, IconRefresh, IconSearch,
} from "../../icons";
import type { ReactNode } from "react";

type Tab = "apparence" | "raccourcis" | "orthographe" | "database" | "divers" | "api" | "systeme";
type TabProps = { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void; onOpenThemeManager?: () => void; onResetLayout?: () => void; defaultExportDir?: string };

// ── Modal principal ───────────────────────────────────────────────────────────

interface Props {
  settings:           AppSettings;
  onUpdate:           (updates: Partial<AppSettings>) => void;
  onClose:            () => void;
  onOpenThemeManager: () => void;
  onResetLayout?:     () => void;
  defaultExportDir?:  string;
}

export default function SettingsModal({ settings, onUpdate, onClose, onOpenThemeManager, onResetLayout, defaultExportDir = "" }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("apparence");

  const TABS: Array<{ id: Tab; labelKey: string; icon: ReactNode }> = [
    { id: "apparence",   labelKey: "settings_modal.tab_appearance",   icon: <IconSearch size={13} /> },
    { id: "raccourcis",  labelKey: "settings_modal.tab_shortcuts",    icon: <IconSort size={13} /> },
    { id: "orthographe", labelKey: "settings_modal.tab_spellcheck",   icon: <IconCheck size={13} /> },
    { id: "database",    labelKey: "settings_modal.tab_database",     icon: <IconDatabase size={13} /> },
    { id: "divers",      labelKey: "settings_modal.tab_misc",         icon: <IconRefresh size={13} /> },
    { id: "api",         labelKey: "settings_modal.tab_api",          icon: <IconReplace size={13} /> },
    { id: "systeme",     labelKey: "settings_modal.tab_system",       icon: <IconSettings size={13} /> },
  ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
          width: 860,
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
          <span style={{ marginRight: 10, opacity: 0.7, display: "flex", alignItems: "center" }}><IconSettings size={16} /></span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", flex: 1 }}>{t("settings_modal.title")}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 0, display: "flex", alignItems: "center" }}
          >
            <IconClose size={18} />
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
                padding: "0 12px", height: 40,
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
          {tab === "apparence"   && <AppearanceTab   settings={settings} onUpdate={onUpdate} onOpenThemeManager={onOpenThemeManager} onResetLayout={onResetLayout} />}
          {tab === "raccourcis"  && <ShortcutsTab   settings={settings} onUpdate={onUpdate} />}
          {tab === "orthographe" && <SpellCheckTab  settings={settings} onUpdate={onUpdate} />}
          {tab === "database"    && <DatabaseTab    settings={settings} onUpdate={onUpdate} />}
          {tab === "divers"      && <DiversTab      settings={settings} onUpdate={onUpdate} defaultExportDir={defaultExportDir} />}
          {tab === "api"         && <ApiTab         settings={settings} onUpdate={onUpdate} />}
          {tab === "systeme"     && <SystemeTab     settings={settings} onUpdate={onUpdate} />}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
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
  // openPath is the most reliable cross-platform way to open a folder
  await openPath(dir).catch(async () => {
    const url = "file:///" + dir.replace(/\\/g, "/").replace(/^\//, "");
    await openUrl(url).catch(() => {});
  });
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab({ settings, onUpdate, onOpenThemeManager, onResetLayout }: TabProps) {
  const { t } = useTranslation();
  const allThemes = [...THEME_PRESETS, ...(settings.customThemes ?? [])];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      <Section first label={t("settings_modal.appearance.theme_section")}>
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

      <Section label={t("settings_modal.appearance.row_hover_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.appearance.row_hover_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.appearance.row_hover_on")}  active={settings.rowHover !== false} onClick={() => onUpdate({ rowHover: true  })} />
          <PillBtn label={t("settings_modal.appearance.row_hover_off")} active={settings.rowHover === false}  onClick={() => onUpdate({ rowHover: false })} />
        </div>
      </Section>

      <Section label={t("settings_modal.appearance.interface_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.appearance.reset_layout_desc")}
        </p>
        <button
          onClick={() => { onResetLayout?.(); }}
          style={{ ...smallBtnStyle(), gap: 7, color: "var(--danger)", borderColor: "var(--border)" }}
        >
          <span style={{ fontSize: 14 }}>↺</span>
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
        height: 32, padding: "0 12px", borderRadius: 7,
        cursor: "pointer", fontSize: 12, boxSizing: "border-box",
        minWidth: 120, textAlign: "center", fontFamily: "monospace", fontWeight: 600,
        background: recording ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
        color: recording ? "var(--accent)" : "var(--text-1)",
        border: recording ? "1px solid var(--accent)" : "1px solid var(--border)",
        outline: "none", display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {recording ? pressKeyLabel : formatShortcut(value)}
    </button>
  );
}

function ShortcutRow({ label, value, onChangeDef, onReset, pressKeyLabel, resetLabel }: {
  label: string; value: ShortcutDef; onChangeDef: (d: ShortcutDef) => void;
  onReset: () => void; pressKeyLabel: string; resetLabel: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 220 }}>{label}</span>
      <ShortcutKeyInput value={value} onChange={onChangeDef} pressKeyLabel={pressKeyLabel} />
      <button onClick={onReset} style={{
        height: 32, padding: "0 12px", borderRadius: 7, cursor: "pointer",
        fontSize: 12, fontWeight: 400, flexShrink: 0,
        background: "var(--bg-hover)", color: "var(--danger)",
        border: "1px solid var(--border)", boxSizing: "border-box",
        display: "inline-flex", alignItems: "center",
      }}>
        {resetLabel}
      </button>
    </div>
  );
}

/** Read-only row for non-configurable mouse interactions */
function HintRow({ label, badge }: { label: string; badge: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 220 }}>{label}</span>
      <span style={{
        height: 32, padding: "0 12px", borderRadius: 7, fontSize: 12, boxSizing: "border-box",
        minWidth: 120, textAlign: "center", fontFamily: "monospace", fontWeight: 600,
        background: "var(--bg-hover)", color: "var(--text-3)",
        border: "1px solid var(--border)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        userSelect: "none",
      }}>
        {badge}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-3)", fontStyle: "italic" }}>
        🔒
      </span>
    </div>
  );
}

function ShortcutsTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const sc  = { ...DEFAULT_SHORTCUTS,       ...(settings.shortcuts      ?? {}) };
  const esc = { ...DEFAULT_EDIT_SHORTCUTS, ...(settings.editShortcuts  ?? {}) };

  const shortcutLabels: Record<keyof KeyboardShortcuts, string> = {
    nextEntry:        t("settings_modal.shortcuts.next_entry"),
    prevEntry:        t("settings_modal.shortcuts.prev_entry"),
    copyOriginal:     t("settings_modal.shortcuts.copy_original"),
    pasteTranslation: t("settings_modal.shortcuts.paste_translation"),
    validateEntry:    t("settings_modal.shortcuts.validate_entry"),
    globalFind:       t("settings_modal.shortcuts.global_find"),
  };

  const editShortcutLabels: Record<keyof EditPanelShortcuts, string> = {
    find:        t("settings_modal.edit_shortcuts.find"),
    replace:     t("settings_modal.edit_shortcuts.replace"),
    opTrim:      t("settings_modal.edit_shortcuts.op_trim"),
    opUpper:     t("settings_modal.edit_shortcuts.op_upper"),
    opLower:     t("settings_modal.edit_shortcuts.op_lower"),
    opStripTags: t("settings_modal.edit_shortcuts.op_strip_tags"),
  };

  const pressKey   = t("settings_modal.shortcuts.press_key");
  const resetLabel = t("settings_modal.shortcuts.reset_default");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Section first label={t("settings_modal.shortcuts.section")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(Object.keys(shortcutLabels) as Array<keyof KeyboardShortcuts>).map((k) => (
            <ShortcutRow
              key={k}
              label={shortcutLabels[k]}
              value={sc[k]}
              onChangeDef={(def) => onUpdate({ shortcuts: { ...sc, [k]: def } })}
              onReset={() => onUpdate({ shortcuts: { ...sc, [k]: DEFAULT_SHORTCUTS[k] } })}
              pressKeyLabel={pressKey}
              resetLabel={resetLabel}
            />
          ))}
        </div>
      </Section>
      <Section label={t("settings_modal.edit_shortcuts.section")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(Object.keys(editShortcutLabels) as Array<keyof EditPanelShortcuts>).map((k) => (
            <ShortcutRow
              key={k}
              label={editShortcutLabels[k]}
              value={esc[k]}
              onChangeDef={(def) => onUpdate({ editShortcuts: { ...esc, [k]: def } })}
              onReset={() => onUpdate({ editShortcuts: { ...esc, [k]: DEFAULT_EDIT_SHORTCUTS[k] } })}
              pressKeyLabel={pressKey}
              resetLabel={resetLabel}
            />
          ))}
        </div>
      </Section>

      {/* ── Multi-selection (read-only reference) ── */}
      <Section label={t("settings_modal.selection.section")}>
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 10px" }}>
          {t("settings_modal.selection.hint")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <HintRow label={t("settings_modal.selection.single_click")}   badge="Clic" />
          <HintRow label={t("settings_modal.selection.ctrl_click")}     badge="Ctrl + Clic" />
          <HintRow label={t("settings_modal.selection.shift_click")}    badge="Shift + Clic" />
          <HintRow label={t("settings_modal.selection.select_all_action")} badge={t("settings_modal.selection.select_all_badge")} />
        </div>
      </Section>
    </div>
  );
}

// ── Spell check tab ───────────────────────────────────────────────────────────

interface DictionaryInfo { lang: string; name: string; installed: boolean; }

function SpellCheckTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [dicts,       setDicts]       = useState<DictionaryInfo[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAll,     setShowAll]     = useState(false);

  const loadDicts = useCallback(async () => {
    try { setDicts(await invoke<DictionaryInfo[]>("list_dictionaries_cmd")); } catch {}
  }, []);

  useEffect(() => { loadDicts(); }, [loadDicts]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const download = async (lang: string) => {
    setDownloading(lang);
    try {
      await invoke("download_dictionary_cmd", { lang });
      showToast(t("spellcheck.download_ok", { lang }));
      await loadDicts();
      if (!settings.spellLang) onUpdate({ spellLang: lang });
    } catch (e) {
      showToast(t("spellcheck.download_error", { error: String(e) }), false);
    } finally { setDownloading(null); }
  };

  const deleteDic = async (lang: string) => {
    setDeleting(lang);
    try {
      await invoke("delete_dictionary_cmd", { lang });
      showToast(t("spellcheck.delete_ok", { lang }));
      await loadDicts();
      if (settings.spellLang === lang) onUpdate({ spellLang: "" });
    } catch (e) {
      showToast(String(e), false);
    } finally { setDeleting(null); }
  };

  const [dictSearch, setDictSearch] = useState("");

  const installed = dicts.filter(d => d.installed);
  const available = dicts.filter(d => !d.installed);
  const filteredAvailable = dictSearch.trim()
    ? available.filter(d =>
        d.name.toLowerCase().includes(dictSearch.toLowerCase()) ||
        d.lang.toLowerCase().includes(dictSearch.toLowerCase())
      )
    : available;
  const visibleAvailable = showAll || dictSearch.trim() ? filteredAvailable : filteredAvailable.slice(0, 10);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Active dictionary */}
      <Section first label={t("spellcheck.section_title")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
          {t("spellcheck.section_desc")}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", minWidth: 130 }}>
            {t("spellcheck.dictionary_label")}
          </span>
          <select
            value={settings.spellLang ?? ""}
            onChange={e => onUpdate({ spellLang: e.target.value })}
            style={{
              flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 12,
              background: "var(--bg-hover)", color: "var(--text-1)",
              border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            <option value="">{t("spellcheck.no_dictionary")}</option>
            {installed.map(d => (
              <option key={d.lang} value={d.lang}>{d.name} ({d.lang})</option>
            ))}
          </select>
        </div>
      </Section>

      {/* Real-time options */}
      <Section label={t("spellcheck.realtime_section")}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={settings.spellRealtime ?? false}
            onChange={e => onUpdate({ spellRealtime: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
          />
          <div>
            <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>
              {t("spellcheck.realtime_label")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              {t("spellcheck.realtime_desc")}
            </div>
          </div>
        </label>

        {settings.spellRealtime && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 24 }}>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{t("spellcheck.debounce_label")}</span>
            <input
              type="range" min={200} max={2000} step={100}
              value={settings.spellDebounce ?? 600}
              onChange={e => onUpdate({ spellDebounce: Number(e.target.value) })}
              style={{ width: 160, accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 50 }}>
              {settings.spellDebounce ?? 600} ms
            </span>
          </div>
        )}
      </Section>

      {/* Installed dictionaries */}
      <Section label={t("spellcheck.manage_installed")}>
        {installed.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
            {t("spellcheck.none_installed")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {installed.map(d => (
              <div key={d.lang} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--bg-hover)", borderRadius: 7, padding: "8px 12px",
                border: settings.spellLang === d.lang ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)" }}>
                  {d.name}
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-3)" }}>({d.lang})</span>
                  {settings.spellLang === d.lang && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                      ★ {t("spellcheck.active_badge")}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => deleteDic(d.lang)}
                  disabled={deleting === d.lang}
                  style={{
                    height: 32, padding: "0 12px", borderRadius: 7, fontSize: 12,
                    boxSizing: "border-box", cursor: "pointer",
                    border: "1px solid #ef4444", background: "transparent",
                    color: "#ef4444", opacity: deleting === d.lang ? 0.5 : 1,
                    display: "inline-flex", alignItems: "center", flexShrink: 0,
                  }}
                >
                  {deleting === d.lang ? "…" : t("spellcheck.btn_delete")}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Available dictionaries */}
      <Section label={
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <span style={{ flex: 1 }}>{t("spellcheck.manage_available")}</span>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type="text"
              value={dictSearch}
              onChange={e => { setDictSearch(e.target.value); setShowAll(false); }}
              placeholder={t("spellcheck.search_placeholder")}
              style={{
                height: 26, padding: dictSearch ? "0 24px 0 10px" : "0 10px",
                borderRadius: 6, fontSize: 11,
                background: "var(--bg-hover)", color: "var(--text-1)",
                border: "1px solid var(--border)", outline: "none", width: 160,
              }}
            />
            {dictSearch && (
              <button
                onClick={() => { setDictSearch(""); setShowAll(false); }}
                style={{
                  position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-3)", fontSize: 14, lineHeight: 1, padding: 0,
                }}
                title="Effacer"
              >
                ×
              </button>
            )}
          </div>
        </div>
      }>
        {filteredAvailable.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
            {t("spellcheck.search_no_results")}
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {visibleAvailable.map(d => (
            <div key={d.lang} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 10px", borderRadius: 6,
              background: "var(--bg-hover)",
            }}>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-2)" }}>
                {d.name}
                <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)" }}>({d.lang})</span>
              </span>
              <button
                onClick={() => download(d.lang)}
                disabled={downloading === d.lang}
                style={{
                  height: 32, padding: "0 12px", borderRadius: 7, fontSize: 12,
                  boxSizing: "border-box", cursor: "pointer",
                  border: "1px solid var(--accent)", background: "transparent",
                  color: "var(--accent)", opacity: downloading === d.lang ? 0.5 : 1,
                  display: "inline-flex", alignItems: "center", flexShrink: 0,
                }}
              >
                {downloading === d.lang ? t("spellcheck.downloading") : t("spellcheck.btn_download")}
              </button>
            </div>
          ))}
        </div>
        {!dictSearch.trim() && filteredAvailable.length > 10 && (
          <button
            onClick={() => setShowAll(v => !v)}
            style={{
              marginTop: 8, fontSize: 12, color: "var(--accent)", background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}
          >
            {showAll
              ? t("spellcheck.show_less")
              : t("spellcheck.show_more", { count: filteredAvailable.length - 10 })}
          </button>
        )}
      </Section>

      {/* Toast */}
      {toast && (
        <div style={{
          fontSize: 12, padding: "8px 14px", borderRadius: 7,
          background: toast.ok ? "var(--bg-hover)" : "rgba(239,68,68,0.12)",
          color: toast.ok ? "var(--text-1)" : "#ef4444",
          border: `1px solid ${toast.ok ? "var(--border)" : "#ef4444"}`,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
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

interface DbFileInfo { name: string; path: string; format: string; size: number; game: string; lang_from: string; lang_to: string }
interface DefaultForm { path: string; game: string; srcLang: string; dstLang: string }
interface PersonalFileInfo { name: string; path: string; size: number; game: string; lang_from: string; lang_to: string; entry_count: number }
interface CreatePersonalForm { name: string; game: string; srcLang: string; dstLang: string; saving: boolean; error: string }

const LANG_OPTIONS = [
  ["fr","Français"],["en","English"],["de","Deutsch"],["es","Español"],
  ["it","Italiano"],["pl","Polski"],["ru","Русский"],["zh","中文"],["ja","日本語"],["ko","한국어"],
];

const KNOWN_GAMES = [
  "Starfield","Skyrim SE","Skyrim","Oblivion","Morrowind",
  "Fallout 4","Fallout 76","Fallout: New Vegas","Fallout 3","Enderal",
];

function DatabaseTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [files, setFiles]           = useState<DbFileInfo[]>([]);
  const [defaultDir, setDefaultDir] = useState<string>("");
  const [converting, setConverting] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState<boolean>(false);
  const [gameNames, setGameNames]   = useState<Record<string, string>>({});
  const [defForm, setDefForm]       = useState<DefaultForm | null>(null);

  // ── Personal DB state ──────────────────────────────────────────────────────
  const [personalFiles, setPersonalFiles]       = useState<PersonalFileInfo[]>([]);
  const [personalDir, setPersonalDir]           = useState<string>("");
  const [personalLoading, setPersonalLoading]   = useState(false);
  const [createForm, setCreateForm]             = useState<CreatePersonalForm | null>(null);
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null);

  const activeDir = settings.dbFolder || defaultDir;

  const refresh = useCallback(async () => {
    setLoading(true);
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
    finally { setLoading(false); }
  }, [settings.dbFolder]);

  const refreshPersonal = useCallback(async () => {
    setPersonalLoading(true);
    try {
      const [dir, list] = await Promise.all([
        invoke<string>("get_personal_dbs_dir_cmd", { customDir: settings.personalDbFolder || null }),
        invoke<PersonalFileInfo[]>("scan_personal_dbs_cmd", { customDir: settings.personalDbFolder || null }),
      ]);
      setPersonalDir(dir);
      setPersonalFiles(list);
    } catch { /* ignore */ }
    finally { setPersonalLoading(false); }
  }, [settings.personalDbFolder]);

  useEffect(() => { refresh(); refreshPersonal(); }, [refresh, refreshPersonal]);

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

  const openActiveDir        = () => openFolder(settings.dbFolder || defaultDir);
  const openPersonalDir      = () => openFolder(settings.personalDbFolder || personalDir);
  const pickPersonalDbFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: t("settings_modal.personal_db.folder_pick_title") });
      if (dir && typeof dir === "string") onUpdate({ personalDbFolder: dir });
    } catch {}
  };

  const submitCreatePersonal = async () => {
    if (!createForm || !createForm.name.trim() || createForm.saving) return;
    setCreateForm(f => f ? { ...f, saving: true, error: "" } : f);
    try {
      await invoke("create_personal_db_cmd", {
        name:      createForm.name.trim(),
        game:      createForm.game,
        langFrom:  createForm.srcLang,
        langTo:    createForm.dstLang,
        customDir: settings.personalDbFolder || null,
      });
      await refreshPersonal();
      setCreateForm(null);
    } catch (e) {
      setCreateForm(f => f ? { ...f, saving: false, error: String(e) } : f);
    }
  };

  const fmt = (bytes: number) => bytes > 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} Mo`
    : `${(bytes / 1_000).toFixed(0)} Ko`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Database folder */}
      <Section first label={t("settings_modal.db.folder_section")}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={settings.dbFolder || activeDir}
            onChange={(e) => onUpdate({ dbFolder: e.target.value })}
            placeholder={defaultDir || t("settings_modal.db.folder_placeholder")}
            style={{
              flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 11,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", outline: "none", fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
          <button onClick={pickDbFolder} title={t("settings_modal.db.folder_pick_title")} style={iconBtn()}><IconFolder size={14} /></button>
          <button onClick={() => onUpdate({ dbFolder: "" })} title={t("settings_modal.db.folder_reset_title")} style={iconBtn()}>↺</button>
          <button onClick={openActiveDir} title={t("settings_modal.db.folder_open_explorer")} style={smallBtnStyle()}>{t("settings_modal.db.folder_open")}</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
          {t("settings_modal.db.folder_hint")}
        </p>
        {error && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>{error}</div>}
      </Section>

      {/* BGT databases list */}
      <Section label={
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ flex: 1 }}>{t("settings_modal.db.bgt_section")}</span>
          <button onClick={refresh} disabled={loading} title={t("settings_modal.db.folder_refresh_title")}
            style={{ ...smallBtnStyle(), padding: "3px 9px", fontSize: 12, fontWeight: 600 }}>
            {loading ? "…" : "↻"}
          </button>
        </div>
      }>
        {files.filter(f => f.format === "bgt").length === 0 && !loading && (
          <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
            {t("settings_modal.db.no_bgt")}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.filter(f => f.format === "bgt").map((f) => {
            const isDefault = Object.values(settings.defaultDbs ?? {}).some(d => d.path === f.path);
            const isEditing = defForm?.path === f.path;
            return (
              <div key={f.path} style={{
                background: "var(--bg-hover)", borderRadius: 8, padding: "10px 12px",
                border: isDefault ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
                {/* File info row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-1)" }}>{f.name}</span>
                    {f.game && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)" }}>{f.game}</span>
                    )}
                    {(f.lang_from || f.lang_to) && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-3)" }}>
                        {f.lang_from.toUpperCase()} → {f.lang_to.toUpperCase()}
                      </span>
                    )}
                    {isDefault && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--accent)", opacity: 0.8 }}>
                        ★ {t("settings_modal.db.default_badge")}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>{fmt(f.size)}</span>
                  <button
                    onClick={() => {
                      if (isEditing) { setDefForm(null); return; }
                      setDefForm({ path: f.path, game: f.game || "", srcLang: f.lang_from || "en", dstLang: f.lang_to || "fr" });
                    }}
                    style={{ ...smallBtnStyle(), background: "transparent", color: "var(--accent)", borderColor: "var(--accent)" }}
                  >
                    {isEditing ? t("settings_modal.db.default_cancel") : t("settings_modal.db.default_edit")}
                  </button>
                </div>

                {/* Inline default DB form */}
                {isEditing && defForm && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 140px", minWidth: 120 }}>
                        <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                          {t("settings_modal.db.default_game")}
                        </label>
                        <select
                          value={defForm.game}
                          onChange={(e) => setDefForm(f => f ? { ...f, game: e.target.value } : f)}
                          style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}
                        >
                          <option value="">— {t("settings_modal.db.default_game")} —</option>
                          {KNOWN_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                          {t("settings_modal.db.default_src")}
                        </label>
                        <select value={defForm.srcLang} onChange={(e) => setDefForm(f => f ? { ...f, srcLang: e.target.value } : f)}
                          style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
                          {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                          {t("settings_modal.db.default_dst")}
                        </label>
                        <select value={defForm.dstLang} onChange={(e) => setDefForm(f => f ? { ...f, dstLang: e.target.value } : f)}
                          style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
                          {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => {
                          if (!defForm.game.trim()) return;
                          const key = defForm.game.trim().toLowerCase();
                          onUpdate({ defaultDbs: { ...(settings.defaultDbs ?? {}), [key]: { path: defForm.path, game: defForm.game.trim(), srcLang: defForm.srcLang, dstLang: defForm.dstLang } } });
                          setDefForm(null);
                        }}
                        style={btnStyle("var(--accent)")}
                      >
                        {t("settings_modal.db.default_confirm")}
                      </button>
                      {isDefault && (
                        <button
                          onClick={() => {
                            const next = { ...(settings.defaultDbs ?? {}) };
                            const key = Object.entries(next).find(([, v]) => v.path === f.path)?.[0];
                            if (key) delete next[key];
                            onUpdate({ defaultDbs: next });
                            setDefForm(null);
                          }}
                          style={{ ...smallBtnStyle(), color: "var(--danger)", borderColor: "var(--danger)" }}
                        >
                          {t("settings_modal.db.default_remove")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

      {/* DB apply behavior */}
      <Section label={t("settings_modal.db.apply_validates_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.db.apply_validates_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.db.apply_validates_on")}  active={settings.dbApplyValidates !== false} onClick={() => onUpdate({ dbApplyValidates: true  })} />
          <PillBtn label={t("settings_modal.db.apply_validates_off")} active={settings.dbApplyValidates === false}  onClick={() => onUpdate({ dbApplyValidates: false })} />
        </div>
      </Section>

      {/* ── BDD Personnelle ─────────────────────────────────────────────── */}
      <Section label={
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ flex: 1 }}>{t("settings_modal.personal_db.section")}</span>
          <button
            onClick={refreshPersonal}
            disabled={personalLoading}
            title={t("settings_modal.personal_db.refresh_title")}
            style={{ ...smallBtnStyle(), padding: "3px 9px", fontSize: 12, fontWeight: 600 }}
          >
            {personalLoading ? "…" : "↻"}
          </button>
        </div>
      }>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
          {t("settings_modal.personal_db.section_desc")}
        </p>

        {/* Personal DB folder */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            type="text"
            value={settings.personalDbFolder || personalDir}
            onChange={(e) => onUpdate({ personalDbFolder: e.target.value })}
            placeholder={personalDir || t("settings_modal.personal_db.folder_placeholder")}
            style={{
              flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 11,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", outline: "none", fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
          <button onClick={pickPersonalDbFolder} title={t("settings_modal.personal_db.folder_pick_title")} style={iconBtn()}><IconFolder size={14} /></button>
          <button onClick={() => onUpdate({ personalDbFolder: "" })} title={t("settings_modal.db.folder_reset_title")} style={iconBtn()}>↺</button>
          <button onClick={openPersonalDir} style={smallBtnStyle()}>{t("settings_modal.db.folder_open")}</button>
        </div>

        {/* Auto-apply toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>
            {t("settings_modal.personal_db.auto_apply_label")}
          </span>
          <PillBtn
            label={t("settings_modal.personal_db.auto_apply_on")}
            active={settings.personalDbAutoApply !== false}
            onClick={() => onUpdate({ personalDbAutoApply: true })}
          />
          <PillBtn
            label={t("settings_modal.personal_db.auto_apply_off")}
            active={settings.personalDbAutoApply === false}
            onClick={() => onUpdate({ personalDbAutoApply: false })}
          />
        </div>

        {/* List of .bgtx files */}
        {personalFiles.length === 0 && !personalLoading && (
          <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", marginBottom: 10 }}>
            {t("settings_modal.personal_db.no_files")}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {personalFiles.map((f) => {
            const isActive = settings.activePersonalDbPath === f.path;
            return (
              <div key={f.path} style={{
                background: "var(--bg-hover)", borderRadius: 8, padding: "9px 12px",
                border: isActive ? "1px solid var(--accent)" : "1px solid transparent",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: isActive ? "var(--accent)" : "var(--text-1)" }}>
                    {f.name}
                  </span>
                  {f.game && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-2)" }}>{f.game}</span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-3)" }}>
                    {f.lang_from.toUpperCase()} → {f.lang_to.toUpperCase()}
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 10, color: "var(--text-3)" }}>
                    {f.entry_count} {t("settings_modal.personal_db.entries_label")}
                  </span>
                  {isActive && (
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
                      ★ {t("settings_modal.personal_db.active_badge")}
                    </span>
                  )}
                </div>
                {confirmDeletePath !== f.path && (!isActive ? (
                  <button
                    onClick={() => onUpdate({ activePersonalDbPath: f.path })}
                    style={{ ...smallBtnStyle(), background: "transparent", color: "var(--accent)", borderColor: "var(--accent)" }}
                  >
                    {t("settings_modal.personal_db.set_active")}
                  </button>
                ) : (
                  <button
                    onClick={() => onUpdate({ activePersonalDbPath: "" })}
                    style={{ ...smallBtnStyle(), background: "transparent", color: "var(--text-3)", borderColor: "var(--border)" }}
                  >
                    {t("settings_modal.personal_db.deactivate")}
                  </button>
                ))}
                {confirmDeletePath === f.path ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {t("settings_modal.personal_db.delete_confirm_inline")}
                    </span>
                    <button
                      onClick={async () => {
                        await invoke("delete_personal_db_cmd", { path: f.path });
                        if (isActive) onUpdate({ activePersonalDbPath: "" });
                        setConfirmDeletePath(null);
                        await refreshPersonal();
                      }}
                      style={{ ...smallBtnStyle(), color: "#fff", borderColor: "var(--danger)", background: "var(--danger)" }}
                    >
                      {t("settings_modal.personal_db.delete_confirm_yes")}
                    </button>
                    <button
                      onClick={() => setConfirmDeletePath(null)}
                      style={{ ...smallBtnStyle(), background: "transparent", color: "var(--text-2)", borderColor: "var(--border)" }}
                    >
                      {t("settings_modal.personal_db.delete_confirm_no")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeletePath(f.path)}
                    style={{ ...smallBtnStyle(), color: "var(--danger)", borderColor: "var(--danger)", background: "transparent" }}
                  >
                    {t("settings_modal.personal_db.delete")}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Create new personal DB */}
        {createForm ? (
          <div style={{
            background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>
              {t("settings_modal.personal_db.create_title")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {/* Name */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 180px" }}>
                <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                  {t("settings_modal.personal_db.create_name")}
                </label>
                <input
                  autoFocus
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(f => f ? { ...f, name: e.target.value } : f)}
                  placeholder={t("settings_modal.personal_db.create_name_placeholder")}
                  style={{
                    height: 32, padding: "0 10px", borderRadius: 7, fontSize: 12,
                    background: "var(--bg-card)", color: "var(--text-1)",
                    border: "1px solid var(--border)", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {/* Game */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 130px" }}>
                <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                  {t("settings_modal.db.default_game")}
                </label>
                <select
                  value={createForm.game}
                  onChange={(e) => setCreateForm(f => f ? { ...f, game: e.target.value } : f)}
                  style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}
                >
                  <option value="">— {t("settings_modal.db.default_game")} —</option>
                  {KNOWN_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {/* Source lang */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                  {t("settings_modal.db.default_src")}
                </label>
                <select value={createForm.srcLang} onChange={(e) => setCreateForm(f => f ? { ...f, srcLang: e.target.value } : f)}
                  style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
                  {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {/* Target lang */}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                  {t("settings_modal.db.default_dst")}
                </label>
                <select value={createForm.dstLang} onChange={(e) => setCreateForm(f => f ? { ...f, dstLang: e.target.value } : f)}
                  style={{ height: 32, padding: "0 8px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
                  {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            {createForm.error && (
              <p style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{createForm.error}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={submitCreatePersonal}
                disabled={!createForm.name.trim() || createForm.saving}
                style={btnStyle("var(--accent)")}
              >
                {createForm.saving ? "…" : t("settings_modal.personal_db.create_confirm")}
              </button>
              <button onClick={() => setCreateForm(null)} style={smallBtnStyle()}>
                {t("settings_modal.db.default_cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreateForm({ name: "", game: "", srcLang: "en", dstLang: "fr", saving: false, error: "" })}
            style={{ ...smallBtnStyle(), gap: 6 }}
          >
            <span style={{ fontSize: 14 }}>＋</span>
            {t("settings_modal.personal_db.create_btn")}
          </button>
        )}
      </Section>

    </div>
  );
}

// ── Divers tab ────────────────────────────────────────────────────────────────

function DiversTab({ settings, onUpdate, defaultExportDir = "" }: TabProps) {
  const { t } = useTranslation();

  const pickExportFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: t("settings_modal.misc.export_folder_pick_title") });
      if (dir && typeof dir === "string") onUpdate({ exportFolder: dir });
    } catch {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Export folder */}
      <Section first label={t("settings_modal.misc.export_folder_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.misc.export_folder_desc")}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={settings.exportFolder ?? ""}
            onChange={(e) => onUpdate({ exportFolder: e.target.value })}
            placeholder={defaultExportDir || t("settings_modal.misc.export_folder_placeholder")}
            style={{
              flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 11,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", outline: "none", fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
          <button onClick={pickExportFolder} title={t("settings_modal.misc.export_folder_pick_title")} style={iconBtn()}><IconFolder size={14} /></button>
          <button
            onClick={() => onUpdate({ exportFolder: defaultExportDir || "" })}
            title={t("settings_modal.misc.export_folder_reset_title")}
            style={iconBtn()}
          >↺</button>
        </div>
      </Section>

      {/* Silent export */}
      <Section label={t("settings_modal.misc.silent_export_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.misc.silent_export_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.misc.silent_export_on")}  active={settings.silentExport === true}  onClick={() => onUpdate({ silentExport: true  })} />
          <PillBtn label={t("settings_modal.misc.silent_export_off")} active={settings.silentExport !== true}  onClick={() => onUpdate({ silentExport: false })} />
        </div>
        {settings.silentExport && !settings.exportFolder && (
          <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, lineHeight: 1.4 }}>
            ⚠ {t("settings_modal.misc.silent_export_warn")}
          </p>
        )}
      </Section>

      <Section label={t("settings_modal.misc.propagate_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.misc.propagate_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.misc.propagate_on")}  active={settings.propagateIdentical !== false} onClick={() => onUpdate({ propagateIdentical: true  })} />
          <PillBtn label={t("settings_modal.misc.propagate_off")} active={settings.propagateIdentical === false}  onClick={() => onUpdate({ propagateIdentical: false })} />
        </div>
      </Section>

      <Section label={t("settings_modal.misc.autosession_section")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 10, lineHeight: 1.5 }}>
          {t("settings_modal.misc.autosession_desc")}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <PillBtn label={t("settings_modal.misc.autosession_on")}  active={settings.autoLoadSession === true}  onClick={() => onUpdate({ autoLoadSession: true  })} />
          <PillBtn label={t("settings_modal.misc.autosession_off")} active={settings.autoLoadSession !== true}   onClick={() => onUpdate({ autoLoadSession: false })} />
        </div>
      </Section>

    </div>
  );
}

// ── Traduction auto. tab ─────────────────────────────────────────────────────

function ApiTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ══ APIs ════════════════════════════════════════════════════════════ */}
      <SubGroup first label="APIs">

      {/* DeepL */}
      <Section first label={t("deepl.section_title")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 14, lineHeight: 1.5 }}>
          {t("deepl.section_desc")}{" "}
          <a
            href="https://www.deepl.com/pro#developer"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            deepl.com
          </a>
        </p>

        {/* Account type */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", width: 110, flexShrink: 0 }}>
            {t("deepl.api_type_label")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <PillBtn label={t("deepl.api_type_free")} active={(settings.deeplApiType ?? "free") !== "pro"} onClick={() => onUpdate({ deeplApiType: "free" })} />
            <PillBtn label={t("deepl.api_type_pro")}  active={(settings.deeplApiType ?? "free") === "pro"} onClick={() => onUpdate({ deeplApiType: "pro"  })} />
          </div>
        </div>

        {/* API key */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", width: 110, flexShrink: 0 }}>
            {t("deepl.api_key_label")}
          </span>
          <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.deeplApiKey ?? ""}
              onChange={e => {
                const val = e.target.value;
                const newType = val.trim().endsWith(":fx") ? "free" : (settings.deeplApiType ?? "free");
                onUpdate({ deeplApiKey: val, deeplApiType: newType });
              }}
              placeholder={t("deepl.api_key_placeholder")}
              spellCheck={false}
              style={{
                flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 12,
                background: "var(--bg-hover)", color: "var(--text-1)",
                border: "1px solid var(--border)", outline: "none",
                fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => setShowApiKey(v => !v)}
              title={showApiKey ? t("deepl.hide_key") : t("deepl.show_key")}
              style={iconBtn()}
            >
              {showApiKey ? "🙈" : "👁"}
            </button>
            {settings.deeplApiKey && (
              <button
                onClick={() => onUpdate({ deeplApiKey: "" })}
                title={t("deepl.clear_key")}
                style={{ ...iconBtn(), color: "#ef4444", borderColor: "#ef4444" }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {(settings.deeplApiType ?? "free") === "free" && (
          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8, lineHeight: 1.4 }}>
            ℹ {t("deepl.free_hint")}
          </p>
        )}
        {settings.deeplApiKey && (
          <div style={{
            marginTop: 10, padding: "6px 10px", borderRadius: 6,
            background: "var(--bg-hover)", border: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ color: "#22c55e" }}>✓</span>
            {t("deepl.key_configured")}
            <span style={{ marginLeft: "auto", fontFamily: "monospace", color: "var(--text-3)" }}>
              {(settings.deeplApiType ?? "free") === "pro" ? "Pro" : "Free"}
            </span>
          </div>
        )}
      </Section>

      </SubGroup>{/* /APIs */}

      {/* ══ IA ══════════════════════════════════════════════════════════════ */}
      <SubGroup label="IA">
        <p style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>
          — Options IA à venir (résumé, reformulation, suggestions contextuelles…)
        </p>
      </SubGroup>{/* /IA */}

      {/* ══ Autres réglages ═════════════════════════════════════════════════ */}
      <SubGroup label={t("settings_modal.tab_auto_other")}>

      {/* Fuzzy matching */}
      <Section first label={t("fuzzy.settings_title")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 14 }}>
          {t("fuzzy.settings_desc")}
        </p>

        {/* Auto-enable on plugin load */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).auto_enabled}
              onChange={e => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), auto_enabled: e.target.checked } })}
              style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
            />
            {t("fuzzy.auto_enabled")}
          </label>
        </div>

        {/* Jaro-Winkler threshold */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{t("fuzzy.threshold_jw")}</span>
          <input
            type="range" min={0.70} max={1.00} step={0.01}
            value={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).threshold_jw}
            onChange={e => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), threshold_jw: Number(e.target.value) } })}
            style={{ width: 130, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 36, textAlign: "right" }}>
            {Math.round((settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).threshold_jw * 100)}%
          </span>
        </div>

        {/* Levenshtein threshold */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{t("fuzzy.threshold_lev")}</span>
          <input
            type="range" min={0.50} max={1.00} step={0.01}
            value={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).threshold_lev}
            onChange={e => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), threshold_lev: Number(e.target.value) } })}
            style={{ width: 130, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 36, textAlign: "right" }}>
            {Math.round((settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).threshold_lev * 100)}%
          </span>
        </div>

        {/* Sources */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).use_session}
              onChange={e => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), use_session: e.target.checked } })}
              style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
            />
            {t("fuzzy.use_session")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
            <input
              type="checkbox"
              checked={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).use_personal_db}
              onChange={e => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), use_personal_db: e.target.checked } })}
              style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
            />
            {t("fuzzy.use_personal_db")}
          </label>
        </div>
      </Section>

      </SubGroup>{/* /Autres réglages */}

    </div>
  );
}

// ── System tab ────────────────────────────────────────────────────────────────

function SystemeTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [logPath, setLogPath]           = useState<string>("");
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    // Use the Rust command to get the canonical log path (avoids cross-platform path issues)
    invoke<string>("get_log_path_cmd")
      .then(setLogPath)
      .catch(() => setLogPath(""));
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

  const displayLogPath = logPath;

  // Rust-side open — bypass plugin-opener path encoding issues
  const openLogsFolder = () => invoke("open_log_dir_cmd").catch(() => {});
  const viewLogFile    = () => invoke("open_log_file_cmd").catch(() => {});

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
      <Section first label={t("settings_modal.sys.lang_section")}>
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
          style={{ height: 32, padding: "0 10px", borderRadius: 7, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", cursor: "pointer", boxSizing: "border-box" }}
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
              flex: 1, height: 32, padding: "0 10px", borderRadius: 6, fontSize: 10,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", fontFamily: "monospace", outline: "none", boxSizing: "border-box",
            }}
          />
          <button onClick={pickLogFolder} title={t("settings_modal.sys.log_pick_title")} style={iconBtn()}><IconFolder size={14} /></button>
          <button onClick={() => onUpdate({ logFolder: "" })} title={t("settings_modal.sys.log_reset_title")} style={iconBtn()}>↺</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={openLogsFolder} style={smallBtnStyle()}>{t("settings_modal.sys.log_open_folder")}</button>
          <button onClick={viewLogFile} style={smallBtnStyle()}>{t("settings_modal.sys.log_view_file")}</button>
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
            height: 32, padding: "0 16px", borderRadius: 7,
            cursor: "pointer", fontSize: 12, fontWeight: 500,
            boxSizing: "border-box", display: "inline-flex", alignItems: "center",
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

/** Accent-filled or neutral-bordered action button — fixed height 32 px */
function btnStyle(bg: string, outline = false): React.CSSProperties {
  return {
    height: 32, padding: "0 16px", borderRadius: 7,
    cursor: "pointer", fontSize: 12, fontWeight: 500,
    background: bg, color: outline ? "var(--text-1)" : "#fff",
    border: outline ? "1px solid var(--border)" : "none",
    flexShrink: 0, boxSizing: "border-box",
    display: "inline-flex", alignItems: "center",
  };
}

/** Secondary neutral action — same height / radius as btnStyle */
function smallBtnStyle(): React.CSSProperties {
  return {
    height: 32, padding: "0 14px", borderRadius: 7,
    cursor: "pointer", fontSize: 12, fontWeight: 500,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", boxSizing: "border-box",
    display: "flex", alignItems: "center", flexShrink: 0,
  };
}

/** Square icon-only button — 32×32 to match action buttons */
function iconBtn(): React.CSSProperties {
  return {
    height: 32, width: 32, padding: 0, borderRadius: 7,
    cursor: "pointer", fontSize: 14,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box",
  };
}

/** Lightweight subsection header — used inside a tab to group related settings
 *  without the heavy accent border of Section. */
function SubGroup({ label, children, first }: { label: string; children?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ marginBottom: 20, paddingTop: first ? 0 : 24, borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ flex: 0 }}>{label}</span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      {children}
    </div>
  );
}

function Section({ label, children, first }: { label: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      paddingTop: first ? 0 : 20,
      borderTop: first ? "none" : "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--accent)",
        textTransform: "uppercase", letterSpacing: "0.08em",
        borderLeft: "3px solid var(--accent)",
        paddingLeft: 8, marginBottom: 14,
        display: "flex", alignItems: "center",
        lineHeight: 1,
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
        height: 34, padding: "0 18px", borderRadius: 7,
        cursor: "pointer", boxSizing: "border-box",
        border: active ? "2px solid var(--accent)" : "2px solid var(--border)",
        background: active ? "var(--accent-dim)" : "var(--bg-card)",
        color: active ? "var(--accent)" : "var(--text-1)",
        fontSize: 12, fontWeight: active ? 600 : 400, transition: "all 0.15s",
        display: "inline-flex", alignItems: "center",
      }}
    >
      {label}
    </button>
  );
}
