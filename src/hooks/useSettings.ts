import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { THEME_PRESETS } from "../themes";
import type { ThemePreset } from "../themes";
import i18n from "../i18n";
import { type KeyboardShortcuts, DEFAULT_SHORTCUTS, type EditPanelShortcuts, DEFAULT_EDIT_SHORTCUTS, type FuzzySettings, DEFAULT_FUZZY_SETTINGS, type StoredProviderConfig } from "../types";

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
  // DeepL auto-translation (legacy — kept for migration, use providerConfigs instead)
  deeplApiKey:    string;
  deeplApiType:   string;   // "free" | "pro"
  // Translation provider system
  activeProviderId:  string;                             // ID of the active provider
  providerConfigs:   Record<string, StoredProviderConfig>; // per-provider config
  // Personal DB
  personalDbFolder:   string;  // folder containing .bgtx files (empty = default personal_dbs/)
  activePersonalDbPath: string; // path of the active personal DB (empty = none)
  personalDbAutoApply:  boolean; // auto-apply personal DB when opening a plugin
  // Fuzzy matching
  fuzzy: FuzzySettings;
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
  deeplApiKey:   "",
  deeplApiType:  "free",
  activeProviderId:  "deepl",
  providerConfigs:   {},
  personalDbFolder:     "",
  activePersonalDbPath: "",
  personalDbAutoApply:  true,
  fuzzy: { ...DEFAULT_FUZZY_SETTINGS },
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Migrate legacy deeplApiKey/deeplApiType into providerConfigs.deepl
        const providerConfigs: Record<string, StoredProviderConfig> = { ...(parsed.providerConfigs ?? {}) };
        if (!providerConfigs.deepl?.apiKey && parsed.deeplApiKey) {
          providerConfigs.deepl = {
            ...providerConfigs.deepl,
            apiKey:  parsed.deeplApiKey,
            variant: parsed.deeplApiType ?? "free",
          };
        }
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          providerConfigs,
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

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
