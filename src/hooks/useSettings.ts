import { useState, useEffect, useCallback } from "react";
import { THEME_PRESETS } from "../themes";
import type { ThemePreset } from "../themes";
import i18n from "../i18n";
import { type KeyboardShortcuts, DEFAULT_SHORTCUTS } from "../types";

export interface AppSettings {
  themeId:          string;
  customThemeVars:  Record<string, string>;
  customThemes:     ThemePreset[];           // themes created by the user
  language:         string;
  targetLanguage:   string;
  debugMode:        boolean;
  alternateRows:    boolean;
  shortcuts:        KeyboardShortcuts;
  dbFolder:         string;
  logFolder:        string;
  autosaveInterval: number; // minutes; 0 = disabled
}

const STORAGE_KEY = "bgstranslator_settings_v1";

export const DEFAULT_SETTINGS: AppSettings = {
  themeId:          "dark",
  customThemeVars:  {},
  customThemes:     [],
  language:         "",
  targetLanguage:   "fr",
  debugMode:        false,
  alternateRows:    true,
  shortcuts:        DEFAULT_SHORTCUTS,
  dbFolder:         "",
  logFolder:        "",
  autosaveInterval: 0,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
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

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
