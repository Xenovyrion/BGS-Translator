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
  plugin_name:  string;
  plugin_path?: string;
  author:       string;
  description:  string;
  masters:      string[];
  is_localized: boolean;
  version?:     number;
  entry_count:  number;
  entries:      TranslationEntry[];
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
  if (score >= 0.90) return "#22c55e"; // green
  if (score >= 0.75) return "#eab308"; // yellow
  return "#f97316";                    // orange
}

/** Returns a short human-readable label for a fuzzy score percentage. */
export function fuzzyScoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
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
