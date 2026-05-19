// ── Mirror types for Rust structs (serialized via Tauri) ─────────────────────

export type StringFileKind = "strings" | "dlstrings" | "ilstrings";

export type StringSource =
  | { type: "Inline"; sub_type: string }
  | { type: "Localized"; string_id: number; kind: StringFileKind };

export type EntryStatus = "untranslated" | "pending" | "validated" | "ignored";

export interface TranslationEntry {
  form_id:     number;
  record_type: string;
  editor_id:   string;
  sub_type:    string;
  original:    string;
  translated:  string;
  status:      EntryStatus;
  source:      StringSource;
  /** Unique key assigned on the frontend at load time (not serialized by Rust). */
  _idx?:       number;
}

export interface PluginInfo {
  plugin_name:      string;
  plugin_path?:     string;
  author:           string;
  description:      string;
  masters:          string[];
  is_localized:     boolean;
  /** True when source is a standalone .strings/.dlstrings/.ilstrings file (not a plugin). */
  is_strings_only?: boolean;
  version?:         number;
  entry_count:      number;
  entries:          TranslationEntry[];
}

/** Metadata returned by open_plugin_cmd — entries are streamed separately via events. */
export type PluginMetadata = Omit<PluginInfo, "entries">;

export interface SessionListItem {
  id:               string;
  plugin_name:      string;
  plugin_path:      string;
  entry_count:      number;
  translated_count: number;
  progress_percent: number;
  saved_at:         string;  // ISO 8601
}

export interface TranslationSession {
  plugin_path:     string;
  plugin_name:     string;
  plugin_info:     Omit<PluginInfo, "entries" | "entry_count" | "plugin_name">;
  entries:         TranslationEntry[];
  target_language: string;
}

export interface DbInfo {
  name:        string;
  game:        string;
  lang_from:   string;
  lang_to:     string;
  entry_count: number;
  read_only:   boolean;
}

// ── Per-group stats (by record type) ─────────────────────────────────────────

export interface GroupStats {
  record_type:  string;
  total:        number;
  validated:    number;
  pending:      number;
  untranslated: number;
  ignored:      number;
}

// ── UI filters ────────────────────────────────────────────────────────────────

export type FilterMode = "all" | "untranslated" | "pending" | "validated" | "ignored";

export type View = "home" | "translation" | "settings";

// ── Table sort ────────────────────────────────────────────────────────────────

