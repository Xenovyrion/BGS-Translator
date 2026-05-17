import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { THEME_PRESETS } from "../../themes";
import type { ThemePreset } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../hooks/useSettings";
import type { ShortcutDef, KeyboardShortcuts, EditPanelShortcuts, ProviderMeta, StoredProviderConfig, ProviderEntry } from "../../types";
import { DEFAULT_SHORTCUTS, DEFAULT_EDIT_SHORTCUTS, DEFAULT_FUZZY_SETTINGS, DEFAULT_PROVIDER_ENTRIES, DEFAULT_AI_PROVIDER_ENTRIES, DEFAULT_AI_SYSTEM_PROMPT, SHORTCUT_OPTIONS } from "../../types";
import {
  IconSettings, IconClose, IconFolder,
  IconReplace, IconCheck, IconDatabase, IconSort, IconRefresh, IconSearch,
  IconLock, IconFile,
} from "../../icons";
import type { ReactNode } from "react";

type Tab = "apparence" | "raccourcis" | "orthographe" | "database" | "divers" | "api" | "ai" | "systeme";
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
    { id: "ai",          labelKey: "settings_modal.tab_ai",           icon: <IconSearch size={13} /> },
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
          width: "min(980px, 95vw)",
          height: "min(700px, 90vh)",
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
                padding: "0 9px", height: 40,
                background: "none", border: "none",
                borderBottom: tab === tabDef.id ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === tabDef.id ? "var(--accent)" : "var(--text-2)",
                fontSize: 12, fontWeight: tab === tabDef.id ? 600 : 400,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
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
          {tab === "ai"          && <AiTab          settings={settings} onUpdate={onUpdate} />}
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
      <span style={{ color: "var(--text-3)", opacity: 0.6, display: "flex", alignItems: "center" }}>
        <IconLock size={12} />
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

// ── UUID generator (tiny, no dep) ─────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const BUILTIN_IDS = new Set(DEFAULT_PROVIDER_ENTRIES.map(e => e.id));

function ApiTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [providerMetas, setProviderMetas] = useState<ProviderMeta[]>([]);
  const [expandedId,    setExpandedId]    = useState<string | null>(null);

  useEffect(() => {
    invoke<ProviderMeta[]>("get_providers_cmd").then(setProviderMetas).catch(() => {});
  }, []);

  const entries: ProviderEntry[] = settings.providerEntries ?? DEFAULT_PROVIDER_ENTRIES;

  function updateEntries(next: ProviderEntry[]) {
    onUpdate({ providerEntries: next });
  }

  function patchEntry(id: string, patch: Partial<ProviderEntry>) {
    updateEntries(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function patchConfig(id: string, patch: Partial<StoredProviderConfig>) {
    updateEntries(entries.map(e =>
      e.id === id ? { ...e, config: { ...e.config, ...patch } } : e
    ));
  }

  function deleteEntry(id: string) {
    updateEntries(entries.filter(e => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function addCustomApi() {
    const id = genId();
    const newEntry: ProviderEntry = { id, enabled: true, kind: "api", isCustom: true, customName: t("providers.new_custom_name"), config: {} };
    updateEntries([...entries, newEntry]);
    setExpandedId(id);
  }

  function addCustomBrowser() {
    const id = genId();
    const newEntry: ProviderEntry = { id, enabled: true, kind: "browser", isCustom: true, customName: t("providers.new_browser_name"), config: {} };
    updateEntries([...entries, newEntry]);
    setExpandedId(id);
  }

  const apiEntries     = entries.filter(e => e.kind === "api");
  const browserEntries = entries.filter(e => e.kind === "browser");

  const renderRow = (entry: ProviderEntry) => {
    const meta       = providerMetas.find(m => m.id === entry.id);
    const displayName = entry.customName ?? meta?.name ?? entry.id;
    const isExpanded  = expandedId === entry.id;
    const isCustom    = entry.isCustom || !BUILTIN_IDS.has(entry.id);

    return (
      <div key={entry.id}>
        {/* ── Row ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          borderRadius: isExpanded ? "6px 6px 0 0" : 6,
          background: isExpanded ? "var(--bg-card)" : "var(--bg-hover)",
          border: "1px solid var(--border)",
          borderBottom: isExpanded ? "none" : "1px solid var(--border)",
          marginBottom: isExpanded ? 0 : 5,
          transition: "background 0.1s",
        }}>
          {/* Toggle */}
          <input
            type="checkbox" checked={entry.enabled}
            onChange={e => patchEntry(entry.id, { enabled: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0, cursor: "pointer" }}
          />

          {/* Name (editable for custom) */}
          {isCustom ? (
            <input
              value={entry.customName ?? ""}
              onChange={e => patchEntry(entry.id, { customName: e.target.value })}
              style={{
                flex: 1, minWidth: 0, height: 24, padding: "0 6px",
                background: "var(--bg-primary)", color: "var(--text-1)",
                border: "1px solid var(--border)", borderRadius: 4, fontSize: 12,
                outline: "none", boxSizing: "border-box",
              }}
              placeholder={t("providers.custom_name_placeholder")}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: entry.enabled ? "var(--text-1)" : "var(--text-3)" }}>
              {displayName}
            </span>
          )}

          {/* Shortcut selector */}
          <select
            value={entry.shortcut ?? ""}
            onChange={e => patchEntry(entry.id, { shortcut: e.target.value || undefined })}
            style={{
              height: 26, padding: "0 4px", fontSize: 11,
              background: "var(--bg-primary)", color: "var(--text-2)",
              border: "1px solid var(--border)", borderRadius: 4,
              cursor: "pointer", flexShrink: 0, minWidth: 80,
              boxSizing: "border-box",
            }}
          >
            {SHORTCUT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Expand config */}
          <button
            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            title={t("providers.config_btn")}
            style={{
              height: 26, width: 26, borderRadius: 4, flexShrink: 0, cursor: "pointer",
              background: isExpanded ? "var(--accent)" : "var(--bg-primary)",
              color:      isExpanded ? "#fff"          : "var(--text-2)",
              border: "1px solid var(--border)", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            ⚙
          </button>

          {/* Delete (custom only) */}
          {isCustom && (
            <button
              onClick={() => deleteEntry(entry.id)}
              title={t("providers.delete_btn")}
              style={{
                height: 26, width: 26, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                background: "transparent", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.4)", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* ── Config panel (expanded) ── */}
        {isExpanded && (
          <div style={{
            padding: "12px 14px",
            borderRadius: "0 0 6px 6px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderTop: "none",
            marginBottom: 5,
          }}>
            <ProviderConfigPanel
              providerId={entry.id}
              meta={meta}
              cfg={entry.config}
              isBrowserKind={entry.kind === "browser"}
              isCustomEntry={isCustom}
              onUpdate={(patch) => patchConfig(entry.id, patch)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ══ API providers ═══════════════════════════════════════════════════ */}
      <SubGroup first label={t("providers.section_api")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
          {t("providers.section_api_desc")}
        </p>

        {apiEntries.map(renderRow)}

        <button
          onClick={addCustomApi}
          style={{
            height: 30, padding: "0 12px", borderRadius: 6, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: "transparent", color: "var(--accent)",
            border: "1px dashed var(--accent)", marginTop: 4,
          }}
        >
          + {t("providers.add_api_btn")}
        </button>
      </SubGroup>

      {/* ══ Browser launchers ═══════════════════════════════════════════════ */}
      <SubGroup label={t("providers.section_browser")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
          {t("providers.section_browser_desc")}
        </p>

        {browserEntries.map(renderRow)}

        <button
          onClick={addCustomBrowser}
          style={{
            height: 30, padding: "0 12px", borderRadius: 6, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: "transparent", color: "var(--accent)",
            border: "1px dashed var(--accent)", marginTop: 4,
          }}
        >
          + {t("providers.add_browser_btn")}
        </button>
      </SubGroup>

      {/* ══ Autres réglages ═════════════════════════════════════════════════ */}
      <SubGroup label={t("settings_modal.tab_auto_other")}>

      {/* Fuzzy matching */}
      <Section first label={t("fuzzy.settings_title")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 14 }}>
          {t("fuzzy.settings_desc")}
        </p>

        {/* Auto-enable on plugin load — PillBtn style like other on/off settings */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{t("fuzzy.auto_enabled")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <PillBtn
              label={t("settings_modal.misc.propagate_on")}
              active={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).auto_enabled}
              onClick={() => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), auto_enabled: true } })}
            />
            <PillBtn
              label={t("settings_modal.misc.propagate_off")}
              active={!(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS).auto_enabled}
              onClick={() => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), auto_enabled: false } })}
            />
          </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([ ["use_session", "use_personal_db"] as const ][0]).map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{t(`fuzzy.${key}`)}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <PillBtn
                  label={t("settings_modal.misc.propagate_on")}
                  active={(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS)[key]}
                  onClick={() => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), [key]: true } })}
                />
                <PillBtn
                  label={t("settings_modal.misc.propagate_off")}
                  active={!(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS)[key]}
                  onClick={() => onUpdate({ fuzzy: { ...(settings.fuzzy ?? DEFAULT_FUZZY_SETTINGS), [key]: false } })}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      </SubGroup>{/* /Autres réglages */}

    </div>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────

const AI_BUILTIN_IDS = new Set(DEFAULT_AI_PROVIDER_ENTRIES.map(e => e.id));

function AiTab({ settings, onUpdate }: TabProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allEntries: ProviderEntry[] = settings.providerEntries ?? [...DEFAULT_PROVIDER_ENTRIES, ...DEFAULT_AI_PROVIDER_ENTRIES];
  const aiEntries  = allEntries.filter(e => e.kind === "ai");

  function updateEntries(nextAi: ProviderEntry[]) {
    const nonAi = allEntries.filter(e => e.kind !== "ai");
    onUpdate({ providerEntries: [...nonAi, ...nextAi] });
  }

  function patchEntry(id: string, patch: Partial<ProviderEntry>) {
    updateEntries(aiEntries.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  function patchConfig(id: string, patch: Partial<StoredProviderConfig>) {
    updateEntries(aiEntries.map(e =>
      e.id === id ? { ...e, config: { ...e.config, ...patch } } : e
    ));
  }

  function deleteEntry(id: string) {
    updateEntries(aiEntries.filter(e => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function addCustomAi() {
    const id = genId();
    const newEntry: ProviderEntry = {
      id, enabled: true, kind: "ai",
      isCustom: true, customName: t("providers.new_ai_name"),
      config: { endpoint: "", model: "" },
    };
    updateEntries([...aiEntries, newEntry]);
    setExpandedId(id);
  }

  const renderRow = (entry: ProviderEntry) => {
    const isExpanded  = expandedId === entry.id;
    const isCustom    = entry.isCustom || !AI_BUILTIN_IDS.has(entry.id);
    const displayName = entry.customName ?? entry.id;

    return (
      <div key={entry.id}>
        {/* ── Row ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 10px",
          borderRadius: isExpanded ? "6px 6px 0 0" : 6,
          background: isExpanded ? "var(--bg-card)" : "var(--bg-hover)",
          border: "1px solid var(--border)",
          borderBottom: isExpanded ? "none" : "1px solid var(--border)",
          marginBottom: isExpanded ? 0 : 5,
          transition: "background 0.1s",
        }}>
          {/* Toggle */}
          <input
            type="checkbox" checked={entry.enabled}
            onChange={e => patchEntry(entry.id, { enabled: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 14, height: 14, flexShrink: 0, cursor: "pointer" }}
          />

          {/* Name (editable for custom) */}
          {isCustom ? (
            <input
              value={entry.customName ?? ""}
              onChange={e => patchEntry(entry.id, { customName: e.target.value })}
              style={{
                flex: 1, minWidth: 0, height: 24, padding: "0 6px",
                background: "var(--bg-primary)", color: "var(--text-1)",
                border: "1px solid var(--border)", borderRadius: 4, fontSize: 12,
                outline: "none", boxSizing: "border-box",
              }}
              placeholder={t("providers.custom_name_placeholder")}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: entry.enabled ? "var(--text-1)" : "var(--text-3)" }}>
              {displayName}
            </span>
          )}

          {/* Local badge for Ollama */}
          {entry.id === "ollama" && (
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "#22c55e22", color: "#22c55e", flexShrink: 0 }}>
              {t("providers.ai_local_badge")}
            </span>
          )}

          {/* Model quick display */}
          {entry.config.model && (
            <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace", flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.config.model}
            </span>
          )}

          {/* Shortcut selector */}
          <select
            value={entry.shortcut ?? ""}
            onChange={e => patchEntry(entry.id, { shortcut: e.target.value || undefined })}
            style={{
              height: 26, padding: "0 4px", fontSize: 11,
              background: "var(--bg-primary)", color: "var(--text-2)",
              border: "1px solid var(--border)", borderRadius: 4,
              cursor: "pointer", flexShrink: 0, minWidth: 80, boxSizing: "border-box",
            }}
          >
            {SHORTCUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Expand config */}
          <button
            onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            title={t("providers.config_btn")}
            style={{
              height: 26, width: 26, borderRadius: 4, flexShrink: 0, cursor: "pointer",
              background: isExpanded ? "var(--accent)" : "var(--bg-primary)",
              color:      isExpanded ? "#fff"          : "var(--text-2)",
              border: "1px solid var(--border)", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            ⚙
          </button>

          {/* Delete (custom only) */}
          {isCustom && (
            <button
              onClick={() => deleteEntry(entry.id)}
              title={t("providers.delete_btn")}
              style={{
                height: 26, width: 26, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                background: "transparent", color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.4)", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* ── Config panel (expanded) ── */}
        {isExpanded && (
          <div style={{
            padding: "12px 14px",
            borderRadius: "0 0 6px 6px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderTop: "none",
            marginBottom: 5,
          }}>
            <AiConfigPanel
              providerId={entry.id}
              cfg={entry.config}
              isCustomProvider={isCustom}
              onUpdate={(patch) => patchConfig(entry.id, patch)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SubGroup first label={t("providers.section_ai")}>
        <p style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
          {t("providers.section_ai_desc")}
        </p>
        {aiEntries.map(renderRow)}
        <button
          onClick={addCustomAi}
          style={{
            height: 30, padding: "0 12px", borderRadius: 6, cursor: "pointer",
            fontSize: 11, fontWeight: 600,
            background: "transparent", color: "var(--accent)",
            border: "1px dashed var(--accent)", marginTop: 4,
          }}
        >
          + {t("providers.add_ai_btn")}
        </button>
      </SubGroup>
    </div>
  );
}

// ── Predefined model catalogue ────────────────────────────────────────────────
// ram  : approximate VRAM/RAM needed (Ollama local models only)
// url  : official documentation / library page for this model
// tier : "light" | "medium" | "heavy" — drives the RAM badge colour

type RamTier = "light" | "medium" | "heavy";
interface ModelPreset {
  value:        string;
  label:        string;
  desc:         string;
  recommended?: boolean;
  ram?:         string;
  tier?:        RamTier;
  url?:         string;
}

/** RAM badge colour by tier */
function ramColor(tier: RamTier): string {
  if (tier === "light")  return "#22c55e";   // green
  if (tier === "medium") return "#f59e0b";   // amber
  return "#ef4444";                          // red (heavy)
}

const AI_PRESET_MODELS: Record<string, ModelPreset[]> = {
  ollama: [
    {
      value: "llama3.2", label: "Llama 3.2 (3B)",
      desc: "Meta · Ultra-léger, idéal pour débuter",
      ram: "~2 GB", tier: "light", recommended: true,
      url: "https://ollama.com/library/llama3.2",
    },
    {
      value: "llama3.1", label: "Llama 3.1 (8B)",
      desc: "Meta · Bon équilibre qualité / vitesse",
      ram: "~5 GB", tier: "medium",
      url: "https://ollama.com/library/llama3.1",
    },
    {
      value: "mistral", label: "Mistral 7B",
      desc: "Mistral AI · Rapide, excellent pour la traduction",
      ram: "~4 GB", tier: "medium",
      url: "https://ollama.com/library/mistral",
    },
    {
      value: "qwen2.5", label: "Qwen 2.5 (7B)",
      desc: "Alibaba · Très bon en multilingue / traduction",
      ram: "~5 GB", tier: "medium",
      url: "https://ollama.com/library/qwen2.5",
    },
    {
      value: "gemma2", label: "Gemma 2 (9B)",
      desc: "Google · Haute qualité, bien optimisé",
      ram: "~6 GB", tier: "medium",
      url: "https://ollama.com/library/gemma2",
    },
    {
      value: "phi3", label: "Phi-3 Mini (3.8B)",
      desc: "Microsoft · Très léger, tourne sur CPU",
      ram: "~2 GB", tier: "light",
      url: "https://ollama.com/library/phi3",
    },
    {
      value: "mixtral", label: "Mixtral 8x7B",
      desc: "Mistral AI · Très capable, nécessite beaucoup de RAM",
      ram: "~48 GB", tier: "heavy",
      url: "https://ollama.com/library/mixtral",
    },
  ],
  claude: [
    {
      value: "claude-haiku-4-5", label: "Claude Haiku",
      desc: "Le plus rapide et le moins cher — recommandé pour la traduction", recommended: true,
      url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    },
    {
      value: "claude-sonnet-4-5", label: "Claude Sonnet",
      desc: "Équilibre qualité / coût — meilleure qualité narrative",
      url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    },
    {
      value: "claude-opus-4-5", label: "Claude Opus",
      desc: "Le plus puissant — lent et coûteux, pour textes complexes",
      url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    },
  ],
  cohere: [
    {
      value: "command-r", label: "Command R",
      desc: "Rapide et économique — idéal pour la traduction en volume", recommended: true,
      url: "https://docs.cohere.com/docs/models",
    },
    {
      value: "command-r-plus", label: "Command R+",
      desc: "Plus capable — meilleure qualité pour textes longs",
      url: "https://docs.cohere.com/docs/models",
    },
  ],
  openai: [
    {
      value: "gpt-4o-mini", label: "GPT-4o mini",
      desc: "Rapide et peu coûteux — recommandé pour la traduction", recommended: true,
      url: "https://platform.openai.com/docs/models",
    },
    {
      value: "gpt-4o", label: "GPT-4o",
      desc: "Meilleure qualité — bon pour les textes longs ou complexes",
      url: "https://platform.openai.com/docs/models",
    },
    {
      value: "gpt-4.1-mini", label: "GPT-4.1 mini",
      desc: "Nouvelle génération — efficace et économique",
      url: "https://platform.openai.com/docs/models",
    },
    {
      value: "gpt-4.1", label: "GPT-4.1",
      desc: "Nouvelle génération — haute qualité",
      url: "https://platform.openai.com/docs/models",
    },
  ],
  custom_ai: [
    {
      value: "gpt-4o-mini", label: "GPT-4o mini",
      desc: "OpenAI · Rapide et peu coûteux", recommended: true,
      url: "https://platform.openai.com/docs/models",
    },
    {
      value: "gpt-4o", label: "GPT-4o",
      desc: "OpenAI · Meilleure qualité",
      url: "https://platform.openai.com/docs/models",
    },
    {
      value: "mistral-large-latest", label: "Mistral Large",
      desc: "Mistral API · Très performant",
      url: "https://docs.mistral.ai/getting-started/models/models_overview/",
    },
    {
      value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B",
      desc: "Groq · Inference ultra-rapide",
      url: "https://console.groq.com/docs/models",
    },
  ],
};

// ── AI config panel ───────────────────────────────────────────────────────────

type OllamaStatus = "unknown" | "checking" | "not_installed" | "installed" | "running";

function ollamaActionBtn(color: string, disabled = false): React.CSSProperties {
  return {
    height: 30, padding: "0 10px", borderRadius: 6, fontSize: 11, flexShrink: 0,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
    background: "var(--bg-hover)", color, border: `1px solid ${color}`,
    boxSizing: "border-box",
  };
}

function AiConfigPanel({
  providerId, cfg, isCustomProvider = false, onUpdate,
}: {
  providerId:        string;
  cfg:               StoredProviderConfig;
  /** True for user-created custom AI providers (UUID ids) — shows endpoint field + uses OpenAI-compat presets. */
  isCustomProvider?: boolean;
  onUpdate:          (patch: Partial<StoredProviderConfig>) => void;
}) {
  const { t } = useTranslation();
  const [showKey,        setShowKey]        = useState(false);
  // "Add custom model" form — shown when the user clicks "+"
  const [showAddForm,    setShowAddForm]    = useState(false);
  const [newModelName,   setNewModelName]   = useState("");
  // Ollama model status machine
  const [modelStatus,    setModelStatus]    = useState<OllamaStatus>("unknown");
  const [pulling,        setPulling]        = useState(false);
  const [loadingModel,   setLoadingModel]   = useState(false);
  const [unloading,   setUnloading]   = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  // "Browse installed" panel
  const [installedList,      setInstalledList]      = useState<string[]>([]);
  const [fetchingInstalled,  setFetchingInstalled]  = useState(false);
  const [installedError,     setInstalledError]      = useState<string | null>(null);

  const isOllama       = providerId === "ollama";
  // Custom providers (UUID or legacy custom_ai): OpenAI-compatible, need endpoint + optional key
  const isOpenAiCompat = isCustomProvider || providerId === "custom_ai";
  // Providers that require a mandatory API key
  const needsKey       = providerId === "claude" || providerId === "cohere" || providerId === "openai";
  // Providers that need an endpoint URL configured
  const needsEndpoint  = isOllama || isOpenAiCompat;
  const baseUrl        = cfg.endpoint || "http://localhost:11434";

  // Custom providers reuse the "custom_ai" preset model catalogue (GPT, Mistral, Groq, etc.)
  const presets        = AI_PRESET_MODELS[isCustomProvider ? "custom_ai" : providerId] ?? [];
  const presetValues   = presets.map(p => p.value);
  const customModels   = cfg.customModels ?? [];

  const currentModel     = cfg.model ?? "";
  // Normalize ":latest" suffix (e.g. "llama3.1:latest" → "llama3.1")
  const currentModelNorm = currentModel.replace(/:latest$/, "");

  // All known model values (presets + user-saved custom models)
  const allModelValues = [...presetValues, ...customModels];

  // selectValue: the value shown in the <select>.
  // Falls back to recommended preset if the stored model is not in any known list.
  const selectValue = allModelValues.includes(currentModelNorm)
    ? currentModelNorm
    : (presets.find(p => p.recommended)?.value ?? presets[0]?.value ?? "");

  const selectedPreset   = presets.find(p => p.value === selectValue);
  const isCustomSelected = customModels.includes(currentModelNorm) || customModels.includes(currentModel);

  // ── Auto-check Ollama model status whenever the selected model changes ────────
  useEffect(() => {
    if (!isOllama || !selectValue) {
      setModelStatus("unknown");
      return;
    }
    let cancelled = false;
    setModelStatus("checking");
    setStatusError(null);
    invoke<{ installed: boolean; running: boolean }>("get_ollama_model_status_cmd", {
      baseUrl, model: selectValue,
    }).then(({ installed, running }) => {
      if (!cancelled) setModelStatus(running ? "running" : installed ? "installed" : "not_installed");
    }).catch(() => {
      if (!cancelled) setModelStatus("unknown");
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOllama, selectValue, cfg.endpoint]);

  // ── Ollama actions ────────────────────────────────────────────────────────────

  /** Shared pull+load logic for both preset and custom install flows. */
  const doPullAndLoad = async (model: string): Promise<void> => {
    await invoke("pull_ollama_model_cmd", { baseUrl, model });
    setLoadingModel(true);
    try { await invoke("load_ollama_model_cmd", { baseUrl, model }); } catch { /* non-critical */ }
    setLoadingModel(false);
  };

  /** Error message helper for ollama pull errors. */
  const pullErrorMsg = (err: string, model: string): string => {
    if (err.includes("ollama_not_running"))      return t("providers.ai_error_ollama_not_running");
    if (err.includes("ollama_model_not_found"))  return t("providers.ai_error_ollama_model_not_found") + ` (${model})`;
    if (err.includes("ollama_pull_failed:")) {
      const detail = err.replace(/.*ollama_pull_failed:/, "").trim();
      return `${t("providers.ai_ollama_install_error", { model })}: ${detail}`;
    }
    return t("providers.ai_ollama_install_error", { model });
  };

  /** Install the currently selected preset model. */
  const handleInstall = async () => {
    const model = selectValue;
    if (!model) return;
    setPulling(true);
    setStatusError(null);
    try {
      await doPullAndLoad(model);
      setModelStatus("running");
    } catch (e) {
      const err = String(e);
      console.error("[ollama] pull failed:", err);
      setStatusError(pullErrorMsg(err, model));
    } finally {
      setPulling(false);
    }
  };

  /** Install a brand-new custom model typed in the add-form. */
  const handleInstallCustom = async () => {
    const model = newModelName.trim();
    if (!model) return;
    setPulling(true);
    setStatusError(null);
    try {
      await doPullAndLoad(model);
      // Persist in customModels and set as active model
      const updated = [...customModels.filter(m => m !== model), model];
      onUpdate({ customModels: updated, model });
      setModelStatus("running");
      setShowAddForm(false);
      setNewModelName("");
    } catch (e) {
      const err = String(e);
      console.error("[ollama] custom pull failed:", err);
      setStatusError(pullErrorMsg(err, model));
    } finally {
      setPulling(false);
    }
  };


  const handleLoad = async () => {
    const model = currentModel || selectValue;
    if (!model) return;
    setLoadingModel(true);
    setStatusError(null);
    try {
      await invoke("load_ollama_model_cmd", { baseUrl, model });
      setModelStatus("running");
    } catch {
      setStatusError(t("providers.ai_ollama_load_error"));
    } finally {
      setLoadingModel(false);
    }
  };

  const handleUnload = async () => {
    const model = currentModel || selectValue;
    if (!model) return;
    setUnloading(true);
    try {
      await invoke("unload_ollama_model_cmd", { baseUrl, model });
      setModelStatus("installed");
    } catch { /* non-critical */ }
    finally { setUnloading(false); }
  };

  const handleBrowseInstalled = async () => {
    setFetchingInstalled(true);
    setInstalledError(null);
    try {
      const models = await invoke<string[]>("fetch_ollama_models_cmd", { baseUrl });
      setInstalledList(models);
      // Do NOT auto-select — the panel is for viewing only
    } catch {
      setInstalledError(t("providers.ai_fetch_models_error"));
    } finally {
      setFetchingInstalled(false);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    flex: 1, height: 30, padding: "0 10px", borderRadius: 6, fontSize: 11,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", outline: "none",
    fontFamily: "monospace", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-3)", width: 110, flexShrink: 0 };
  const row = (label: string, child: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={labelStyle}>{label}</span>
      {child}
    </div>
  );

  // Status action button for Ollama (preset row — right side of the select)
  const renderOllamaAction = () => {
    const busy = pulling || loadingModel || unloading;

    if (pulling)      return <button disabled style={ollamaActionBtn("#f59e0b", true)}>⏳ {t("providers.ai_ollama_installing")}</button>;
    if (loadingModel) return <button disabled style={ollamaActionBtn("#22c55e", true)}>⏳ {t("providers.ai_ollama_loading")}</button>;
    if (unloading)    return <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>⏳ {t("providers.ai_ollama_unloading")}</span>;

    switch (modelStatus) {
      case "checking":
        return <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>⏳ {t("providers.ai_ollama_checking")}</span>;
      case "not_installed":
        return (
          <button type="button" onClick={handleInstall} disabled={busy} style={ollamaActionBtn("var(--accent)")}>
            ⬇ {t("providers.ai_ollama_install")}
          </button>
        );
      case "installed":
        return (
          <button type="button" onClick={handleLoad} disabled={busy} style={ollamaActionBtn("#22c55e")}>
            ⬆ {t("providers.ai_ollama_load")}
          </button>
        );
      case "running":
        return (
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ {t("providers.ai_ollama_running")}</span>
            <button type="button" onClick={handleUnload} style={{
              height: 22, padding: "0 7px", borderRadius: 4, cursor: "pointer",
              fontSize: 10, background: "transparent",
              color: "var(--text-3)", border: "1px solid var(--border)",
            }}>
              {t("providers.ai_ollama_unload")}
            </button>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Endpoint URL (Ollama + custom_ai) */}
      {needsEndpoint && row(
        t("providers.ai_endpoint_label"),
        <input
          style={inputStyle}
          value={cfg.endpoint ?? (isOllama ? "http://localhost:11434" : "")}
          onChange={e => onUpdate({ endpoint: e.target.value })}
          placeholder={isCustomProvider ? "" : t("providers.ai_endpoint_hint")}
          spellCheck={false}
        />,
      )}

      {/* ── Model picker — simple text field for custom providers ──────────── */}
      {isCustomProvider && row(
        t("providers.ai_model_label"),
        <input
          style={inputStyle}
          value={cfg.model ?? ""}
          onChange={e => onUpdate({ model: e.target.value })}
          placeholder={t("providers.ai_model_custom_placeholder")}
          spellCheck={false}
        />,
      )}

      {/* ── Model picker — preset dropdown for built-in providers ──────────── */}
      {!isCustomProvider && <div style={{ marginBottom: 10 }}>

        {/* Row 1: label + select + "+" add button + doc link + Ollama status action */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={labelStyle}>{t("providers.ai_model_label")}</span>

          {/* Model dropdown: presets + custom group */}
          <select
            value={selectValue}
            onChange={e => {
              setShowAddForm(false);
              onUpdate({ model: e.target.value });
            }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {presets.map(p => (
              <option key={p.value} value={p.value}>
                {p.label}{p.recommended ? " ★" : ""}
              </option>
            ))}
            {customModels.length > 0 && (
              <optgroup label={`— ${t("providers.ai_model_custom_group")} —`}>
                {customModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            )}
          </select>

          {/* "+" toggle button — adds a new custom model (Ollama only) */}
          {isOllama && (
            <button
              type="button"
              title={showAddForm ? t("providers.ai_ollama_add_cancel") : t("providers.ai_ollama_add_model")}
              onClick={() => { setShowAddForm(v => !v); setNewModelName(""); setStatusError(null); }}
              style={{
                height: 30, width: 30, borderRadius: 6, cursor: "pointer",
                fontSize: 16, fontWeight: 700, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: showAddForm ? "rgba(239,68,68,0.15)" : "var(--bg-hover)",
                color: showAddForm ? "#ef4444" : "var(--accent)",
                border: `1px solid ${showAddForm ? "#ef4444" : "var(--accent)"}`,
                boxSizing: "border-box", lineHeight: 1,
              }}
            >
              {showAddForm ? "−" : "+"}
            </button>
          )}

          {/* Doc link ↗ — only for selected preset models */}
          {selectedPreset?.url && !isCustomSelected && installedList.length === 0 && (
            <button
              type="button"
              title={t("providers.ai_model_doc_link")}
              onClick={e => {
                e.stopPropagation();
                invoke("open_url_cmd", { url: selectedPreset.url! }).catch(err => console.error("open_url_cmd failed:", err));
              }}
              style={{
                height: 28, width: 28, borderRadius: 6, cursor: "pointer",
                fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-hover)", color: "var(--text-3)",
                border: "1px solid var(--border)", boxSizing: "border-box",
              }}
            >
              ↗
            </button>
          )}

          {/* Ollama smart status/action button */}
          {isOllama && !showAddForm && renderOllamaAction()}
        </div>

        {/* Row 2: "Add custom model" form — shown when "+" was clicked */}
        {isOllama && showAddForm && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={labelStyle} />
            <input
              style={inputStyle}
              value={newModelName}
              onChange={e => setNewModelName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newModelName.trim()) handleInstallCustom(); }}
              placeholder={t("providers.ai_ollama_add_placeholder")}
              spellCheck={false}
              autoFocus
            />
            <button
              type="button"
              onClick={handleInstallCustom}
              disabled={!newModelName.trim() || pulling || loadingModel}
              style={ollamaActionBtn("var(--accent)", !newModelName.trim() || pulling || loadingModel)}
            >
              {pulling
                ? `⏳ ${t("providers.ai_ollama_installing")}`
                : loadingModel
                  ? `⏳ ${t("providers.ai_ollama_loading")}`
                  : `⬇ ${t("providers.ai_ollama_install")}`}
            </button>
          </div>
        )}

        {/* Description box — only for preset models when browse panel is closed */}
        {selectedPreset && !isCustomSelected && installedList.length === 0 && (
          <div style={{
            marginLeft: 120, padding: "5px 10px", borderRadius: 5,
            background: "var(--bg-primary)", border: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-3)", lineHeight: 1.5,
            display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
          }}>
            {selectedPreset.recommended && (
              <span style={{ color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
                ★ {t("providers.ai_model_recommended")}
              </span>
            )}
            <span style={{ flex: 1 }}>{selectedPreset.desc}</span>
            {selectedPreset.ram && selectedPreset.tier && (
              <span style={{
                marginLeft: "auto", flexShrink: 0,
                padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                background: ramColor(selectedPreset.tier) + "22",
                color: ramColor(selectedPreset.tier),
                border: `1px solid ${ramColor(selectedPreset.tier)}55`,
              }}>
                RAM {selectedPreset.ram}
              </span>
            )}
          </div>
        )}

        {/* Ollama — install hint (only when model is not installed and not pulling) */}
        {isOllama && modelStatus === "not_installed" && !pulling && !showAddForm && (
          <div style={{ marginLeft: 120, marginTop: 4, fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
            {t("providers.ai_ollama_hint")}
          </div>
        )}

        {/* Ollama — "Installed" context: hint that model will auto-load on first use */}
        {isOllama && modelStatus === "installed" && !loadingModel && (
          <div style={{ marginLeft: 120, marginTop: 4, fontSize: 11, color: "#22c55e", lineHeight: 1.5 }}>
            ✓ {t("providers.ai_ollama_installed_hint")}
          </div>
        )}

        {/* Ollama — large model install warning */}
        {isOllama && pulling && selectedPreset?.tier === "heavy" && (
          <div style={{ marginLeft: 120, marginTop: 4, fontSize: 11, color: "#f59e0b", lineHeight: 1.5 }}>
            ⚠ {t("providers.ai_ollama_heavy_warning")}
          </div>
        )}

        {/* Errors */}
        {statusError && (
          <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0 120px" }}>⚠ {statusError}</p>
        )}

        {/* Browse installed models — link + collapsible list panel */}
        {isOllama && (
          <div style={{ marginLeft: 120, marginTop: 6 }}>
            {/* Trigger link */}
            {installedList.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button"
                  onClick={handleBrowseInstalled}
                  disabled={fetchingInstalled}
                  style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontSize: 11, color: "var(--accent)", textDecoration: "underline",
                    opacity: fetchingInstalled ? 0.5 : 1,
                  }}
                >
                  {fetchingInstalled ? `⏳ ${t("providers.ai_fetch_models_loading")}` : t("providers.ai_fetch_models")}
                </button>
                {installedError && (
                  <span style={{ fontSize: 11, color: "#ef4444" }}>⚠ {installedError}</span>
                )}
              </div>
            )}

            {/* Installed models panel (replaces trigger when open) */}
            {installedList.length > 0 && (
              <div style={{
                border: "1px solid var(--border)", borderRadius: 6,
                background: "var(--bg-primary)", overflow: "hidden",
              }}>
                {/* Panel header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 10px",
                  background: "var(--bg-hover)", borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>
                    📦 {t("providers.ai_fetch_models_ok", { count: installedList.length })}
                  </span>
                  <button type="button" onClick={() => setInstalledList([])}
                    style={{
                      background: "none", border: "none", padding: "0 4px",
                      cursor: "pointer", fontSize: 14, color: "var(--text-3)",
                      lineHeight: 1,
                    }}>
                    ×
                  </button>
                </div>
                {/* Model rows */}
                {installedList.map((m, idx) => {
                  const norm       = m.replace(/:latest$/, "");
                  const isSelected = norm === currentModelNorm || m === currentModel;
                  const isRunning  = isSelected && modelStatus === "running";
                  return (
                    <div key={m} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px",
                      borderBottom: idx < installedList.length - 1 ? "1px solid var(--border)" : "none",
                      background: isSelected ? "var(--bg-hover)" : "transparent",
                    }}>
                      {/* Model name */}
                      <span style={{
                        flex: 1, fontSize: 11, fontFamily: "monospace",
                        color: isSelected ? "var(--text-1)" : "var(--text-2)",
                      }}>
                        {m}
                      </span>
                      {/* Running badge */}
                      {isRunning && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 8,
                          background: "#22c55e22", color: "#22c55e",
                          border: "1px solid #22c55e55", flexShrink: 0,
                        }}>
                          ✓ {t("providers.ai_ollama_running")}
                        </span>
                      )}
                      {/* Selected badge (not running) */}
                      {isSelected && !isRunning && (
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 8,
                          background: "var(--accent)22", color: "var(--accent)",
                          border: "1px solid var(--accent)55", flexShrink: 0,
                        }}>
                          ✓ {t("providers.ai_ollama_selected")}
                        </span>
                      )}
                      {/* Use button */}
                      {!isSelected && (
                        <button type="button"
                          onClick={() => {
                            const inPreset = presetValues.includes(norm);
                            if (!inPreset && !customModels.includes(norm) && !customModels.includes(m)) {
                              // Add to custom list automatically
                              onUpdate({ customModels: [...customModels, norm], model: norm });
                            } else {
                              onUpdate({ model: inPreset ? norm : m });
                            }
                            setInstalledList([]);
                          }}
                          style={{
                            height: 22, padding: "0 8px", borderRadius: 4,
                            cursor: "pointer", fontSize: 10, flexShrink: 0,
                            background: "var(--bg-hover)", color: "var(--accent)",
                            border: "1px solid var(--accent)",
                          }}
                        >
                          {t("providers.ai_ollama_use_model")}
                        </button>
                      )}
                      {/* Delete button — unload + rm */}
                      <button
                        type="button"
                        title={t("providers.ai_ollama_delete_model")}
                        onClick={async () => {
                          const target = norm || m;
                          if (!window.confirm(t("providers.ai_ollama_delete_confirm", { model: target }))) return;
                          try {
                            try { await invoke("unload_ollama_model_cmd", { baseUrl, model: target }); } catch {}
                            await invoke("delete_ollama_model_cmd", { baseUrl, model: target });
                            setInstalledList(prev => prev.filter(x => x !== m));
                            if (isSelected) {
                              const updated  = customModels.filter(x => x !== norm && x !== m);
                              const fallback = presets.find(p => p.recommended)?.value ?? presets[0]?.value ?? "";
                              onUpdate({ customModels: updated, model: fallback });
                              setModelStatus("checking");
                            } else if (customModels.includes(norm)) {
                              onUpdate({ customModels: customModels.filter(x => x !== norm && x !== m) });
                            }
                          } catch (e) {
                            console.error("[ollama] delete from browse panel failed:", e);
                          }
                        }}
                        style={{
                          height: 22, width: 22, borderRadius: 4,
                          cursor: "pointer", fontSize: 14, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "transparent", color: "#ef4444",
                          border: "1px solid rgba(239,68,68,0.4)",
                          boxSizing: "border-box", lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>}

      {/* API key (Claude, Cohere, OpenAI — required; OpenAI-compat custom providers — optional) */}
      {(needsKey || isOpenAiCompat) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={labelStyle}>{t("providers.api_key_label")}</span>
          <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type={showKey ? "text" : "password"}
              style={inputStyle}
              value={cfg.apiKey ?? ""}
              onChange={e => onUpdate({ apiKey: e.target.value })}
              placeholder={isCustomProvider ? "" : (!needsKey ? t("providers.optional_key") : "")}
              spellCheck={false}
            />
            <button onClick={() => setShowKey(v => !v)} title={showKey ? t("providers.hide_key") : t("providers.show_key")} style={iconBtn()}>
              {showKey ? "🙈" : "👁"}
            </button>
            {cfg.apiKey && (
              <button onClick={() => onUpdate({ apiKey: "" })} title={t("providers.clear_key")} style={{ ...iconBtn(), color: "#ef4444", borderColor: "#ef4444" }}>×</button>
            )}
          </div>
        </div>
      )}

      {/* Temperature */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>{t("providers.ai_temperature_label")}</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={cfg.temperature ?? 0.3}
          onChange={e => onUpdate({ temperature: Number(e.target.value) })}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 11, color: "var(--text-3)", minWidth: 36, textAlign: "right" }}>
          {(cfg.temperature ?? 0.3).toFixed(2)}
        </span>
      </div>

      {/* Max tokens */}
      {row(
        t("providers.ai_max_tokens_label"),
        <input
          type="number" min={64} max={8192} step={64}
          value={cfg.maxTokens ?? 1024}
          onChange={e => onUpdate({ maxTokens: Number(e.target.value) })}
          style={{ ...inputStyle, flex: "none", width: 100 }}
        />,
      )}

      {/* System prompt */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>
            {t("providers.ai_prompt_label")}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-3)", flex: 1 }}>
            {t("providers.ai_prompt_hint")}
          </span>
          <button
            onClick={() => onUpdate({ systemPrompt: undefined })}
            style={{
              height: 22, padding: "0 8px", borderRadius: 4, cursor: "pointer", fontSize: 10,
              background: "var(--bg-hover)", color: "var(--text-3)",
              border: "1px solid var(--border)", flexShrink: 0,
            }}
          >
            ↺ {t("providers.ai_prompt_reset")}
          </button>
        </div>
        <textarea
          value={cfg.systemPrompt ?? DEFAULT_AI_SYSTEM_PROMPT}
          onChange={e => onUpdate({ systemPrompt: e.target.value })}
          rows={8}
          spellCheck={false}
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 11,
            background: "var(--bg-hover)", color: "var(--text-1)",
            border: "1px solid var(--border)", outline: "none",
            fontFamily: "monospace", lineHeight: 1.5, resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>
    </div>
  );
}

// ── Provider config panel (shown inside ApiTab) ───────────────────────────────

function ProviderConfigPanel({
  providerId, meta, cfg, isBrowserKind = false, isCustomEntry = false, onUpdate,
}: {
  providerId:     string;
  meta:           ProviderMeta | undefined;
  cfg:            StoredProviderConfig;
  isBrowserKind?: boolean;
  isCustomEntry?: boolean;
  onUpdate:       (patch: Partial<StoredProviderConfig>) => void;
}) {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);

  // Built-in browser launcher — only needs URL info
  if (isBrowserKind && !isCustomEntry) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, margin: 0 }}>
        {t("providers.launcher_info")}
      </p>
    );
  }

  // Custom browser launcher — needs a URL template
  if (isBrowserKind && isCustomEntry) {
    const inputStyle: React.CSSProperties = {
      flex: 1, height: 30, padding: "0 10px", borderRadius: 6, fontSize: 11,
      background: "var(--bg-hover)", color: "var(--text-1)",
      border: "1px solid var(--border)", outline: "none",
      fontFamily: "monospace", boxSizing: "border-box",
    };
    const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text-3)", width: 100, flexShrink: 0 };
    const row = (label: string, child: React.ReactNode) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>{label}</span>
        {child}
      </div>
    );
    return (
      <div>
        {row(t("providers.endpoint_label"),
          <input style={inputStyle} value={cfg.endpoint ?? ""} onChange={e => onUpdate({ endpoint: e.target.value })}
            placeholder="https://translate.example.com/?q={text_enc}&sl={from}&tl={to}" spellCheck={false} />,
        )}
        <p style={{ fontSize: 11, color: "var(--text-3)", margin: "4px 0 0", lineHeight: 1.5 }}>
          {t("providers.browser_template_hint")}
        </p>
      </div>
    );
  }

  // API provider — no meta means unknown custom, show all fields
  if (!meta && !isCustomEntry) return null;

  const inputStyle: React.CSSProperties = {
    flex: 1, height: 30, padding: "0 10px", borderRadius: 6, fontSize: 11,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", outline: "none",
    fontFamily: "monospace", boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--text-3)", width: 100, flexShrink: 0,
  };

  const row = (label: string, child: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={labelStyle}>{label}</span>
      {child}
    </div>
  );

  return (
    <div>
      {/* DeepL: variant (free/pro) */}
      {providerId === "deepl" && row(
        t("providers.variant_label"),
        <div style={{ display: "flex", gap: 6 }}>
          <PillBtn label={t("deepl.api_type_free")} active={(cfg.variant ?? "free") !== "pro"} onClick={() => onUpdate({ variant: "free" })} />
          <PillBtn label={t("deepl.api_type_pro")}  active={(cfg.variant ?? "free") === "pro"}  onClick={() => onUpdate({ variant: "pro"  })} />
        </div>,
      )}

      {/* Microsoft: region (optional) */}
      {providerId === "microsoft" && row(
        t("providers.region_label"),
        <input
          style={inputStyle}
          value={cfg.variant ?? ""}
          onChange={e => onUpdate({ variant: e.target.value })}
          placeholder={t("providers.region_hint_ms")}
          spellCheck={false}
        />,
      )}

      {/* LibreTranslate: custom endpoint */}
      {providerId === "libretranslate" && row(
        t("providers.endpoint_label"),
        <input
          style={inputStyle}
          value={cfg.endpoint ?? ""}
          onChange={e => onUpdate({ endpoint: e.target.value })}
          placeholder={t("providers.endpoint_hint_libre")}
          spellCheck={false}
        />,
      )}

      {/* Custom provider fields */}
      {providerId === "custom" && (
        <>
          {row(t("providers.endpoint_label"),
            <input style={inputStyle} value={cfg.endpoint ?? ""} onChange={e => onUpdate({ endpoint: e.target.value })} placeholder="https://api.example.com/translate" spellCheck={false} />,
          )}
          {row(t("providers.auth_header_label"),
            <input style={inputStyle} value={cfg.authHeader ?? ""} onChange={e => onUpdate({ authHeader: e.target.value })} placeholder={t("providers.custom_auth_hint")} spellCheck={false} />,
          )}
          {row(t("providers.request_template_label"),
            <input style={inputStyle} value={cfg.requestTemplate ?? ""} onChange={e => onUpdate({ requestTemplate: e.target.value })} placeholder={t("providers.custom_template_hint")} spellCheck={false} />,
          )}
          {row(t("providers.response_path_label"),
            <input style={inputStyle} value={cfg.responsePath ?? ""} onChange={e => onUpdate({ responsePath: e.target.value })} placeholder={t("providers.custom_path_hint")} spellCheck={false} />,
          )}
        </>
      )}

      {/* API Key field — shown for all non-launcher providers */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={labelStyle}>{t("providers.api_key_label")}</span>
        <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type={showKey ? "text" : "password"}
            value={cfg.apiKey ?? ""}
            onChange={e => {
              const val = e.target.value;
              // Auto-detect DeepL free key
              const patch: Partial<StoredProviderConfig> = { apiKey: val };
              if (providerId === "deepl" && val.trim().endsWith(":fx")) patch.variant = "free";
              onUpdate(patch);
            }}
            placeholder={providerId === "deepl" ? t("deepl.api_key_placeholder") : ""}
            spellCheck={false}
            style={inputStyle}
          />
          <button onClick={() => setShowKey(v => !v)} title={showKey ? t("providers.hide_key") : t("providers.show_key")} style={iconBtn()}>
            {showKey ? "🙈" : "👁"}
          </button>
          {cfg.apiKey && (
            <button onClick={() => onUpdate({ apiKey: "" })} title={t("providers.clear_key")} style={{ ...iconBtn(), color: "#ef4444", borderColor: "#ef4444" }}>
              ×
            </button>
          )}
        </div>
      </div>

      {meta && !meta.requires_key && (
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, lineHeight: 1.4 }}>
          ℹ {t("providers.optional_key")}
        </p>
      )}

      {/* Key configured badge */}
      {cfg.apiKey && (
        <div style={{
          marginTop: 8, padding: "5px 10px", borderRadius: 6,
          background: "var(--bg-hover)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ color: "#22c55e" }}>✓</span>
          {t("providers.key_configured")}
          {providerId === "deepl" && (
            <span style={{ marginLeft: "auto", fontFamily: "monospace", color: "var(--text-3)" }}>
              {(cfg.variant ?? "free") === "pro" ? "Pro" : "Free"}
            </span>
          )}
        </div>
      )}
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
          <button onClick={openLogsFolder} style={{ ...smallBtnStyle(), display: "flex", alignItems: "center", gap: 5 }}>
            <IconFolder size={13} /> {t("settings_modal.sys.log_open_folder")}
          </button>
          <button onClick={viewLogFile} style={{ ...smallBtnStyle(), display: "flex", alignItems: "center", gap: 5 }}>
            <IconFile size={13} /> {t("settings_modal.sys.log_view_file")}
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
