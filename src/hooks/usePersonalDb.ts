import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TranslationEntry, PersonalDbInfo, PersonalDbFileInfo } from "../types";

// ── Types mirroring Rust structs ──────────────────────────────────────────────

interface PersonalApplyResult {
  matched: number;
  total:   number;
  entries: TranslationEntry[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePersonalDb() {
  const [personalDbInfo, setPersonalDbInfo] = useState<PersonalDbInfo | null>(null);
  const [adding, setAdding]                 = useState(false);
  const [addResult, setAddResult]           = useState<number | null>(null);

  // ── Create a new personal DB file ─────────────────────────────────────────

  const createPersonalDb = useCallback(async (
    name:      string,
    game:      string,
    langFrom:  string,
    langTo:    string,
    customDir: string,
  ): Promise<PersonalDbInfo> => {
    const info = await invoke<PersonalDbInfo>("create_personal_db_cmd", {
      name, game, langFrom, langTo,
      customDir: customDir || null,
    });
    setPersonalDbInfo(info);
    return info;
  }, []);

  // ── Scan folder for .bgtx files ───────────────────────────────────────────

  const scanPersonalDbs = useCallback(async (
    customDir: string,
  ): Promise<PersonalDbFileInfo[]> => {
    return invoke<PersonalDbFileInfo[]>("scan_personal_dbs_cmd", {
      customDir: customDir || null,
    });
  }, []);

  // ── Peek at a single .bgtx file ───────────────────────────────────────────

  const peekPersonalDb = useCallback(async (path: string): Promise<PersonalDbInfo> => {
    return invoke<PersonalDbInfo>("peek_personal_db_cmd", { path });
  }, []);

  // ── Apply a personal DB to a list of entries ──────────────────────────────
  // Returns the updated entries + match count.

  const applyPersonalDb = useCallback(async (
    path:    string,
    entries: TranslationEntry[],
  ): Promise<{ entries: TranslationEntry[]; matched: number }> => {
    if (!path) return { entries, matched: 0 };
    try {
      const result = await invoke<PersonalApplyResult>("apply_personal_db_cmd", { path, entries });
      return { entries: result.entries, matched: result.matched };
    } catch {
      return { entries, matched: 0 };
    }
  }, []);

  // ── Add selected entries to the active personal DB ────────────────────────

  const addToPersonalDb = useCallback(async (
    path:     string,
    entries:  TranslationEntry[],
    meta?: {
      name?:     string;
      game?:     string;
      langFrom?: string;
      langTo?:   string;
    },
  ): Promise<PersonalDbInfo | null> => {
    if (!path || entries.length === 0) return null;
    setAdding(true);
    try {
      const info = await invoke<PersonalDbInfo>("add_to_personal_db_cmd", {
        path,
        entries,
        name:     meta?.name     ?? null,
        game:     meta?.game     ?? null,
        langFrom: meta?.langFrom ?? null,
        langTo:   meta?.langTo   ?? null,
      });
      setPersonalDbInfo(info);
      setAddResult(info.entry_count);
      return info;
    } catch (e) {
      console.error("[personalDb] add error:", e);
      return null;
    } finally {
      setAdding(false);
    }
  }, []);

  // ── Delete a personal DB file ─────────────────────────────────────────────

  const deletePersonalDb = useCallback(async (path: string): Promise<void> => {
    await invoke("delete_personal_db_cmd", { path });
    if (personalDbInfo?.path === path) setPersonalDbInfo(null);
  }, [personalDbInfo]);

  // ── Get the default personal_dbs/ dir path ────────────────────────────────

  const getPersonalDbsDir = useCallback(async (customDir: string): Promise<string> => {
    return invoke<string>("get_personal_dbs_dir_cmd", { customDir: customDir || null });
  }, []);

  return {
    personalDbInfo, setPersonalDbInfo,
    adding, addResult, clearAddResult: () => setAddResult(null),
    createPersonalDb,
    scanPersonalDbs,
    peekPersonalDb,
    applyPersonalDb,
    addToPersonalDb,
    deletePersonalDb,
    getPersonalDbsDir,
  };
}
