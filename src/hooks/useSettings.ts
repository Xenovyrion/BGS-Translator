import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { THEME_PRESETS } from "../themes";
import type { ThemePreset } from "../themes";
import i18n from "../i18n";
import { type KeyboardShortcuts, DEFAULT_SHORTCUTS, type EditPanelShortcuts, DEFAULT_EDIT_SHORTCUTS, type FuzzySettings, DEFAULT_FUZZY_SETTINGS, type ProviderEntry, DEFAULT_PROVIDER_ENTRIES, DEFAULT_AI_PROVIDER_ENTRIES } from "../types";

export interface DefaultDbEntry {
  path:    string;
  game:    string;
  srcLang: string;
  dstLang: string;
}

export interface AppSettings {
  themeId:          string;
  customThemeVars:  Record<string, string>;
  customThemes:     ThemePreset[];           // themes created by the user
  language:         string;
  targetLanguage:   string;
  debugMode:        boolean;
  alternateRows:        boolean;
  rowHover:             boolean;
  propagateIdentical:   boolean;  // sync identical originals when translating
  autoLoadSession:      boolean;  // auto-load matching session on plugin open
  dbApplyValidates:     boolean;  // DB match → Validated (vs Pending)
  shortcuts:            KeyboardShortcuts;
  editShortcuts:        EditPanelShortcuts;
  dbFolder:         string;
  exportFolder:     string;  // default output folder for generated plugins
  silentExport:     boolean; // skip save dialog — write directly to the default path
  logFolder:        string;
  autosaveInterval: number; // minutes; 0 = disabled
  defaultDbs:       Record<string, DefaultDbEntry>; // keyed by game name (lowercase)
  // Spell check
  spellLang:      string;   // active dictionary lang code; "" = disabled
  spellRealtime:  boolean;  // check while typing
  spellDebounce:  number;   // debounce delay in ms for real-time mode
  // Translation provider system (multi-provider, Phase 2)
  providerEntries: ProviderEntry[];
  // Personal DB
  personalDbFolder:   string;  // folder containing .bgtx files (empty = default personal_dbs/)
  activePersonalDbPath: string; // path of the active personal DB (empty = none)
  personalDbAutoApply:  boolean; // auto-apply personal DB when opening a plugin
  // Fuzzy matching
  fuzzy: FuzzySettings;
  // Strings export mode (localized plugins: Starfield, Fallout 4…)
  exportStringsAsBa2: boolean; // true = pack into a BA2 archive; false = loose files
  // Log retention: number of days before old log files are purged (0 = never)
  logRetentionDays: number;
}

