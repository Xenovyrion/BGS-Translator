import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PluginInfo, PluginMetadata, TranslationEntry, FilterMode, EntryStatus, GroupStats, SortConfig, TranslationSession, DbInfo } from "../types";

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

function detectGame(masters: string[]): string {
  for (const master of masters) {
    const key = master.toLowerCase();
    const game = MASTER_TO_GAME[key];
    if (game) return game;
  }
  return "";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlugin() {
  const [pluginInfo, setPluginInfo]         = useState<PluginInfo | null>(null);
  const [entries, setEntries]               = useState<TranslationEntry[]>([]);
  const [loading, setLoading]               = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [filter, setFilter]               = useState<FilterMode>("all");
  const [search, setSearch]               = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TranslationEntry | null>(null);
  const [selectedKeys, setSelectedKeys]   = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig]       = useState<SortConfig | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<string, string>>>({});
  const [dbApplyResult, setDbApplyResult] = useState<number | null>(null);
  const [dbNotFound, setDbNotFound]       = useState<string | null>(null);
  const [loadedDbInfo, setLoadedDbInfo]   = useState<DbInfo | null>(null);

  // ── Shared reset helper ────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setSelectedEntry(null);
    setSelectedGroup(null);
    setSelectedKeys(new Set());
    setSortConfig(null);
    setColumnFilters({});
    setDbApplyResult(null);
    setDbNotFound(null);
    setLoadedDbInfo(null);
  }, []);

  // ── Internal: try to auto-load a DB matching the given game ─────────────

  const tryAutoLoadDb = useCallback(async (
    game: string,
    dbFolder: string,
    indexed: TranslationEntry[],
  ): Promise<TranslationEntry[]> => {
    if (!game) return indexed;

    const dbPath = await invoke<string | null>("find_db_for_game_cmd", {
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
      const out = applied.entries.map((e, i) => ({ ...e, _idx: i }));
      if (applied.matched > 0) setDbApplyResult(applied.matched);
      setLoadedDbInfo(dbInfo);
      return out;
    } catch {
      setDbNotFound(game);
      return indexed;
    }
  }, []);

  // ── Open a plugin file (.esp/.esm/.esl) ───────────────────────────────────

  const openPlugin = useCallback(async (path: string, dbFolder = "") => {
    setLoading(true);
    setLoadingProgress(0);
    setError(null);
    resetState();

    const accumulated: TranslationEntry[] = [];
    let unlistenChunk: (() => void) | undefined;
    let unlistenDone:  (() => void) | undefined;

    const cleanup = () => { unlistenChunk?.(); unlistenDone?.(); };

    try {
      // Create a promise that resolves when plugin:done fires, then set up both
      // listeners atomically (before invoke) to avoid missing early events.
      let resolveDone!: (count: number) => void;
      const donePromise = new Promise<number>((res) => { resolveDone = res; });

      [unlistenChunk, unlistenDone] = await Promise.all([
        listen<TranslationEntry[]>("plugin:chunk", (event) => {
          accumulated.push(...event.payload);
          setLoadingProgress(accumulated.length);
        }),
        listen<number>("plugin:done", (event) => {
          resolveDone(event.payload);
        }),
      ]);

      const meta = await invoke<PluginMetadata>("open_plugin_cmd", { path });

      // Show metadata immediately so the header is visible while DB applies
      setPluginInfo({ ...meta, entries: [] });

      await donePromise;
      cleanup();

      let indexed: TranslationEntry[] = accumulated.map((e, i) => ({ ...e, _idx: i }));
      const game = detectGame(meta.masters);
      indexed = await tryAutoLoadDb(game, dbFolder, indexed);

      setPluginInfo((prev) => prev ? { ...prev, entries: indexed, entry_count: indexed.length } : null);
      setEntries(indexed);
    } catch (e) {
      cleanup();
      setError(String(e));
    } finally {
      setLoading(false);
      setLoadingProgress(null);
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
        author:       session.plugin_info.author,
        description:  session.plugin_info.description,
        masters:      session.plugin_info.masters,
        is_localized: session.plugin_info.is_localized,
        entry_count:  indexed.length,
        entries:      indexed,
      };

      setPluginInfo(info);
      setEntries(indexed);

      // Try to load a matching DB silently (needed for "Add to DB" feature)
      const game = detectGame(session.plugin_info.masters);
      if (game) {
        try {
          const dbPath = await invoke<string | null>("find_db_for_game_cmd", {
            game,
            customDir: dbFolder || null,
          });
          if (dbPath) {
            const dbInfo = await invoke<DbInfo>("load_db_cmd", { path: dbPath });
            setLoadedDbInfo(dbInfo);
          }
        } catch { /* DB not available — silently skip */ }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [resetState]);

  // ── Individual updates (by _idx) ─────────────────────────────────────────

  const updateTranslation = useCallback((idx: number, translated: string) => {
    const patch = (e: TranslationEntry) => {
      if (e._idx !== idx) return e;
      const newStatus: EntryStatus = translated
        ? (e.status === "untranslated" ? "pending" : e.status)
        : "untranslated";
      return { ...e, translated, status: newStatus };
    };
    setEntries((prev) => prev.map(patch));
    setSelectedEntry((prev) => prev?._idx === idx ? patch(prev) : prev);
  }, []);

  const setStatus = useCallback((idx: number, status: EntryStatus) => {
    setEntries((prev) => prev.map((e) => e._idx === idx ? { ...e, status } : e));
    setSelectedEntry((prev) => prev?._idx === idx ? { ...prev, status } : prev);
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
  }, [selectedKeys]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredEntries = useMemo(() => entries.filter((e) => {
    if (selectedGroup && e.record_type !== selectedGroup) return false;
    if (filter !== "all" && e.status !== filter) return false;
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
  }), [entries, filter, search, selectedGroup]);

  // ── Sorting ───────────────────────────────────────────────────────────────

  const sortedEntries = useMemo(() => {
    if (!sortConfig) return filteredEntries;
    const dir = sortConfig.dir === "asc" ? 1 : -1;
    return [...filteredEntries].sort((a, b) => {
      switch (sortConfig.column) {
        case "form_id":      return dir * (a.form_id - b.form_id);
        case "record_type":  return dir * a.record_type.localeCompare(b.record_type);
        case "sub_type":     return dir * a.sub_type.localeCompare(b.sub_type);
        case "original":     return dir * a.original.localeCompare(b.original);
        case "translated":   return dir * a.translated.localeCompare(b.translated);
        case "status":       return dir * a.status.localeCompare(b.status);
        default:             return 0;
      }
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

  return {
    pluginInfo, entries, displayEntries, loading, loadingProgress, error,
    filter, setFilter, search, setSearch,
    selectedGroup, setSelectedGroup,
    selectedEntry, setSelectedEntry,
    selectedKeys, handleRowClick,
    sortConfig, toggleSort,
    groupStats,
    translatedCount, pendingCount, ignoredCount, untranslatedCount, progressPercent,
    openPlugin, loadSession,
    updateTranslation, setStatus, navigateBy, bulkSetStatus,
    selectedCount: selectedKeys.size,
    columnFilters, setColumnFilter,
    dbApplyResult, clearDbApplyResult: () => setDbApplyResult(null),
    dbNotFound, clearDbNotFound: () => setDbNotFound(null),
    loadedDbInfo,
  };
}
