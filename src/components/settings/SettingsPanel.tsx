import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { THEME_PRESETS } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";
import type { ShortcutDef, KeyboardShortcuts } from "../../types";
import { DEFAULT_SHORTCUTS } from "../../types";

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
