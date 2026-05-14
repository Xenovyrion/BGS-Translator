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
import { DEFAULT_SHORTCUTS, DEFAULT_EDIT_SHORTCUTS } from "../../types";

type Tab = "apparence" | "raccourcis" | "orthographe" | "database" | "divers" | "systeme";
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

  const TABS: Array<{ id: Tab; labelKey: string; icon: string }> = [
    { id: "apparence",   labelKey: "settings_modal.tab_appearance",   icon: "✦" },
    { id: "raccourcis",  labelKey: "settings_modal.tab_shortcuts",    icon: "⌨" },
    { id: "orthographe", labelKey: "settings_modal.tab_spellcheck",   icon: "✓" },
    { id: "database",    labelKey: "settings_modal.tab_database",     icon: "▤" },
    { id: "divers",      labelKey: "settings_modal.tab_misc",         icon: "⋮" },
    { id: "systeme",     labelKey: "settings_modal.tab_system",       icon: "⚙" },
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
          {tab === "apparence"   && <AppearanceTab   settings={settings} onUpdate={onUpdate} onOpenThemeManager={onOpenThemeManager} onResetLayout={onResetLayout} />}
          {tab === "raccourcis"  && <ShortcutsTab   settings={settings} onUpdate={onUpdate} />}
          {tab === "orthographe" && <SpellCheckTab  settings={settings} onUpdate={onUpdate} />}
          {tab === "database"    && <DatabaseTab    settings={settings} onUpdate={onUpdate} />}
          {tab === "divers"      && <DiversTab      settings={settings} onUpdate={onUpdate} defaultExportDir={defaultExportDir} />}
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

function ShortcutRow({ label, value, onChangeDef, onReset, pressKeyLabel, resetLabel }: {
  label: string; value: ShortcutDef; onChangeDef: (d: ShortcutDef) => void;
  onReset: () => void; pressKeyLabel: string; resetLabel: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--text-2)", width: 220 }}>{label}</span>
      <ShortcutKeyInput value={value} onChange={onChangeDef} pressKeyLabel={pressKeyLabel} />
      <button onClick={onReset} style={{ fontSize: 10, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>
        {resetLabel}
      </button>
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
    <>
      <Section label={t("settings_modal.shortcuts.section")}>
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
    </>
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
      <Section label={t("spellcheck.section_title")}>
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
                    padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    border: "1px solid #ef4444", background: "none",
                    color: "#ef4444", opacity: deleting === d.lang ? 0.5 : 1,
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
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                  border: "1px solid var(--accent)", background: "none",
                  color: "var(--accent)", opacity: downloading === d.lang ? 0.5 : 1,
                  flexShrink: 0,
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

  useEffect(() => { refresh(); }, [refresh]);

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
              flex: 1, height: 32, padding: "0 10px", borderRadius: 7, fontSize: 11,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", outline: "none", fontFamily: "monospace", boxSizing: "border-box",
            }}
          />
          <button onClick={pickDbFolder} title={t("settings_modal.db.folder_pick_title")} style={iconBtn()}>📁</button>
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
                    style={{ ...smallBtnStyle(), fontSize: 11 }}
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
                          style={{ height: 32, padding: "0 8px", borderRadius: 6, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}
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
                          style={{ height: 32, padding: "0 8px", borderRadius: 6, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
                          {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <label style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>
                          {t("settings_modal.db.default_dst")}
                        </label>
                        <select value={defForm.dstLang} onChange={(e) => setDefForm(f => f ? { ...f, dstLang: e.target.value } : f)}
                          style={{ height: 32, padding: "0 8px", borderRadius: 6, fontSize: 12, background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
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
      <Section label={t("settings_modal.misc.export_folder_section")}>
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
          <button onClick={pickExportFolder} title={t("settings_modal.misc.export_folder_pick_title")} style={iconBtn()}>📁</button>
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
              flex: 1, height: 32, padding: "0 10px", borderRadius: 6, fontSize: 10,
              background: "var(--bg-hover)", color: "var(--accent)",
              border: "1px solid var(--border)", fontFamily: "monospace", outline: "none", boxSizing: "border-box",
            }}
          />
          <button onClick={pickLogFolder} title={t("settings_modal.sys.log_pick_title")} style={iconBtn()}>📁</button>
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
    height: 32, padding: "0 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 500,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", boxSizing: "border-box",
    display: "flex", alignItems: "center", flexShrink: 0,
  };
}

function iconBtn(): React.CSSProperties {
  return {
    height: 32, width: 32, padding: 0, borderRadius: 6, cursor: "pointer", fontSize: 14,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box",
  };
}

function Section({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--text-3)",
        textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
        display: "flex", alignItems: "center",
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
