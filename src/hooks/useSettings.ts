import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { THEME_PRESETS } from "../themes";
import type { ThemePreset } from "../themes";
import i18n from "../i18n";
import { type KeyboardShortcuts, DEFAULT_SHORTCUTS, type EditPanelShortcuts, DEFAULT_EDIT_SHORTCUTS, type FuzzySettings, DEFAULT_FUZZY_SETTINGS, type ProviderEntry, DEFAULT_PROVIDER_ENTRIES } from "../types";

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
  providerEntries: DEFAULT_PROVIDER_ENTRIES,
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

        // ── Migrate to multi-provider providerEntries (Phase 2) ───────────────
        let providerEntries: ProviderEntry[];

        if (Array.isArray(parsed.providerEntries)) {
          // Already Phase 2 format — merge with DEFAULT_PROVIDER_ENTRIES so newly
          // added built-ins appear (disabled by default) after an app update.
          const savedMap = new Map<string, ProviderEntry>(
            parsed.providerEntries.map((e: ProviderEntry) => [e.id, e])
          );
          const builtinIds = new Set(DEFAULT_PROVIDER_ENTRIES.map(e => e.id));

          providerEntries = [
            // Built-ins: keep saved state, fill gaps with defaults
            ...DEFAULT_PROVIDER_ENTRIES.map(def => savedMap.get(def.id) ?? def),
            // Custom entries (ids not in built-in set)
            ...parsed.providerEntries.filter((e: ProviderEntry) => !builtinIds.has(e.id)),
          ];
        } else {
          // Phase 1 / legacy format — build providerEntries from old fields
          providerEntries = DEFAULT_PROVIDER_ENTRIES.map(def => {
            const saved = { ...def };

            // Migrate deepl API key from deeplApiKey / deeplApiType
            if (def.id === "deepl" && parsed.deeplApiKey) {
              saved.enabled = parsed.activeProviderId === "deepl" || !!parsed.deeplApiKey;
              saved.config  = { apiKey: parsed.deeplApiKey, variant: parsed.deeplApiType ?? "free" };
            }

            // Migrate other providers from providerConfigs
            if (parsed.providerConfigs?.[def.id]) {
              saved.enabled = parsed.activeProviderId === def.id;
              saved.config  = { ...parsed.providerConfigs[def.id] };
            }

            return saved;
          });
        }

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

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