export interface SortConfig {
  column: "form_id" | "record_type" | "sub_type" | "original" | "translated" | "status";
  dir:    "asc" | "desc";
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

export interface ShortcutDef {
  key:    string;   // e.g. "ArrowDown", "c", "v", "Enter"
  ctrl?:  boolean;
  alt?:   boolean;
  shift?: boolean;
}

export interface KeyboardShortcuts {
  nextEntry:        ShortcutDef;  // next row
  prevEntry:        ShortcutDef;  // previous row
  copyOriginal:     ShortcutDef;  // copy original text
  pasteTranslation: ShortcutDef;  // paste into translation
  validateEntry:    ShortcutDef;  // validate entry
  globalFind:       ShortcutDef;  // open global find & replace modal
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  nextEntry:        { key: "ArrowDown" },
  prevEntry:        { key: "ArrowUp" },
  copyOriginal:     { key: "c", ctrl: true },
  pasteTranslation: { key: "v", ctrl: true },
  validateEntry:    { key: "Enter", ctrl: true },
  globalFind:       { key: "h", ctrl: true, shift: true },
};

// ── Edit-panel shortcuts (fired while the translation textarea is focused) ────

export interface EditPanelShortcuts {
  find:        ShortcutDef;
  replace:     ShortcutDef;
  opTrim:      ShortcutDef;
  opUpper:     ShortcutDef;
  opLower:     ShortcutDef;
  opStripTags: ShortcutDef;
}

export const DEFAULT_EDIT_SHORTCUTS: EditPanelShortcuts = {
  find:        { key: "f", ctrl: true },
  replace:     { key: "h", ctrl: true },
  opTrim:      { key: "t", ctrl: true, shift: true },
  opUpper:     { key: "u", ctrl: true, shift: true },
  opLower:     { key: "l", ctrl: true, shift: true },
  opStripTags: { key: "b", ctrl: true, shift: true },
};

// ── Personal DB types ─────────────────────────────────────────────────────────

export interface PersonalDbInfo {
  name:        string;
  path:        string;
  game:        string;
  lang_from:   string;
  lang_to:     string;
  entry_count: number;
}

export interface PersonalDbFileInfo {
  name:        string;
  path:        string;
  size:        number;
  game:        string;
  lang_from:   string;
  lang_to:     string;
  entry_count: number;
}

// ── Compare / Diff types ──────────────────────────────────────────────────────

export type ChangeKind = "added" | "removed" | "modified" | "unchanged";
export type TranslationSource = "session" | "ref_db";

export interface FieldDiff {
  sub_type:           string;
  text_old:           string | null;
  text_new:           string | null;
  translation:        string | null;
  translation_source: TranslationSource | null;
  change_kind:        ChangeKind;
}

export interface RecordDiff {
  form_id:           number;
  editor_id:         string;
  record_type:       string;
  change_kind:       ChangeKind;
  fields:            FieldDiff[];
  recoverable_count: number;
}

export interface DiffStats {
  added:               number;
  removed:             number;
  modified:            number;
  unchanged:           number;
  recoverable:         number;
  total_fields_changed: number;
}

export interface PluginDiffResult {
  file_old: string;
  file_new: string;
  stats:    DiffStats;
  records:  RecordDiff[];
}

// ── Fuzzy matching types ──────────────────────────────────────────────────────

/** A (original, translated) pair passed to the fuzzy engine as a source. */
export interface FuzzySourceEntry {
  original:   string;
  translated: string;
  /** `"session"` | `"personal_db"` */
  origin:     string;
}

/** A single entry for which a fuzzy match is requested. */
export interface FuzzyRequest {
  form_id:  number;
  sub_type: string;
  original: string;
}

/** The best fuzzy match found for one {@link FuzzyRequest}. */
export interface FuzzyMatch {
  /** Echoed from the request for `(form_id, sub_type, original)` correlation. */
  form_id:     number;
  sub_type:    string;
  /** Echoed query string — used as disambiguation key for quest stages. */
  original:    string;
  /** Suggested translation text. */
  suggested:   string;
  /** Similarity score 0–1. */
  score:       number;
  /** Source that produced this match: `"session"` | `"personal_db"` | `"ref_db"`. */
  origin:      FuzzyOrigin;
  /** The source string that was matched (shown to the user for context). */
  matched_src: string;
  /** Algorithm used: `"jaro_winkler"` | `"levenshtein"`. */
  algorithm:   "jaro_winkler" | "levenshtein";
}

export type FuzzyOrigin = "session" | "personal_db" | "ref_db";

/** Fuzzy settings stored in localStorage (mirrored in useSettings). */
export interface FuzzySettings {
  /** Enable automatic fuzzy scan after plugin load. */
  auto_enabled:   boolean;
  /** Jaro-Winkler threshold for short strings (0–1). Default 0.78. */
  threshold_jw:   number;
  /** Levenshtein threshold for long strings (0–1). Default 0.65. */
  threshold_lev:  number;
  /** Which sources to include. */
  use_session:    boolean;
  use_personal_db: boolean;
}

export const DEFAULT_FUZZY_SETTINGS: FuzzySettings = {
  auto_enabled:    true,
  threshold_jw:    0.78,
  threshold_lev:   0.65,
  use_session:     true,
  use_personal_db: true,
};

/** Returns a CSS color for a fuzzy score (green → yellow → orange). */
export function fuzzyScoreColor(score: number): string {
  if (score >= 0.90) return "var(--fuzzy-high)";
  if (score >= 0.75) return "var(--fuzzy-mid)";
  return "var(--fuzzy-low)";
}

// ── Provider visual style ─────────────────────────────────────────────────────

export interface ProviderStyle {
  /** Main brand color — text, icon, border tint. */
  color:    string;
  /** Background when button is idle (very transparent tint). */
  bgIdle:   string;
  /** Background when button is active / loading (solid). */
  bgActive: string;
  /** Border color. */
  border:   string;
  /** Short badge letter shown inside the button icon area. */
  letter:   string;
}

/**
 * Returns the visual style for a translation provider button.
 * Falls back to the theme accent color for unknown / custom providers.
 */
export function getProviderStyle(id: string): ProviderStyle {
  switch (id) {
    case "deepl":
      return { color: "#3b82f6", bgIdle: "rgba(59,130,246,0.10)",  bgActive: "#2563eb", border: "rgba(59,130,246,0.45)", letter: "D"  };
    case "ollama":
      return { color: "#22c55e", bgIdle: "rgba(34,197,94,0.10)",   bgActive: "#16a34a", border: "rgba(34,197,94,0.45)",  letter: "Ol" };
    case "claude":
      return { color: "#d97706", bgIdle: "rgba(217,119,6,0.10)",   bgActive: "#b45309", border: "rgba(217,119,6,0.45)", letter: "Cl" };
    case "openai":
      return { color: "#10a37f", bgIdle: "rgba(16,163,127,0.10)",  bgActive: "#0d9268", border: "rgba(16,163,127,0.45)",letter: "Gpt"};
    case "cohere":
      return { color: "#8b5cf6", bgIdle: "rgba(139,92,246,0.10)",  bgActive: "#7c3aed", border: "rgba(139,92,246,0.45)",letter: "Co" };
    case "launcher_deepl":
      return { color: "#3b82f6", bgIdle: "transparent", bgActive: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.40)", letter: "D"  };
    case "launcher_google":
      return { color: "#4285f4", bgIdle: "transparent", bgActive: "rgba(66,133,244,0.12)",  border: "rgba(66,133,244,0.40)", letter: "G"  };
    case "launcher_bing":
      return { color: "#008272", bgIdle: "transparent", bgActive: "rgba(0,130,114,0.12)",   border: "rgba(0,130,114,0.40)",  letter: "Bi" };
    default:
      // Custom AI or unknown provider: use theme accent
      return { color: "var(--accent)", bgIdle: "var(--accent-dim)", bgActive: "var(--accent)", border: "rgba(59,130,246,0.45)", letter: "?"  };
  }
}

/** Returns a short human-readable label for a fuzzy score percentage. */
export function fuzzyScoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// ── Translation providers ─────────────────────────────────────────────────────

export type ProviderKind = "official_api" | "free_api" | "browser_launcher" | "custom";

/** Metadata about a built-in provider (received from Rust via get_providers_cmd). */
export interface ProviderMeta {
  id:             string;
  name:           string;
  kind:           ProviderKind;
  requires_key:   boolean;
  supports_batch: boolean;
  is_launcher:    boolean;
}

/** Per-provider config stored in localStorage (camelCase, sent as-is to Rust). */
export interface StoredProviderConfig {
  apiKey?:          string;
  variant?:         string;   // deepl: "free"/"pro" | microsoft: region code
  endpoint?:        string;   // libretranslate self-hosted, custom URL, browser template, or Ollama base URL
  authHeader?:      string;   // custom: "Authorization: Bearer {api_key}"
  requestTemplate?: string;   // custom: JSON body template
  responsePath?:    string;   // custom: "translations[0].text"
  // ── AI / LLM provider fields ────────────────────────────────────────────────
  model?:        string;   // AI: model name ("llama3", "claude-haiku-4-5", "command-r-plus"…)
  systemPrompt?: string;   // AI: editable system prompt (supports {source_lang}, {target_lang})
  temperature?:  number;   // AI: sampling temperature 0.0–1.0
  maxTokens?:    number;   // AI: maximum output tokens
  customModels?: string[]; // AI (Ollama): user-added custom model names, persisted separately from presets
}

/** Full provider config sent to Rust — extends StoredProviderConfig with id. */
export interface ProviderConfig extends StoredProviderConfig {
  id: string;
}

/**
 * One entry in the user's provider list (built-in or custom).
 * Stored in localStorage as part of AppSettings.providerEntries.
 */
export interface ProviderEntry {
  /** Built-in id ("deepl", "microsoft", "ollama", …) or UUID for custom providers. */
  id:          string;
  /** Whether this provider is active (button visible, shortcut fires). */
  enabled:     boolean;
  /** "api" for translation APIs, "browser" for browser launchers, "ai" for LLM providers. */
  kind:        "api" | "browser" | "ai";
  /** Keyboard shortcut string, e.g. "F9", "Shift+F10". Empty = none. */
  shortcut?:   string;
  /** Provider-specific configuration (API keys, endpoints, model, prompt…). */
  config:      StoredProviderConfig;
  // ── Custom-provider-only fields ─────────────────────────────────────────
  isCustom?:   boolean;
  /** User-defined display name (custom providers only). */
  customName?: string;
}

/** Default system prompt for AI providers — stored in config if the user hasn't customized it. */
export const DEFAULT_AI_SYSTEM_PROMPT =
`You are a professional video game translator specializing in Bethesda RPGs (Starfield, Skyrim, Fallout).
Translate from {source_lang} to {target_lang}.

Rules:
- Return ONLY the translated text — no explanations, no quotes, no comments
- Preserve all special symbols, brackets and placeholders EXACTLY as they appear
- Preserve all line breaks exactly
- Match the tone of the original (dialogue, lore, UI label, etc.)
- Keep proper nouns untranslated unless you know the official localized version`;

/** Default provider list — all built-ins disabled, with suggested Fx shortcuts. */
export const DEFAULT_PROVIDER_ENTRIES: ProviderEntry[] = [
  { id: "deepl",           enabled: false, kind: "api",     shortcut: "F9",  config: {} },
  { id: "microsoft",       enabled: false, kind: "api",     shortcut: "F10", config: {} },
  { id: "libretranslate",  enabled: false, kind: "api",     shortcut: "F11", config: {} },
  { id: "mymemory",        enabled: false, kind: "api",     shortcut: "F12", config: {} },
  { id: "launcher_deepl",  enabled: false, kind: "browser", shortcut: "F5",  config: {} },
  { id: "launcher_google", enabled: false, kind: "browser", shortcut: "F6",  config: {} },
  { id: "launcher_bing",   enabled: false, kind: "browser", shortcut: "F7",  config: {} },
];

/** Default AI provider list — all disabled, F1–F4. */
export const DEFAULT_AI_PROVIDER_ENTRIES: ProviderEntry[] = [
  {
    id: "ollama", enabled: false, kind: "ai", shortcut: "F1",
    config: { endpoint: "http://localhost:11434", model: "llama3.2" },
  },
  {
    id: "claude", enabled: false, kind: "ai", shortcut: "F2",
    config: { model: "claude-haiku-4-5" },
  },
  {
    id: "cohere", enabled: false, kind: "ai", shortcut: "F3",
    config: { model: "command-r-plus" },
  },
  {
    id: "openai", enabled: false, kind: "ai", shortcut: "F4",
    config: { model: "gpt-4o-mini" },
  },
];

/**
 * A provider ready to use — built from ProviderEntry + ProviderMeta lookup.
 * Passed to EditPanel as an array.
 */
export interface ActiveProvider {
  id:         string;
  name:       string;
  shortcut?:  string;
  isLauncher: boolean;
  config:     ProviderConfig;
}

/** Shortcut options shown in the settings shortcut selector. */
export const SHORTCUT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "—" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: `F${i + 1}`, label: `F${i + 1}` })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: `Shift+F${i + 1}`, label: `Shift+F${i + 1}` })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: `Ctrl+F${i + 1}`, label: `Ctrl+F${i + 1}` })),
];