const STORAGE_KEY = "bgstranslator_settings_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  themeId:          "dark",
  customThemeVars:  {},
  customThemes:     [],
  language:         "",
  targetLanguage:   "fr",
  debugMode:        false,
  alternateRows:        true,
  rowHover:             true,
  propagateIdentical:   true,
  autoLoadSession:      false,
  dbApplyValidates:     true,
  shortcuts:            DEFAULT_SHORTCUTS,
  editShortcuts:        DEFAULT_EDIT_SHORTCUTS,
  dbFolder:         "",
  exportFolder:     "",
  silentExport:     false,
  logFolder:        "",
  autosaveInterval: 0,
  defaultDbs:       {},
  spellLang:     "",
  spellRealtime: false,
  spellDebounce: 600,
  providerEntries: [...DEFAULT_PROVIDER_ENTRIES, ...DEFAULT_AI_PROVIDER_ENTRIES],
  personalDbFolder:     "",
  activePersonalDbPath: "",
  personalDbAutoApply:  true,
  fuzzy: { ...DEFAULT_FUZZY_SETTINGS },
  exportStringsAsBa2: true,
  logRetentionDays: 30,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);

        // ── Migrate to multi-provider providerEntries (Phase 2) ───────────────
        let providerEntries: ProviderEntry[];

        // All built-in provider+AI entries (Phase 2 + Phase 3)
        const ALL_DEFAULTS = [...DEFAULT_PROVIDER_ENTRIES, ...DEFAULT_AI_PROVIDER_ENTRIES];
        const ALL_BUILTIN_IDS = new Set(ALL_DEFAULTS.map(e => e.id));

        if (Array.isArray(parsed.providerEntries)) {
          // Phase 2/3 format — merge with ALL_DEFAULTS so newly added built-ins
          // (e.g. AI providers added in Phase 3) appear disabled after an update.
          const savedMap = new Map<string, ProviderEntry>(
            parsed.providerEntries.map((e: ProviderEntry) => [e.id, e])
          );

          providerEntries = [
            // Built-ins: keep saved state, fill gaps with defaults
            ...ALL_DEFAULTS.map(def => savedMap.get(def.id) ?? def),
            // Custom entries (ids not in built-in set)
            ...parsed.providerEntries.filter((e: ProviderEntry) => !ALL_BUILTIN_IDS.has(e.id)),
          ];
        } else {
          // Phase 1 / legacy format — build providerEntries from old fields
          // AI providers just get their defaults (no legacy format to migrate from)
          providerEntries = ALL_DEFAULTS.map(def => {
            const saved = { ...def };

            // Migrate deepl API key from deeplApiKey / deeplApiType
            if (def.id === "deepl" && parsed.deeplApiKey) {
              saved.enabled = parsed.activeProviderId === "deepl" || !!parsed.deeplApiKey;
              saved.config  = { apiKey: parsed.deeplApiKey, variant: parsed.deeplApiType ?? "free" };
            }

            // Migrate other API providers from providerConfigs
            if (def.kind === "api" && parsed.providerConfigs?.[def.id]) {
              saved.enabled = parsed.activeProviderId === def.id;
              saved.config  = { ...parsed.providerConfigs[def.id] };
            }

            return saved;
          });
        }

        // ── Migrate legacy "custom_ai" built-in → user custom AI provider ─────────
        // custom_ai was removed from DEFAULT_AI_PROVIDER_ENTRIES; existing users
        // who have it configured keep it as a custom entry so nothing is lost.
        providerEntries = providerEntries.map(e => {
          if (e.id !== "custom_ai") return e;
          return { ...e, isCustom: true, customName: e.customName ?? "Custom AI" };
        });

        // ── Purge customModels pollution (bug: migration effect auto-added preset/default models) ──
        // Known built-in Ollama preset values + the old hard-coded default "llama3"
        const OLLAMA_PRESET_VALUES = new Set([
          "llama3", "llama3.2", "llama3.1", "mistral", "qwen2.5", "gemma2", "phi3", "mixtral",
        ]);
        providerEntries = providerEntries.map(e => {
          if (e.id !== "ollama" || !Array.isArray(e.config.customModels)) return e;
          const cleaned = e.config.customModels.filter(
            (m: string) => m && !OLLAMA_PRESET_VALUES.has(m.replace(/:latest$/, ""))
          );
          return cleaned.length === e.config.customModels.length
            ? e
            : { ...e, config: { ...e.config, customModels: cleaned } };
        });

        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          providerEntries,
          // Merge nested objects so new keys added in later versions always have a default
          shortcuts:     { ...DEFAULT_SHORTCUTS,       ...(parsed.shortcuts      ?? {}) },
          editShortcuts: { ...DEFAULT_EDIT_SHORTCUTS,  ...(parsed.editShortcuts  ?? {}) },
          fuzzy:         { ...DEFAULT_FUZZY_SETTINGS,  ...(parsed.fuzzy          ?? {}) },
        };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  });

  /* Apply the active theme (built-in or custom) */
  useEffect(() => {
    const allPresets = [...THEME_PRESETS, ...(settings.customThemes ?? [])];
    const preset     = allPresets.find(p => p.id === settings.themeId) ?? THEME_PRESETS[0];
    const merged     = { ...preset.vars, ...settings.customThemeVars };
    const root       = document.documentElement;
    Object.entries(merged).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [settings.themeId, settings.customThemeVars, settings.customThemes]);

  useEffect(() => {
    if (settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language]);

  /* Sync debug mode with the Rust backend — fires at startup and on change, never on modal open */
  useEffect(() => {
    invoke("set_debug_mode_cmd", { enabled: settings.debugMode }).catch(() => {});
  }, [settings.debugMode]);

  /* Purge old log files at startup and whenever retention period changes */
  useEffect(() => {
    const days = settings.logRetentionDays ?? 30;
    if (days > 0) {
      invoke("purge_logs_cmd", { maxAgeDays: days }).catch(() => {});
    }
  }, [settings.logRetentionDays]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
