import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PluginInfo, PluginMetadata, TranslationEntry, FilterMode, EntryStatus, GroupStats, SortConfig, TranslationSession, DbInfo, FuzzyMatch, FuzzySettings, FuzzySourceEntry } from "../types";
import type { DefaultDbEntry } from "./useSettings";

/** Unique key based on _idx (assigned at load time) to avoid collisions
 *  on records that have multiple sub-fields of the same type (e.g. QUST/CNAM). */
export function entryKey(e: TranslationEntry): string {
  return e._idx !== undefined ? String(e._idx) : `${e.form_id}-${e.sub_type}-${e.original}`;
}

// ── Game detection from master file list ──────────────────────────────────────

const MASTER_TO_GAME: Record<string, string> = {
  "starfield.esm":   "Starfield",
  "skyrim.esm":      "Skyrim SE",
  "skyrimse.esm":    "Skyrim SE",
  "enderal.esm":     "Enderal",
  "morrowind.esm":   "Morrowind",
  "oblivion.esm":    "Oblivion",
  "fallout4.esm":    "Fallout 4",
  "fallout76.esm":   "Fallout 76",
  "falloutnv.esm":   "Fallout: New Vegas",
  "fallout3.esm":    "Fallout 3",
};

export function detectGame(masters: string[]): string {
  for (const master of masters) {
    const key = master.toLowerCase();
    const game = MASTER_TO_GAME[key];
    if (game) return game;
  }
  return "";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlugin({
  propagateIdentical   = true,
  dbApplyValidates     = true,
  defaultDbs           = {},
  personalDbPath       = "",
  personalDbAutoApply  = true,
  fuzzySettings        = undefined,
  targetLang           = "en",
}: {
  propagateIdentical?:   boolean;
  dbApplyValidates?:     boolean;
  defaultDbs?:           Record<string, DefaultDbEntry>;
  personalDbPath?:       string;
  personalDbAutoApply?:  boolean;
  fuzzySettings?:        FuzzySettings;
  targetLang?:           string;
} = {}) {
  const [pluginInfo, setPluginInfo]         = useState<PluginInfo | null>(null);
  const [entries, setEntries]               = useState<TranslationEntry[]>([]);
  const [loading, setLoading]               = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [loadingStatus, setLoadingStatus]   = useState<string | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [filter, setFilter]               = useState<FilterMode>("all");
  const [search, setSearch]               = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TranslationEntry | null>(null);
  const [selectedKeys, setSelectedKeys]   = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig]       = useState<SortConfig | null>({ column: "form_id", dir: "asc" });
  const [columnFilters, setColumnFilters] = useState<Partial<Record<string, string>>>({});
  const [autoApplyResult, setAutoApplyResult]       = useState<{ refDb: number; personalDb: number; session: number } | null>(null);
  const [dbNotFound, setDbNotFound]                 = useState<string | null>(null);
  const [loadedDbInfo, setLoadedDbInfo]             = useState<DbInfo | null>(null);
  const [loadedDbPath, setLoadedDbPath]             = useState<string | null>(null);

  // ── Fuzzy matching state ──────────────────────────────────────────────────
  /** Map from entry `_idx` → best fuzzy match (pending suggestions). */
  const [fuzzyMatches,   setFuzzyMatches]   = useState<Map<number, FuzzyMatch>>(new Map());
  const [fuzzyScanning,  setFuzzyScanning]  = useState(false);
  const [filterFuzzyOnly, setFilterFuzzyOnly] = useState(false);

  // ── Shared reset helper ────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setSelectedEntry(null);
    setSelectedGroup(null);
    setSelectedKeys(new Set());
    setSortConfig({ column: "form_id", dir: "asc" });
    setColumnFilters({});
    setAutoApplyResult(null);
    setDbNotFound(null);
    setLoadedDbInfo(null);
    setLoadedDbPath(null);
    setFuzzyMatches(new Map());
    setFuzzyScanning(false);
    setFilterFuzzyOnly(false);
  }, []);

  // ── Internal: try to auto-load a DB matching the given game ─────────────

  const tryAutoLoadDb = useCallback(async (
    game: string,
    dbFolder: string,
    indexed: TranslationEntry[],
  ): Promise<TranslationEntry[]> => {
    if (!game) return indexed;

    // Check explicit user-defined default DB first (avoids slow directory scan)
    const explicit = defaultDbs[game.toLowerCase()];
    const dbPath = explicit
      ? explicit.path
      : await invoke<string | null>("find_db_for_game_cmd", {
          game,
          customDir: dbFolder || null,
        });

    if (!dbPath) {
      setDbNotFound(game);
      return indexed;
    }

    try {
      const dbInfo = await invoke<DbInfo>("load_db_cmd", { path: dbPath });
      const applied = await invoke<{ matched: number; total: number; entries: TranslationEntry[] }>(
        "apply_db_full_cmd", { entries: indexed }
      );
      let out = applied.entries.map((e, i) => ({ ...e, _idx: i }));

      // If dbApplyValidates is off, downgrade DB-applied entries from Validated → Pending
      if (!dbApplyValidates && applied.matched > 0) {
        const wasEmpty = new Set(indexed.filter(e => !e.translated).map(e => e._idx));
        out = out.map(e =>
          wasEmpty.has(e._idx) && e.status === "validated"
            ? { ...e, status: "pending" as EntryStatus }
            : e
        );
      }

      setLoadedDbInfo(dbInfo);
      setLoadedDbPath(dbPath);

      // ── Step 2: Apply personal DB(s) ────────────────────────────────────────
      // "Automatique": scan + apply every .bgtx in the folder.
      // "Manuel"     : apply only the active .bgtx (the explicit write target).
      // Either way, the active DB is always applied — mode only controls whether
      // the whole folder is scanned for additional databases.
      let personalMatched = 0;
      const folder = personalDbPath
        ? personalDbPath.replace(/[/\\][^/\\]+$/, "") // parent dir of active DB
        : null;
      try {
        if (personalDbAutoApply && folder) {
          const bgtxFiles = await invoke<Array<{ path: string; entry_count: number }>>(
            "scan_personal_dbs_cmd", { customDir: folder }
          );
          for (const f of bgtxFiles) {
            if (f.entry_count === 0) continue;
            const personal = await invoke<{ matched: number; total: number; entries: TranslationEntry[] }>(
              "apply_personal_db_cmd", { path: f.path, entries: out }
            );
            if (personal.matched > 0) {
              out = personal.entries.map((e, i) => ({ ...e, _idx: i }));
              personalMatched += personal.matched;
            }
          }
        } else if (personalDbPath) {
          // Manuel mode: apply only the active DB
          const personal = await invoke<{ matched: number; total: number; entries: TranslationEntry[] }>(
            "apply_personal_db_cmd", { path: personalDbPath, entries: out }
          );
          if (personal.matched > 0) {
            out = personal.entries.map((e, i) => ({ ...e, _idx: i }));
            personalMatched = personal.matched;
          }
        }
      } catch { /* Personal DB not available — silently skip */ }

      // ── Single combined notification at end of pipeline ──────────────────
      if (applied.matched > 0 || personalMatched > 0) {
        setAutoApplyResult({ refDb: applied.matched, personalDb: personalMatched, session: 0 });
      }

      return out;
    } catch {
      setDbNotFound(game);
      return indexed;
    }
  }, [dbApplyValidates, defaultDbs, personalDbPath, personalDbAutoApply]);

  // ── Open a plugin file (.esp/.esm/.esl) ───────────────────────────────────

  const openPlugin = useCallback(async (path: string, dbFolder = "") => {
    setLoading(true);
    setLoadingProgress(0);
    setLoadingStatus(null);
    setError(null);
    resetState();

    const accumulated: TranslationEntry[] = [];
    let unlistenChunk:  (() => void) | undefined;
    let unlistenDone:   (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    const cleanup = () => { unlistenChunk?.(); unlistenDone?.(); unlistenStatus?.(); };

    try {
      // Create a promise that resolves when plugin:done fires, then set up both
      // listeners atomically (before invoke) to avoid missing early events.
      let resolveDone!: (count: number) => void;
      const donePromise = new Promise<number>((res) => { resolveDone = res; });

      [unlistenChunk, unlistenDone, unlistenStatus] = await Promise.all([
        listen<TranslationEntry[]>("plugin:chunk", (event) => {
          accumulated.push(...event.payload);
          setLoadingProgress(accumulated.length);
          setLoadingStatus(null); // chunks arriving → clear text status
        }),
        listen<number>("plugin:done", (event) => {
          resolveDone(event.payload);
        }),
        listen<string>("plugin:status", (event) => {
          setLoadingStatus(event.payload);
        }),
      ]);

      const meta = await invoke<PluginMetadata>("open_plugin_cmd", { path, targetLang });

      // Show metadata immediately so the header is visible while DB applies
      setPluginInfo({ ...meta, entries: [] });

      await donePromise;
      cleanup();

      let indexed: TranslationEntry[] = accumulated.map((e, i) => ({ ...e, _idx: i }));
      const game = detectGame(meta.masters);
      indexed = await tryAutoLoadDb(game, dbFolder, indexed);

      setPluginInfo((prev) => prev ? { ...prev, entries: indexed, entry_count: indexed.length } : null);
      setEntries(indexed);

      // ── Auto fuzzy scan (non-blocking, fires in background after UI renders) ──
      if (fuzzySettings?.auto_enabled) {
        setTimeout(() => { runFuzzyAuto(indexed, fuzzySettings); }, 100);
      }
    } catch (e) {
      cleanup();
      setError(String(e));
    } finally {
      setLoading(false);
      setLoadingProgress(null);
      setLoadingStatus(null);
    }
  }, [resetState, tryAutoLoadDb]);

  // ── Load a saved session by its managed ID ───────────────────────────────

  const loadSession = useCallback(async (id: string, dbFolder = "") => {
    setLoading(true);
    setError(null);
    resetState();
    try {
      const session = await invoke<TranslationSession>("load_session_cmd", { id });
      const indexed: TranslationEntry[] = session.entries.map((e, i) => ({ ...e, _idx: i }));

      // Reconstruct PluginInfo from the session
      const info: PluginInfo = {
        plugin_name:  session.plugin_name,
        plugin_path:  session.plugin_path || undefined,
        author:       session.plugin_info.author,
        description:  session.plugin_info.description,
        masters:      session.plugin_info.masters,
        is_localized: session.plugin_info.is_localized,
        entry_count:  indexed.length,
        entries:      indexed,
      };

      // Count how many entries already have a translation from the session
      const sessionCount = indexed.filter(e => !!e.translated).length;

      setPluginInfo(info);
      setEntries(indexed);

      // Try to load a matching DB silently (needed for "Add to DB" feature).
      // Bug fix: honour user's explicit defaultDbs first, same as tryAutoLoadDb.
      const game = detectGame(session.plugin_info.masters);
      if (game) {
        try {
          const explicit = defaultDbs[game.toLowerCase()];
          const dbPath   = explicit
            ? explicit.path
            : await invoke<string | null>("find_db_for_game_cmd", {
                game,
                customDir: dbFolder || null,
              });
          if (dbPath) {
            const dbInfo = await invoke<DbInfo>("load_db_cmd", { path: dbPath });
            setLoadedDbInfo(dbInfo);
            setLoadedDbPath(dbPath);
          }
        } catch { /* DB not available — silently skip */ }
      }

      // Apply personal DB(s) — same logic as tryAutoLoadDb:
      // "Automatique" → scan entire folder; "Manuel" → active DB only.
      let personalMatched = 0;
      const personalFolder = personalDbPath
        ? personalDbPath.replace(/[/\\][^/\\]+$/, "")
        : null;
      try {
        let current = indexed;
        if (personalDbAutoApply && personalFolder) {
          const bgtxFiles = await invoke<Array<{ path: string; entry_count: number }>>(
            "scan_personal_dbs_cmd", { customDir: personalFolder }
          );
          for (const f of bgtxFiles) {
            if (f.entry_count === 0) continue;
            const personal = await invoke<{ matched: number; total: number; entries: TranslationEntry[] }>(
              "apply_personal_db_cmd", { path: f.path, entries: current }
            );
            if (personal.matched > 0) {
              current = personal.entries.map((e, i) => ({ ...e, _idx: i }));
              personalMatched += personal.matched;
            }
          }
        } else if (personalDbPath) {
          const personal = await invoke<{ matched: number; total: number; entries: TranslationEntry[] }>(
            "apply_personal_db_cmd", { path: personalDbPath, entries: current }
          );
          if (personal.matched > 0) {
            current = personal.entries.map((e, i) => ({ ...e, _idx: i }));
            personalMatched = personal.matched;
          }
        }
        if (personalMatched > 0) {
          setEntries(current);
          setPluginInfo((prev) => prev ? { ...prev, entries: current } : null);
        }
      } catch { /* Personal DB not available — silently skip */ }

      // Always emit notification so the user knows what was restored
      if (sessionCount > 0 || personalMatched > 0) {
        setAutoApplyResult({ refDb: 0, personalDb: personalMatched, session: sessionCount });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [resetState, defaultDbs, personalDbPath, personalDbAutoApply]);

  // ── Open a standalone .strings / .dlstrings / .ilstrings file ──────────────

  const openStringsFile = useCallback(async (path: string) => {
    setLoading(true);
    setLoadingProgress(0);
    setLoadingStatus(null);
    setError(null);
    resetState();

    const accumulated: TranslationEntry[] = [];
    let unlistenChunk:  (() => void) | undefined;
    let unlistenDone:   (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    const cleanup = () => { unlistenChunk?.(); unlistenDone?.(); unlistenStatus?.(); };

    try {
      let resolveDone!: (count: number) => void;
      const donePromise = new Promise<number>((res) => { resolveDone = res; });

      [unlistenChunk, unlistenDone, unlistenStatus] = await Promise.all([
        listen<TranslationEntry[]>("plugin:chunk", (event) => {
          accumulated.push(...event.payload);
          setLoadingProgress(accumulated.length);
        }),
        listen<number>("plugin:done", (event) => {
          resolveDone(event.payload);
        }),
        listen<string>("plugin:status", (event) => {
          setLoadingStatus(event.payload);
        }),
      ]);

      const meta = await invoke<PluginMetadata>("open_strings_file_cmd", { path });
      setPluginInfo({ ...meta, entries: [] });

      await donePromise;
      cleanup();

      const indexed = accumulated.map((e, i) => ({ ...e, _idx: i }));
      setPluginInfo((prev) => prev ? { ...prev, entries: indexed, entry_count: indexed.length } : null);
      setEntries(indexed);
    } catch (e) {
      cleanup();
      setError(String(e));
    } finally {
      setLoading(false);
      setLoadingProgress(null);
      setLoadingStatus(null);
    }
  }, [resetState]);

  // ── Individual updates (by _idx) ─────────────────────────────────────────

  const updateTranslation = useCallback((idx: number, translated: string) => {
    // Status is never touched here — only explicit setStatus calls change it.
    const patch = (e: TranslationEntry) =>
      e._idx !== idx ? e : { ...e, translated };

    setEntries((prev) => {
      if (!propagateIdentical || !translated) return prev.map(patch);
      const target = prev.find(e => e._idx === idx);
      if (!target) return prev.map(patch);
      const originalText = target.original;
      return prev.map(e => {
        if (e._idx === idx) return patch(e);
        if (e.original === originalText && e.status !== "validated")
          return { ...e, translated };
        return e;
      });
    });
    setSelectedEntry((prev) => prev?._idx === idx ? { ...prev, translated } : prev);
  }, [propagateIdentical]);

  const setStatus = useCallback((idx: number, status: EntryStatus) => {
    setEntries((prev) => {
      const target = prev.find(e => e._idx === idx);
      // Propagate to all entries that share the same original AND same (non-empty) translation
      if (propagateIdentical && target?.translated) {
        return prev.map((e) => {
          if (e._idx === idx) return { ...e, status };
          if (e.original === target.original && e.translated === target.translated)
            return { ...e, status };
          return e;
        });
      }
      return prev.map((e) => e._idx === idx ? { ...e, status } : e);
    });
    setSelectedEntry((prev) => prev?._idx === idx ? { ...prev, status } : prev);
  }, [propagateIdentical]);

  // ── Import translations from a reference plugin ──────────────────────────
  //
  // refEntries: entries parsed from the reference (already-translated) file.
  //
  // Key insight: multiple entries can share the same form_id + sub_type (e.g.
  // several CNAM fields for the same QUST record — one per quest stage). A
  // simple Map<key, string> would only keep the last value and apply it to all
  // siblings, producing wrong results. Instead we build a Map<key, string[]>
  // (ordered list per key) and match by POSITION within each group, which
  // preserves the 1-to-1 correspondence between current and reference entries.
  //
  // Returns the number of entries that were actually updated.

  const applyImportedTranslations = useCallback((
    refEntries: TranslationEntry[],
    overwrite = false,
  ): number => {
    // Build positional map: "formId_subType" → [text at pos 0, text at pos 1, …]
    // The order mirrors the parse order of the reference file, which must match
    // the parse order of the currently-open file (same base record structure).
    const refMap = new Map<string, string[]>();
    for (const e of refEntries) {
      const key = `${e.form_id}_${e.sub_type}`;
      const list = refMap.get(key);
      if (list) list.push(e.original);
      else refMap.set(key, [e.original]);
    }

    // count is reset inside the updater so React Strict Mode double-invoke
    // doesn't produce a doubled total.
    let count = 0;
    setEntries((prev) => {
      let c = 0;
      // Track how many times each key has been visited so far in this pass.
      const keyCounters = new Map<string, number>();

      const next = prev.map((e) => {
        const key = `${e.form_id}_${e.sub_type}`;
        const pos = keyCounters.get(key) ?? 0;
        keyCounters.set(key, pos + 1);

        // Always protect entries the user is actively working on or has explicitly ignored.
        if (!overwrite && (e.status === "pending" || e.status === "ignored")) return e;

        const refText = refMap.get(key)?.[pos];
        // Skip: no match in reference, or text is unchanged (entry not translated in reference).
        if (!refText || refText === e.original) return e;
        // Skip: already validated with the exact same text — nothing to change.
        if (!overwrite && e.status === "validated" && e.translated === refText) return e;

        // Count only entries that actually change (new translation or updated text).
        c++;
        return { ...e, translated: refText, status: "validated" as EntryStatus };
      });
      count = c;
      return next;
    });

    return count;
  }, []);

  // ── Text-based import (XML / CSV) ────────────────────────────────────────
  //
  // Builds a map original→translated from the imported entries and applies
  // them to the current session. Unlike applyImportedTranslations, this uses
  // plain-text matching rather than positional matching and is intended for
  // third-party formats (xTranslator XML, ESP-ESM Translator XML, CSV).
  //
  // Returns the number of entries that were actually updated.

  const applyTextBasedImport = useCallback((
    imports: Array<{ original: string; translated: string }>,
    overwrite = false,
  ): number => {
    const map = new Map<string, string>();
    for (const e of imports) {
      if (e.original && e.translated) map.set(e.original, e.translated);
    }
    let count = 0;
    setEntries((prev) => {
      let c = 0;
      const next = prev.map((e) => {
        if (!overwrite && (e.status === "pending" || e.status === "ignored")) return e;
        const tr = map.get(e.original);
        if (!tr) return e;
        if (!overwrite && e.status === "validated" && e.translated === tr) return e;
        c++;
        return { ...e, translated: tr, status: "validated" as EntryStatus };
      });
      count = c;
      return next;
    });
    return count;
  }, []);

  // ── Bulk operations on the selection ─────────────────────────────────────

  const bulkSetStatus = useCallback((status: EntryStatus) => {
    setEntries((prev) =>
      prev.map((e) => selectedKeys.has(entryKey(e)) ? { ...e, status } : e)
    );
    setSelectedEntry((prev) => {
      if (!prev || !selectedKeys.has(entryKey(prev))) return prev;
      return { ...prev, status };
    });
    setSelectedKeys(new Set());
  }, [selectedKeys]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredEntries = useMemo(() => entries.filter((e) => {
    if (selectedGroup && e.record_type !== selectedGroup) return false;
    if (filter !== "all" && e.status !== filter) return false;
    if (filterFuzzyOnly && (e._idx === undefined || !fuzzyMatches.has(e._idx))) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.original.toLowerCase().includes(q) ||
        e.editor_id.toLowerCase().includes(q) ||
        e.record_type.toLowerCase().includes(q) ||
        e.translated.toLowerCase().includes(q)
      );
    }
    return true;
  }), [entries, filter, search, selectedGroup, filterFuzzyOnly, fuzzyMatches]);

  // ── Sorting ───────────────────────────────────────────────────────────────

  const sortedEntries = useMemo(() => {
    const stableKey = (a: typeof filteredEntries[0], b: typeof filteredEntries[0]) =>
      a.form_id !== b.form_id ? a.form_id - b.form_id : a.sub_type.localeCompare(b.sub_type);

    if (!sortConfig) return [...filteredEntries].sort(stableKey);

    const dir = sortConfig.dir === "asc" ? 1 : -1;
    return [...filteredEntries].sort((a, b) => {
      let primary = 0;
      switch (sortConfig.column) {
        case "form_id":     primary = dir * (a.form_id - b.form_id); break;
        case "record_type": primary = dir * a.record_type.localeCompare(b.record_type); break;
        case "sub_type":    primary = dir * a.sub_type.localeCompare(b.sub_type); break;
        case "original":    primary = dir * a.original.localeCompare(b.original); break;
        case "translated":  primary = dir * a.translated.localeCompare(b.translated); break;
        case "status":      primary = dir * a.status.localeCompare(b.status); break;
      }
      // Secondary sort: form_id then sub_type for a deterministic order
      return primary !== 0 ? primary : stableKey(a, b);
    });
  }, [filteredEntries, sortConfig]);

  // ── Column filters ────────────────────────────────────────────────────────

  const setColumnFilter = useCallback((col: string, value: string) => {
    setColumnFilters((prev) => {
      if (!value) {
        const { [col]: _removed, ...rest } = prev as Record<string, string>;
        return rest;
      }
      return { ...prev, [col]: value };
    });
  }, []);

  const displayEntries = useMemo(() => {
    const active = Object.entries(columnFilters).filter(([, v]) => v);
    if (active.length === 0) return sortedEntries;
    return sortedEntries.filter((e) => {
      for (const [col, raw] of active) {
        const q = raw!.toLowerCase();
        switch (col) {
          case "form_id":      if (!e.form_id.toString(16).toLowerCase().includes(q)) return false; break;
          case "record_type":  if (!e.record_type.toLowerCase().includes(q)) return false; break;
          case "editor_id":    if (!e.editor_id.toLowerCase().includes(q)) return false; break;
          case "sub_type":     if (!e.sub_type.toLowerCase().includes(q)) return false; break;
          case "original":     if (!e.original.toLowerCase().includes(q)) return false; break;
          case "translated":   if (!e.translated.toLowerCase().includes(q)) return false; break;
          case "status":       if (!e.status.toLowerCase().includes(q)) return false; break;
        }
      }
      return true;
    });
  }, [sortedEntries, columnFilters]);

  const toggleSort = useCallback((column: SortConfig["column"]) => {
    setSortConfig((prev) => {
      if (!prev || prev.column !== column) return { column, dir: "asc" };
      if (prev.dir === "asc") return { column, dir: "desc" };
      return null;
    });
  }, []);

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const navigateBy = useCallback((delta: number) => {
    if (displayEntries.length === 0) return;
    if (!selectedEntry) {
      const first = displayEntries[0];
      setSelectedEntry(first);
      setSelectedKeys(new Set([entryKey(first)]));
      return;
    }
    const idx = displayEntries.findIndex((e) => entryKey(e) === entryKey(selectedEntry));
    const nextIdx = Math.max(0, Math.min(displayEntries.length - 1, idx + delta));
    const next = displayEntries[nextIdx];
    // Sync with the live entry state
    const live = entries.find((e) => e._idx === next._idx) ?? next;
    setSelectedEntry(live);
    setSelectedKeys(new Set([entryKey(live)]));
  }, [selectedEntry, displayEntries, entries]);

  // ── Selection (single / Ctrl / Shift) ────────────────────────────────────

  const handleRowClick = useCallback((entry: TranslationEntry, ctrlKey: boolean, shiftKey: boolean) => {
    const key = entryKey(entry);
    const live = entries.find((e) => e._idx === entry._idx) ?? entry;
    if (ctrlKey) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      setSelectedEntry(live);
    } else if (shiftKey && selectedEntry) {
      const anchor = displayEntries.findIndex((e) => entryKey(e) === entryKey(selectedEntry));
      const end    = displayEntries.findIndex((e) => entryKey(e) === key);
      const [from, to] = [Math.min(anchor, end), Math.max(anchor, end)];
      setSelectedKeys(new Set(displayEntries.slice(from, to + 1).map(entryKey)));
      setSelectedEntry(live);
    } else {
      setSelectedKeys(new Set([key]));
      setSelectedEntry(live);
    }
  }, [selectedEntry, displayEntries, entries]);

  // ── Group stats (alphabetical order) ─────────────────────────────────────

  const groupStats = useMemo<GroupStats[]>(() => {
    const map = new Map<string, GroupStats>();
    for (const e of entries) {
      if (!map.has(e.record_type)) {
        map.set(e.record_type, { record_type: e.record_type, total: 0, validated: 0, pending: 0, untranslated: 0, ignored: 0 });
      }
      const s = map.get(e.record_type)!;
      s.total++;
      s[e.status]++;
    }
    return Array.from(map.values()).sort((a, b) => a.record_type.localeCompare(b.record_type));
  }, [entries]);

  const translatedCount   = useMemo(() => entries.filter((e) => e.status === "validated").length, [entries]);
  const pendingCount      = useMemo(() => entries.filter((e) => e.status === "pending").length, [entries]);
  const ignoredCount      = useMemo(() => entries.filter((e) => e.status === "ignored").length, [entries]);
  const untranslatedCount = useMemo(() => entries.filter((e) => e.status === "untranslated").length, [entries]);
  const progressPercent   = entries.length > 0
    ? Math.round(((translatedCount + ignoredCount) / entries.length) * 100)
    : 0;

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setSelectedEntry(null);
  }, []);

  const selectAll = useCallback((entriesToSelect: TranslationEntry[]) => {
    if (entriesToSelect.length === 0) return;
    setSelectedKeys(new Set(entriesToSelect.map(entryKey)));
    // Keep the first entry as the "anchor" for the edit panel
    setSelectedEntry(entriesToSelect[0]);
  }, []);

  // ── Manual apply of all personal DBs in the folder ───────────────────────
  // targetKeys: string _idx keys of entries to apply to; undefined = all entries

  const applyPersonalDbManual = useCallback(async (
    targetKeys?: Set<string>,
  ): Promise<number> => {
    const folder = personalDbPath
      ? personalDbPath.replace(/[/\\][^/\\]+$/, "")
      : null;
    try {
      const bgtxFiles = await invoke<Array<{ path: string; entry_count: number }>>(
        "scan_personal_dbs_cmd", { customDir: folder }
      );

      const subset = targetKeys
        ? entries.filter(e => targetKeys.has(String(e._idx)))
        : entries;

      if (subset.length === 0) return 0;

      let current = subset;
      let totalMatched = 0;

      for (const f of bgtxFiles) {
        if (f.entry_count === 0) continue;
        const personal = await invoke<{ matched: number; entries: TranslationEntry[] }>(
          "apply_personal_db_cmd", { path: f.path, entries: current }
        );
        if (personal.matched > 0) {
          current = personal.entries;
          totalMatched += personal.matched;
        }
      }

      if (totalMatched > 0) {
        if (targetKeys) {
          // Restore original _idx and merge back into full array
          const updated = current.map((e, i) => ({ ...e, _idx: subset[i]._idx }));
          const idxMap  = new Map(updated.map(e => [e._idx, e]));
          setEntries(prev => prev.map(e => idxMap.get(e._idx) ?? e));
        } else {
          setEntries(current.map((e, i) => ({ ...e, _idx: i })));
        }
      }
      return totalMatched;
    } catch {
      return 0;
    }
  }, [entries, personalDbPath]);

  // ── Fuzzy helpers ─────────────────────────────────────────────────────────

  /**
   * Build the source list for fuzzy search from the current session entries.
   * Priority: validated > pending. Deduplication is done server-side.
   */
  const buildFuzzySources = useCallback((
    entriesSnapshot: TranslationEntry[],
    settings: FuzzySettings,
  ): FuzzySourceEntry[] => {
    const sources: FuzzySourceEntry[] = [];
    if (settings.use_session) {
      for (const e of entriesSnapshot) {
        if (e.translated && e.status !== "untranslated") {
          sources.push({ original: e.original, translated: e.translated, origin: "session" });
        }
      }
    }
    return sources;
  }, []);

  /**
   * Run a bulk fuzzy scan on all untranslated entries.
   * Uses `entriesSnapshot` to avoid stale closure issues during async work.
   * Returns the number of matches found.
   */
  const runFuzzyAuto = useCallback(async (
    entriesSnapshot: TranslationEntry[],
    settings: FuzzySettings,
  ): Promise<number> => {
    const sources = buildFuzzySources(entriesSnapshot, settings);
    if (sources.length === 0) return 0;

    const targets = entriesSnapshot
      .filter(e => e.status === "untranslated" && !e.translated)
      .map(e => ({ form_id: e.form_id, sub_type: e.sub_type, original: e.original }));

    if (targets.length === 0) return 0;

    setFuzzyScanning(true);
    try {
      const matches = await invoke<FuzzyMatch[]>("get_fuzzy_matches_cmd", {
        targets,
        sources,
        thresholdJw:  settings.threshold_jw,
        thresholdLev: settings.threshold_lev,
      });

      // Correlate by (form_id, sub_type, original) → _idx
      const lookupMap = new Map<string, number>();
      for (const e of entriesSnapshot) {
        if (e._idx !== undefined) {
          lookupMap.set(`${e.form_id}_${e.sub_type}_${e.original}`, e._idx);
        }
      }

      const idxMap = new Map<number, FuzzyMatch>();
      for (const m of matches) {
        const idx = lookupMap.get(`${m.form_id}_${m.sub_type}_${m.original}`);
        if (idx !== undefined) idxMap.set(idx, m);
      }

      setFuzzyMatches(idxMap);
      return idxMap.size;
    } catch (err) {
      console.error("[fuzzy] auto scan failed:", err);
      return 0;
    } finally {
      setFuzzyScanning(false);
    }
  }, [buildFuzzySources]);

  /**
   * Run fuzzy matching for a single entry (manual trigger from EditPanel).
   * Immediately updates the fuzzyMatches map if a match is found (or removes the entry if none).
   */
  const runFuzzySingle = useCallback(async (
    entry: TranslationEntry,
    settings: FuzzySettings,
  ): Promise<{ match: FuzzyMatch | null; reason?: "no_sources" | "error" }> => {
    const sources = buildFuzzySources(entries, settings);
    if (sources.length === 0) return { match: null, reason: "no_sources" };

    setFuzzyScanning(true);
    try {
      const match = await invoke<FuzzyMatch | null>("get_fuzzy_match_single_cmd", {
        original:     entry.original,
        sources,
        thresholdJw:  settings.threshold_jw,
        thresholdLev: settings.threshold_lev,
      });

      const idx = entry._idx;
      if (idx !== undefined) {
        setFuzzyMatches(prev => {
          const next = new Map(prev);
          if (match) {
            next.set(idx, {
              ...match,
              form_id:  entry.form_id,
              sub_type: entry.sub_type,
              original: entry.original,
            });
          } else {
            next.delete(idx);
          }
          return next;
        });
      }

      return { match };
    } catch (err) {
      console.error("[fuzzy] single scan failed:", err);
      return { match: null, reason: "error" };
    } finally {
      setFuzzyScanning(false);
    }
  }, [entries, buildFuzzySources]);

  /**
   * Apply a fuzzy suggestion: set translation + status → validated, remove from map.
   */
  const acceptFuzzy = useCallback((idx: number) => {
    const match = fuzzyMatches.get(idx);
    if (!match) return;
    updateTranslation(idx, match.suggested);
    setStatus(idx, "validated");
    setFuzzyMatches(prev => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
  }, [fuzzyMatches, updateTranslation, setStatus]);

  /** Dismiss a fuzzy suggestion without applying it. */
  const dismissFuzzy = useCallback((idx: number) => {
    setFuzzyMatches(prev => {
      const next = new Map(prev);
      next.delete(idx);
      return next;
    });
  }, []);

  /**
   * Apply fuzzy suggestions to the current selection (bulk).
   * Returns the number of entries updated.
   */
  const applyFuzzyToSelection = useCallback((): number => {
    let applied = 0;
    const toRemove: number[] = [];

    setEntries(prev => prev.map(e => {
      if (e._idx === undefined) return e;
      if (!selectedKeys.has(entryKey(e))) return e;
      const match = fuzzyMatches.get(e._idx);
      if (!match) return e;
      // Always dismiss the suggestion from the map (even if already translated).
      // Only actually apply + count if the entry was untranslated.
      toRemove.push(e._idx);
      if (e.status !== "untranslated") return e;
      applied++;
      return { ...e, translated: match.suggested, status: "validated" as EntryStatus };
    }));

    if (toRemove.length > 0) {
      setFuzzyMatches(prev => {
        const next = new Map(prev);
        for (const idx of toRemove) next.delete(idx);
        return next;
      });
    }

    setSelectedKeys(new Set());
    return applied;
  }, [selectedKeys, fuzzyMatches]);

  return {
    pluginInfo, entries, displayEntries, loading, loadingProgress, loadingStatus, error,
    filter, setFilter, search, setSearch,
    selectedGroup, setSelectedGroup,
    selectedEntry, setSelectedEntry,
    selectedKeys, handleRowClick,
    clearSelection,
    selectAll,
    sortConfig, toggleSort,
    groupStats,
    translatedCount, pendingCount, ignoredCount, untranslatedCount, progressPercent,
    openPlugin, openStringsFile, loadSession,
    updateTranslation, setStatus, navigateBy, bulkSetStatus, applyImportedTranslations, applyTextBasedImport,
    applyPersonalDbManual,
    selectedCount: selectedKeys.size,
    columnFilters, setColumnFilter,
    autoApplyResult, clearAutoApplyResult: () => setAutoApplyResult(null),
    dbNotFound, clearDbNotFound: () => setDbNotFound(null),
    loadedDbInfo,
    loadedDbPath,
    // Fuzzy
    fuzzyMatches, fuzzyScanning, filterFuzzyOnly, setFilterFuzzyOnly,
    runFuzzyAuto, runFuzzySingle, acceptFuzzy, dismissFuzzy, applyFuzzyToSelection,
    fuzzyMatchCount: fuzzyMatches.size,
  };
}