/** Returns true when a KeyboardEvent matches a provider shortcut string. */
export function matchProviderShortcut(e: KeyboardEvent, shortcut: string | undefined): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split("+");
  const key   = parts[parts.length - 1];
  const shift = parts.includes("Shift");
  const ctrl  = parts.includes("Ctrl");
  return e.key === key &&
    !!(e.ctrlKey || e.metaKey) === ctrl &&
    !!e.shiftKey === shift &&
    !e.altKey;
}

/** Maps a Rust provider error code to a human-readable message via i18next. */
export function mapProviderError(code: string, t: (k: string, o?: object) => string): string {
  const map: Record<string, string> = {
    deepl_invalid_key:                t("deepl.error_invalid_key"),
    deepl_quota_exceeded:             t("deepl.error_quota"),
    deepl_no_api_key:                 t("deepl.error_no_api_key"),
    deepl_too_many_requests:          t("deepl.error_too_many_requests"),
    microsoft_no_api_key:             t("providers.error_microsoft_no_key"),
    microsoft_invalid_key:            t("providers.error_microsoft_invalid_key"),
    microsoft_quota_exceeded:         t("providers.error_microsoft_quota"),
    microsoft_too_many_requests:      t("providers.error_microsoft_rate"),
    libretranslate_forbidden:         t("providers.error_libretranslate_forbidden"),
    libretranslate_too_many_requests: t("providers.error_libretranslate_rate"),
    libretranslate_server_error:      t("providers.error_libretranslate_server"),
    mymemory_quota_exceeded:          t("providers.error_mymemory_quota"),
    custom_no_endpoint:               t("providers.error_custom_no_endpoint"),
    custom_no_request_template:       t("providers.error_custom_no_template"),
    // AI providers
    ai_claude_no_key:      t("providers.ai_error_claude_no_key"),
    ai_claude_invalid_key: t("providers.ai_error_claude_invalid_key"),
    ai_claude_rate_limit:  t("providers.ai_error_rate_limit"),
    ai_claude_overloaded:  t("providers.ai_error_overloaded"),
    ai_claude_empty:       t("providers.ai_error_empty"),
    ai_cohere_no_key:      t("providers.ai_error_cohere_no_key"),
    ai_cohere_invalid_key: t("providers.ai_error_cohere_invalid_key"),
    ai_cohere_rate_limit:  t("providers.ai_error_rate_limit"),
    ai_cohere_empty:       t("providers.ai_error_empty"),
    ai_custom_no_endpoint: t("providers.ai_error_custom_no_endpoint"),
    ai_custom_invalid_key: t("providers.ai_error_custom_invalid_key"),
    ai_custom_rate_limit:  t("providers.ai_error_rate_limit"),
    ai_custom_empty:       t("providers.ai_error_empty"),
    ollama_not_running:        t("providers.ai_error_ollama_not_running"),
    ollama_model_not_found:    t("providers.ai_error_ollama_model_not_found"),
  };
  if (map[code]) return map[code];
  if (code.startsWith("custom_invalid_request_template")) return t("providers.error_custom_invalid_template");
  if (code.startsWith("custom_path_not_found"))           return t("providers.error_custom_path");
  if (code.startsWith("ai_network:"))   return t("providers.ai_error_network");
  if (code.startsWith("ai_parse:"))     return t("providers.ai_error_parse");
  if (code.startsWith("ollama_http:"))  return t("providers.ai_error_ollama_http", { code: code.split(":")[1] });
  return code;
}

/** Returns true when a keyboard event matches a ShortcutDef. */
export function matchShortcut(
  e: { key: string; ctrlKey: boolean; metaKey?: boolean; altKey: boolean; shiftKey: boolean },
  def: ShortcutDef,
): boolean {
  return e.key.toLowerCase() === def.key.toLowerCase() &&
    !!(e.ctrlKey || e.metaKey)  === !!def.ctrl  &&
    !!e.altKey   === !!def.alt   &&
    !!e.shiftKey === !!def.shift;
}

/** Formats a ShortcutDef as a human-readable string, e.g. "Ctrl+⇧+U". */
export function formatShortcut(def: ShortcutDef): string {
  const parts: string[] = [];
  if (def.ctrl)  parts.push("Ctrl");
  if (def.alt)   parts.push("Alt");
  if (def.shift) parts.push("⇧");
  parts.push(def.key.length === 1 ? def.key.toUpperCase() : def.key);
  return parts.join("+");
}
