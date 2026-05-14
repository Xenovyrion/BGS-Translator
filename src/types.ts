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
}

export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  nextEntry:        { key: "ArrowDown" },
  prevEntry:        { key: "ArrowUp" },
  copyOriginal:     { key: "c", ctrl: true },
  pasteTranslation: { key: "v", ctrl: true },
  validateEntry:    { key: "Enter", ctrl: true },
};
