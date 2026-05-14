import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect } from "react";
import { THEME_PRESETS } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";
import type { ShortcutDef, KeyboardShortcuts } from "../../types";
import { DEFAULT_SHORTCUTS } from "../../types";

interface DictionaryInfo {
  lang: string;
  name: string;
  installed: boolean;
}

interface Props {
  settings: AppSettings;
  onUpdate: (updates: Partial<AppSettings>) => void;
}

export default function SettingsPanel({ settings, onUpdate }: Props) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const checkUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const result = await invoke<{ version: string; notes?: string } | null>("check_update");
      setUpdateStatus(result ? `v${result.version} disponible` : t("update.up_to_date"));
    } catch (e) {
      setUpdateStatus(String(e));
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 600 }}>
      <h2 style={{ color: "var(--text-1)", fontSize: 20, fontWeight: 700, marginBottom: 28 }}>
        {t("settings.title")}
      </h2>

      {/* Theme */}
      <Section label={t("settings.theme")}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onUpdate({ themeId: p.id })}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                border: settings.themeId === p.id
                  ? "2px solid var(--accent)"
                  : "2px solid var(--border)",
                background: settings.themeId === p.id ? "var(--accent-dim)" : "var(--bg-card)",
                color: "var(--text-1)", fontSize: 13, fontWeight: 500,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.preview, flexShrink: 0 }} />
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      {/* Langue UI */}
      <Section label={t("settings.language")}>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { code: "fr", label: t("settings.lang_fr") },
            { code: "en", label: t("settings.lang_en") },
          ].map(({ code, label }) => (
            <button
              key={code}
              onClick={() => onUpdate({ language: code })}
              style={{
                padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                border: (settings.language || "fr") === code
                  ? "2px solid var(--accent)"
                  : "2px solid var(--border)",
                background: (settings.language || "fr") === code ? "var(--accent-dim)" : "var(--bg-card)",
                color: "var(--text-1)", fontSize: 13, fontWeight: 500,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {/* Langue cible de traduction */}
      <Section label={t("settings.target_language")}>
        <select
          value={settings.targetLanguage}
          onChange={(e) => onUpdate({ targetLanguage: e.target.value })}
          style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 13,
            background: "var(--bg-card)", color: "var(--text-1)",
            border: "1px solid var(--border)", cursor: "pointer",
          }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
          <option value="it">Italiano</option>
          <option value="pl">Polski</option>
          <option value="ru">Русский</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
        </select>
      </Section>

      {/* Logs */}
      <Section label="Logs">
        <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 10 }}>
          Les logs sont écrits automatiquement dans un fichier à chaque lancement.
          Chemin : <code style={{ fontSize: 11, color: "var(--accent)", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4 }}>%APPDATA%\io.github.startranslator\logs\startranslator.log</code>
        </p>
        <button
          onClick={() => openUrl("file:///" + encodeURI("%APPDATA%/io.github.startranslator/logs"))}
          style={{ padding: "7px 16px", borderRadius: 7, fontSize: 12, background: "var(--bg-hover)", color: "var(--text-1)", border: "1px solid var(--border)", cursor: "pointer" }}
        >
          Ouvrir le dossier de logs
        </button>
      </Section>

      {/* Vérification orthographique */}
      <SpellCheckSection settings={settings} onUpdate={onUpdate} />

      {/* Raccourcis clavier */}
      <Section label="Raccourcis clavier">
        <ShortcutsEditor
          shortcuts={settings.shortcuts ?? DEFAULT_SHORTCUTS}
          onChange={(sc) => onUpdate({ shortcuts: sc })}
        />
      </Section>

      {/* Updates */}
      <Section label={t("settings.updates")}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={checkUpdate}
            style={{
              padding: "8px 18px", borderRadius: 8, cursor: "pointer",
              background: "var(--accent)", color: "#fff",
              border: "none", fontSize: 13, fontWeight: 500,
            }}
          >
            {t("update.check")}
          </button>
          {updateStatus && (
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>{updateStatus}</span>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Spell check section ──────────────────────────────────────────────────────

function SpellCheckSection({ settings, onUpdate }: Props) {
  const { t } = useTranslation();
  const [dicts, setDicts] = useState<DictionaryInfo[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showManage, setShowManage] = useState(false);

  const loadDicts = () =>
    invoke<DictionaryInfo[]>("list_dictionaries_cmd").then(setDicts).catch(() => {});

  useEffect(() => { loadDicts(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const download = async (lang: string) => {
    setDownloading(lang);
    try {
      await invoke("download_dictionary_cmd", { lang });
      showToast(t("spellcheck.download_ok", { lang }));
      await loadDicts();
      if (!settings.spellLang) onUpdate({ spellLang: lang });
    } catch (e) {
      showToast(t("spellcheck.download_error", { error: String(e) }));
    } finally {
      setDownloading(null);
    }
  };

  const deleteDic = async (lang: string) => {
    try {
      await invoke("delete_dictionary_cmd", { lang });
      showToast(t("spellcheck.delete_ok", { lang }));
      await loadDicts();
      if (settings.spellLang === lang) onUpdate({ spellLang: "" });
    } catch (e) {
      showToast(t("spellcheck.download_error", { error: String(e) }));
    }
  };

  const installed = dicts.filter(d => d.installed);
  const available = dicts.filter(d => !d.installed);

  const inputStyle: React.CSSProperties = {
    padding: "7px 12px", borderRadius: 7, fontSize: 12,
    background: "var(--bg-hover)", color: "var(--text-1)",
    border: "1px solid var(--border)", cursor: "pointer",
    minWidth: 200,
  };
  const smallBtnStyle: React.CSSProperties = {
    padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
    border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-2)",
  };

  return (
    <Section label={t("spellcheck.section_title")}>
      {/* Active dictionary */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--text-2)", minWidth: 130 }}>
          {t("spellcheck.dictionary_label")}
        </span>
        <select
          value={settings.spellLang}
          onChange={e => onUpdate({ spellLang: e.target.value })}
          style={inputStyle}
        >
          <option value="">{t("spellcheck.no_dictionary")}</option>
          {installed.map(d => (
            <option key={d.lang} value={d.lang}>{d.name} ({d.lang})</option>
          ))}
        </select>
      </div>

      {/* Real-time toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
          <input
            type="checkbox"
            checked={settings.spellRealtime ?? false}
            onChange={e => onUpdate({ spellRealtime: e.target.checked })}
            style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
          />
          {t("spellcheck.realtime_label")}
        </label>
      </div>

      {/* Debounce slider (only when real-time is on) */}
      {settings.spellRealtime && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", minWidth: 130 }}>
            {t("spellcheck.debounce_label")}
          </span>
          <input
            type="range" min={200} max={2000} step={100}
            value={settings.spellDebounce ?? 600}
            onChange={e => onUpdate({ spellDebounce: Number(e.target.value) })}
            style={{ width: 140, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 12, color: "var(--text-3)", minWidth: 40 }}>
            {settings.spellDebounce ?? 600} ms
          </span>
        </div>
      )}

      {/* Manage dictionaries toggle */}
      <button
        onClick={() => setShowManage(m => !m)}
        style={{ ...smallBtnStyle, marginBottom: showManage ? 10 : 0, display: "flex", alignItems: "center", gap: 6 }}
      >
        {showManage ? "▾" : "▸"} {t("spellcheck.manage_title")}
      </button>

      {showManage && (
        <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Installed */}
          {installed.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {t("spellcheck.manage_installed")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {installed.map(d => (
                  <div key={d.lang} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-1)", flex: 1 }}>{d.name} <span style={{ color: "var(--text-3)", fontSize: 11 }}>({d.lang})</span></span>
                    <button onClick={() => deleteDic(d.lang)} style={{ ...smallBtnStyle, color: "#ef4444", borderColor: "#ef4444" }}>
                      {t("spellcheck.btn_delete")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available */}
          {available.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {t("spellcheck.manage_available")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {available.map(d => (
                  <div key={d.lang} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1 }}>{d.name} <span style={{ color: "var(--text-3)", fontSize: 11 }}>({d.lang})</span></span>
                    <button
                      onClick={() => download(d.lang)}
                      disabled={downloading === d.lang}
                      style={{ ...smallBtnStyle, color: "var(--accent)", borderColor: "var(--accent)", opacity: downloading === d.lang ? 0.5 : 1 }}
                    >
                      {downloading === d.lang ? t("spellcheck.downloading") : t("spellcheck.btn_download")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)", background: "var(--bg-hover)", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
          {toast}
        </div>
      )}
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ── Shortcuts editor ─────────────────────────────────────────────────────────

const SHORTCUT_LABELS: Record<keyof KeyboardShortcuts, string> = {
  nextEntry:        "Entrée suivante",
  prevEntry:        "Entrée précédente",
  copyOriginal:     "Copier le texte original",
  pasteTranslation: "Coller dans la traduction",
  validateEntry:    "Valider l'entrée",
  globalFind:       "Rechercher et remplacer (global)",
};

function formatShortcut(s: ShortcutDef): string {
  const parts: string[] = [];
  if (s.ctrl)  parts.push("Ctrl");
  if (s.alt)   parts.push("Alt");
  if (s.shift) parts.push("Shift");
  const keyLabel: Record<string, string> = {
    ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→",
    Enter: "↵", Escape: "Esc", " ": "Espace", Backspace: "⌫", Delete: "Suppr",
  };
  parts.push(keyLabel[s.key] ?? s.key.toUpperCase());
  return parts.join("+");
}

function ShortcutKeyInput({ value, onChange }: { value: ShortcutDef; onChange: (s: ShortcutDef) => void }) {
  const [recording, setRecording] = useState(false);

  return (
    <button
      tabIndex={0}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        // Ignore bare modifiers
        if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;
        onChange({
          key:   e.key,
          ctrl:  e.ctrlKey || e.metaKey || undefined,
          alt:   e.altKey || undefined,
          shift: e.shiftKey || undefined,
        });
        setRecording(false);
      }}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      style={{
        padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
        minWidth: 130, textAlign: "center", fontFamily: "monospace", fontWeight: 600,
        background: recording ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
        color: recording ? "var(--accent)" : "var(--text-1)",
        border: recording ? "1px solid var(--accent)" : "1px solid var(--border)",
        outline: "none",
      }}
    >
      {recording ? "Appuyez sur une touche…" : formatShortcut(value)}
    </button>
  );
}

function ShortcutsEditor({ shortcuts, onChange }: { shortcuts: KeyboardShortcuts; onChange: (s: KeyboardShortcuts) => void }) {
  const keys = Object.keys(SHORTCUT_LABELS) as Array<keyof KeyboardShortcuts>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {keys.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", width: 220 }}>
            {SHORTCUT_LABELS[k]}
          </span>
          <ShortcutKeyInput
            value={shortcuts[k]}
            onChange={(def) => onChange({ ...shortcuts, [k]: def })}
          />
          <button
            onClick={() => onChange({ ...shortcuts, [k]: DEFAULT_SHORTCUTS[k] })}
            style={{ fontSize: 10, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
            title="Réinitialiser"
          >
            ↩ défaut
          </button>
        </div>
      ))}
    </div>
  );
}
