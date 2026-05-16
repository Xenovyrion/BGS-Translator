import { useState, useEffect, useCallback, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";

import "./i18n";
import { useSettings } from "./hooks/useSettings";
import { usePlugin } from "./hooks/usePlugin";
import { usePersonalDb } from "./hooks/usePersonalDb";
import { useLayout } from "./hooks/useLayout";
import { DEFAULT_SHORTCUTS, formatShortcut } from "./types";
import type { SortConfig, TranslationEntry, ShortcutDef, SessionListItem } from "./types";
import { THEME_PRESETS, DEFAULT_RECORD_COLORS } from "./themes";
import type { IconSetId } from "./themes";
import { IconSetContext } from "./icons";

import MenuBar          from "./components/layout/MenuBar";
import ConvertToBgtModal from "./components/shared/ConvertToBgtModal";
import CompareModal      from "./components/compare/CompareModal";
import GlobalFindReplaceModal from "./components/shared/GlobalFindReplaceModal";
import ToolBar     from "./components/layout/ToolBar";
import FilterBar   from "./components/translation/FilterBar";
import GroupPanel  from "./components/translation/GroupPanel";
import TranslationTable from "./components/translation/TranslationTable";
import EditPanel, { type EditPanelHandle } from "./components/translation/EditPanel";
import BulkActionBar from "./components/translation/BulkActionBar";
import StatusBar   from "./components/translation/StatusBar";
import SettingsModal    from "./components/settings/SettingsModal";
import UpdateModal       from "./components/shared/UpdateModal";
import ChangelogModal    from "./components/shared/ChangelogModal";
import SessionPickerModal from "./components/shared/SessionPickerModal";
import ThemeManagerModal from "./components/themes/ThemeManagerModal";
import { NotificationBanner } from "./components/shared/NotificationBanner";
import type { Notification } from "./components/shared/NotificationBanner";

interface UpdateInfo { version: string; notes?: string }

function matchShortcut(e: React.KeyboardEvent | KeyboardEvent, sc: ShortcutDef): boolean {
  if (e.key.toLowerCase() !== sc.key.toLowerCase()) return false;
  if (!!sc.ctrl  !== (e.ctrlKey || e.metaKey)) return false;
  if (!!sc.alt   !== e.altKey) return false;
  if (!!sc.shift !== e.shiftKey) return false;
  return true;
}

export default function App() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const {
    layout,
    setSidebarWidth,
    setEditPanelHeight,
    setColumnWidth,
    setTextSplit,
    resetLayout,
  } = useLayout();
  const sc = settings.shortcuts ?? DEFAULT_SHORTCUTS;

  /* Active icon set + record group colors (resolved from the current theme) */
  const activeIconSet: IconSetId = (() => {
    const allThemes = [...THEME_PRESETS, ...(settings.customThemes ?? [])];
    const theme     = allThemes.find(t => t.id === settings.themeId);
    return theme?.iconSet ?? "minimal";
  })();

  const resolvedRecordColors: Record<string, string> = (() => {
    const allThemes = [...THEME_PRESETS, ...(settings.customThemes ?? [])];
    const theme     = allThemes.find(t => t.id === settings.themeId);
    const overrides = theme?.recordColors ?? {};
    const result: Record<string, string> = { ...DEFAULT_RECORD_COLORS };
    for (const [k, v] of Object.entries(overrides)) {
      if (v) result[k] = v;
    }
    return result;
  })();

  const {
    pluginInfo, entries, displayEntries, loading, loadingProgress, error,
    // (usePlugin receives settings-driven options below)
    filter, setFilter, search, setSearch,
    selectedGroup, setSelectedGroup,
    selectedEntry, setSelectedEntry,
    selectedKeys, handleRowClick,
    clearSelection, selectAll,
    sortConfig, toggleSort,
    groupStats,
    translatedCount, pendingCount, ignoredCount, untranslatedCount,
    openPlugin, loadSession,
    updateTranslation, setStatus, navigateBy, bulkSetStatus, applyImportedTranslations, applyTextBasedImport,
    applyPersonalDbManual,
    selectedCount,
    columnFilters, setColumnFilter,
    autoApplyResult, clearAutoApplyResult,
    dbNotFound, clearDbNotFound,
    loadedDbInfo,
    // Fuzzy
    fuzzyMatches, fuzzyScanning, filterFuzzyOnly, setFilterFuzzyOnly,
    runFuzzySingle, acceptFuzzy, dismissFuzzy, applyFuzzyToSelection,
    fuzzyMatchCount,
  } = usePlugin({
    propagateIdentical:  settings.propagateIdentical  !== false,
    dbApplyValidates:    settings.dbApplyValidates     !== false,
    defaultDbs:          settings.defaultDbs           ?? {},
    personalDbPath:      settings.activePersonalDbPath ?? "",
    personalDbAutoApply: settings.personalDbAutoApply  !== false,
    fuzzySettings:       settings.fuzzy,
  });

  const {
    addToPersonalDb,
    personalDbInfo: personalDbInfoLoaded,
    peekPersonalDb,
    setPersonalDbInfo,
  } = usePersonalDb();

  // Source path resolved interactively when session lacks it
  const [resolvedSourcePath, setResolvedSourcePath] = useState<string>("");
  // Documents/BGS-Translator/Output — computed once at startup as the initial default
  const [defaultExportDir, setDefaultExportDir]     = useState<string>("");

  // Reset resolved path when a different plugin is opened/loaded
  useEffect(() => {
    setResolvedSourcePath("");
  }, [pluginInfo?.plugin_name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Base folder: Documents/BGS-Translator/Traduction (game sub-folder added at export time).
  // On first run, auto-save it so the settings field isn't empty.
  useEffect(() => {
    documentDir().then((dir) => {
      const base = dir.replace(/[/\\]+$/, "") + "/BGS-Translator/Traduction";
      setDefaultExportDir(base);
      const sentinel = "bgstranslator_export_dir_init_v2";
      if (!settings.exportFolder && !localStorage.getItem(sentinel)) {
        localStorage.setItem(sentinel, "1");
        updateSettings({ exportFolder: base });
        // Effect 2 (settings.exportFolder) will call ensure_dir_cmd once the value is set
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create the configured export folder whenever it changes, so the save dialog opens there
  useEffect(() => {
    if (!settings.exportFolder) return;
    invoke("ensure_dir_cmd", { path: settings.exportFolder }).catch(() => {});
  }, [settings.exportFolder]);

  const [showGlobalFind,     setShowGlobalFind]     = useState(false);
  const [showSettings,       setShowSettings]       = useState(false);
  const [showThemeManager,   setShowThemeManager]   = useState(false);
  const [showUpdateModal,    setShowUpdateModal]     = useState(false);
  const [showChangelog,      setShowChangelog]       = useState(false);
  const [showSessionPicker,  setShowSessionPicker]  = useState(false);
  const [update,             setUpdate]             = useState<UpdateInfo | null>(null);
  const [showColumnFilters,  setShowColumnFilters]  = useState(false);
  const [appVersion,         setAppVersion]         = useState("0.1.0");
  const [lastAutosave,       setLastAutosave]       = useState<Date | null>(null);
  const [notification,       setNotification]       = useState<Notification | null>(null);
  const [showDbConverter,    setShowDbConverter]    = useState(false);
  const [showCompare,        setShowCompare]        = useState(false);
  const [compareSessions,    setCompareSessions]    = useState<SessionListItem[]>([]);
  const [defaultDbDir,       setDefaultDbDir]       = useState<string>("");
  const [deeplBatchLoading,  setDeeplBatchLoading]  = useState(false);

  const notify = useCallback((message: string, type: Notification["type"], detail?: string, duration?: number) => {
    setNotification({ message, type, detail, key: Date.now(), duration });
  }, []);
  const dismissNotification = useCallback(() => setNotification(null), []);

  const editPanelRef = useRef<EditPanelHandle>(null);
  const tableRef     = useRef<HTMLDivElement>(null);

  /* Disable browser context menu and built-in Ctrl+F find bar */
  useEffect(() => {
    const noCtxMenu = (e: MouseEvent)    => e.preventDefault();
    const noFind    = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) e.preventDefault();
    };
    document.addEventListener("contextmenu", noCtxMenu);
    window.addEventListener("keydown", noFind, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", noCtxMenu);
      window.removeEventListener("keydown", noFind, { capture: true });
    };
  }, []);

  /* App version + update check on startup */
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    invoke<UpdateInfo | null>("check_update")
      .then((info) => { if (info) { setUpdate(info); setShowUpdateModal(true); } })
      .catch(() => {});
  }, []);

  /* Autosave interval — saves to the managed sessions directory automatically */
  useEffect(() => {
    const interval = settings.autosaveInterval ?? 0;
    if (!interval || !pluginInfo) return;
    const ms = interval * 60 * 1000;
    const timer = setInterval(async () => {
      if (!pluginInfo) return;
      try {
        await invoke("save_session_cmd", {
          session: {
            plugin_path: pluginInfo.plugin_path ?? "",
            plugin_name: pluginInfo.plugin_name,
            plugin_info: pluginInfo,
            entries,
            target_language: settings.targetLanguage,
          },
        });
        setLastAutosave(new Date());
      } catch (e) { console.warn("[autosave] failed:", e); }
    }, ms);
    return () => clearInterval(timer);
  }, [settings.autosaveInterval, pluginInfo, entries, settings.targetLanguage]);

  /* ── Notification triggers ──────────────────────────────────────────────── */

  useEffect(() => {
    if (!autoApplyResult) return;
    const { refDb, personalDb, session } = autoApplyResult;

    // Build each part independently, then join — handles any combination of sources
    const parts: string[] = [];
    if (session > 0) {
      parts.push(`${session.toLocaleString()} ${t("session.banner_suffix", { count: session })}`);
    }
    if (refDb > 0) {
      parts.push(`${refDb.toLocaleString()} ${t("db.banner_suffix", { count: refDb })}${loadedDbInfo ? ` (${loadedDbInfo.name})` : ""}`);
    }
    if (personalDb > 0) {
      parts.push(`${personalDb.toLocaleString()} ${t("personal_db.apply_banner_suffix", { count: personalDb })}`);
    }

    if (parts.length > 0) {
      const title = session > 0 && refDb === 0
        ? `✓ ${t("session.banner_title")}`
        : `✓ ${t("db.banner_title")}`;
      notify(title, "success", parts.join(" · "), parts.length > 1 ? 7000 : 5000);
    }

    clearAutoApplyResult();
  }, [autoApplyResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load personal DB info (name) when active path changes
  useEffect(() => {
    const path = settings.activePersonalDbPath;
    if (!path) { setPersonalDbInfo(null); return; }
    peekPersonalDb(path).then(setPersonalDbInfo).catch(() => setPersonalDbInfo(null));
  }, [settings.activePersonalDbPath]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dbNotFound) return;
    notify(`⚠ ${t("db.no_db_title")}`, "error", t("db.no_db_message", { game: dbNotFound }), 8000);
    clearDbNotFound();
  }, [dbNotFound]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── File actions ────────────────────────────────────────────────────────── */

  const handleOpenPlugin = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    if (settings.autoLoadSession) {
      try {
        const stem = selected.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
        const sessions = await invoke<SessionListItem[]>("list_sessions_cmd");
        const matching = sessions.filter(s => s.plugin_name.toLowerCase() === stem.toLowerCase());
        if (matching.length > 0) {
          const latest = matching.reduce((a, b) => a.saved_at > b.saved_at ? a : b);
          await loadSession(latest.id, settings.dbFolder);
          // Keep the path the user just selected so export doesn't ask for it again
          setResolvedSourcePath(selected);
          return;
        }
      } catch { /* fall through to normal open */ }
    }

    await openPlugin(selected, settings.dbFolder);
  }, [openPlugin, loadSession, settings.dbFolder, settings.autoLoadSession]);

  const handleOpenSession = useCallback(() => {
    setShowSessionPicker(true);
  }, []);

  const handleSaveSession = useCallback(async () => {
    if (!pluginInfo) return;
    try {
      await invoke("save_session_cmd", {
        session: {
          plugin_path: pluginInfo.plugin_path ?? "",
          plugin_name: pluginInfo.plugin_name,
          plugin_info: pluginInfo,
          entries,
          target_language: settings.targetLanguage,
        },
      });
      setLastAutosave(new Date());
      notify(`✓ ${t("session.saved")}`, "success", undefined, 3000);
    } catch (e) {
      notify(`⚠ ${t("session.save_error_title")}`, "error", String(e), 8000);
    }
  }, [pluginInfo, entries, settings.targetLanguage, notify, t]);

  const handleImportTranslations = useCallback(async () => {
    if (!pluginInfo) return;

    const importDefaultPath = settings.exportFolder || defaultExportDir || undefined;
    const selected = await open({
      filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
      title: t("import.pick_title"),
      defaultPath: importDefaultPath,
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;

    try {
      const refEntries = await invoke<TranslationEntry[]>(
        "import_translations_from_plugin_cmd",
        { referencePath: selected },
      );

      const count = applyImportedTranslations(refEntries);

      if (count > 0) {
        notify(
          `✓ ${t("import.success")}`,
          "success",
          t("import.success_detail", { count: count.toLocaleString() }),
          5000,
        );
      } else {
        notify(
          `ℹ ${t("import.none_found")}`,
          "success",
          t("import.none_found_detail"),
          5000,
        );
      }
    } catch (e) {
      notify(`⚠ ${t("import.error_title")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, applyImportedTranslations, notify, t]);

  // ── Format import handler (XML / CSV) ────────────────────────────────────

  const handleImportFormat = useCallback(async (title: string) => {
    if (!pluginInfo) return;
    const selected = await open({
      filters: [{ name: "XML / CSV", extensions: ["xml", "csv", "tsv"] }],
      title,
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const imported = await invoke<Array<{ original: string; translated: string }>>(
        "import_format_cmd", { path: selected },
      );
      const count = applyTextBasedImport(imported);
      if (count > 0) {
        notify(
          `✓ ${t("format.import_success", { count: count.toLocaleString() })}`,
          "success",
          undefined,
          5000,
        );
      } else {
        notify(
          `ℹ ${t("format.import_none")}`,
          "success",
          t("format.import_none_detail"),
          5000,
        );
      }
    } catch (e) {
      notify(`⚠ ${t("format.import_error")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, applyTextBasedImport, notify, t]);

  // ── Format export handlers ────────────────────────────────────────────────

  const handleExportXtXml = useCallback(async () => {
    if (!pluginInfo) return;
    const chosen = await save({
      filters: [{ name: "xTranslator XML", extensions: ["xml"] }],
      defaultPath: (pluginInfo.plugin_name ?? "export") + "_xt.xml",
    });
    if (!chosen) return;
    try {
      const count = await invoke<number>("export_xtranslator_xml_cmd", {
        path:       chosen,
        entries,
        pluginName: pluginInfo.plugin_name ?? "",
        sourceLang: "English",
        destLang:   settings.targetLanguage || "French",
      });
      notify(`✓ ${t("format.success", { count })}`, "success", undefined, 4000);
    } catch (e) {
      notify(`⚠ ${t("format.export_error")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, entries, settings.targetLanguage, notify, t]);

  const handleExportEtXml = useCallback(async () => {
    if (!pluginInfo) return;
    const chosen = await save({
      filters: [{ name: "ESP-ESM Translator XML", extensions: ["xml"] }],
      defaultPath: (pluginInfo.plugin_name ?? "export") + "_et.xml",
    });
    if (!chosen) return;
    try {
      const count = await invoke<number>("export_esptranslator_xml_cmd", {
        path:       chosen,
        entries,
        pluginName: pluginInfo.plugin_name ?? "",
      });
      notify(`✓ ${t("format.success", { count })}`, "success", undefined, 4000);
    } catch (e) {
      notify(`⚠ ${t("format.export_error")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, entries, notify, t]);

  const handleExportCsv = useCallback(async () => {
    if (!pluginInfo) return;
    const chosen = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: (pluginInfo.plugin_name ?? "export") + ".csv",
    });
    if (!chosen) return;
    try {
      const count = await invoke<number>("export_session_csv_cmd", { path: chosen, entries });
      notify(`✓ ${t("format.success", { count })}`, "success", undefined, 4000);
    } catch (e) {
      notify(`⚠ ${t("format.export_error")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, entries, notify, t]);

  // ── DB Converter ─────────────────────────────────────────────────────────

  const handleOpenConverter = useCallback(async () => {
    // Refresh default databases dir each time the modal opens
    try {
      const dir = await invoke<string>("get_databases_dir_cmd", { customDir: null });
      setDefaultDbDir(dir);
    } catch { setDefaultDbDir(""); }
    setShowDbConverter(true);
  }, []);

  const handleConvertConfirm = useCallback(async (opts: import("./components/shared/ConvertToBgtModal").ConvertOpts) => {
    interface ConvertResult { path: string; entry_count: number }
    const cmd = opts.format === "bgtx" ? "convert_to_bgtx_cmd" : "convert_to_bgt_cmd";
    const args = opts.format === "bgtx"
      ? { srcPath: opts.sourcePath, outPath: opts.outputPath, name: opts.dbName, game: opts.game, langFrom: opts.langFrom, langTo: opts.langTo }
      : { srcPath: opts.sourcePath, outPath: opts.outputPath, name: opts.dbName, game: opts.game, langFrom: opts.langFrom, langTo: opts.langTo, readOnly: opts.readOnly };
    const result = await invoke<ConvertResult>(cmd, args);
    notify(
      `✓ ${t("db_converter.success", { count: result.entry_count, name: opts.dbName, ext: opts.format })}`,
      "success", undefined, 6000,
    );
    return { entryCount: result.entry_count };
  }, [notify, t]);

  // ── Compare handler ──────────────────────────────────────────────────────

  const handleOpenCompare = useCallback(async () => {
    // Pre-fetch the session list so CompareModal can auto-detect the old plugin's session
    try {
      const list = await invoke<SessionListItem[]>("list_sessions_cmd");
      setCompareSessions(list);
    } catch { setCompareSessions([]); }
    setShowCompare(true);
  }, []);

  /** Apply a single recovered translation to the current session. */
  const handleRecoverDiff = useCallback((
    formId: number, subType: string, textNew: string | null, translation: string,
  ) => {
    if (!textNew) return;
    const entry = entries.find(
      e => e.form_id === formId && e.sub_type === subType && e.original === textNew,
    );
    if (!entry || entry._idx === undefined) return;
    updateTranslation(entry._idx, translation);
    setStatus(entry._idx, "pending");
    notify(t("compare.recover_success"), "success", undefined, 3000);
  }, [entries, updateTranslation, setStatus, notify, t]);

  /** Apply all recovered translations at once (bulk) — single notification. */
  const handleRecoverAllDiff = useCallback((
    recoveries: Array<{ formId: number; subType: string; textNew: string | null; translation: string }>,
  ) => {
    let applied = 0;
    for (const { formId, subType, textNew, translation } of recoveries) {
      if (!textNew) continue;
      const entry = entries.find(
        e => e.form_id === formId && e.sub_type === subType && e.original === textNew,
      );
      if (!entry || entry._idx === undefined) continue;
      updateTranslation(entry._idx, translation);
      setStatus(entry._idx, "pending");
      applied++;
    }
    if (applied > 0) {
      notify(t("compare.recover_all_success", { count: applied }), "success", undefined, 4000);
    }
  }, [entries, updateTranslation, setStatus, notify, t]);

  const handleExport = useCallback(async () => {
    if (!pluginInfo) return;

    // ── 1. Resolve the source file path ─────────────────────────────────────
    let sourcePath = resolvedSourcePath || pluginInfo.plugin_path || "";
    if (!sourcePath) {
      // Old session without saved path — ask user to locate the original file
      const picked = await open({
        filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
        title: t("export.pick_source_title"),
        multiple: false,
      });
      if (!picked || typeof picked !== "string") return;
      sourcePath = picked;
      setResolvedSourcePath(sourcePath);
    }

    // ── 2. Build the default output path ────────────────────────────────────
    const ext      = (sourcePath.match(/(\.[^./\\]+)$/i)?.[1] ?? ".esp");
    const baseName = (pluginInfo.plugin_name ?? "output") + ext;

    // Compute the output folder:
    //   - If user configured a folder → use it exactly
    //   - Otherwise → Documents/BGS-Translator/Traduction
    const folder = (settings.exportFolder || defaultExportDir || "").replace(/[/\\]+$/, "");

    const defaultOutputPath = folder ? folder + "/" + baseName : baseName;

    console.log("[export] source:", sourcePath);
    console.log("[export] defaultOutputPath:", defaultOutputPath);

    // ── 3. Ensure the target folder exists before showing the dialog ────────
    if (folder) {
      await invoke("ensure_dir_cmd", { path: folder }).catch(() => {});
    }

    // ── 4. Determine final output path ──────────────────────────────────────
    let outputPath: string;
    if (settings.silentExport) {
      // Silent mode — write directly without showing a dialog
      outputPath = defaultOutputPath;
    } else {
      const chosen = await save({
        filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
        defaultPath: defaultOutputPath,
      });
      if (!chosen) return;
      outputPath = chosen;
    }

    // ── 5. Run the export ───────────────────────────────────────────────────
    console.log("[export] Writing to:", outputPath);
    try {
      await invoke("export_plugin_cmd", { sourcePath, outputPath, entries });
      const validated = entries.filter(e => e.status === "validated").length;
      notify(
        `✓ ${t("export.success")}`, "success",
        t("export.success_detail", { count: validated.toLocaleString(), total: entries.length.toLocaleString() }),
        6000,
      );
    } catch (e) {
      notify(`⚠ ${t("export.error_title")}`, "error", String(e), 10000);
    }
  }, [pluginInfo, resolvedSourcePath, defaultExportDir, entries,
      settings.exportFolder, settings.silentExport, notify, t]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Keyboard shortcuts ──────────────────────────────────────────────────── */

  const handleTableKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (matchShortcut(e, sc.nextEntry)) { e.preventDefault(); navigateBy(1); return; }
    if (matchShortcut(e, sc.prevEntry)) { e.preventDefault(); navigateBy(-1); return; }

    if (matchShortcut(e, sc.validateEntry) && selectedEntry) {
      e.preventDefault();
      setStatus(selectedEntry._idx ?? 0, "validated");
      navigateBy(1);
      return;
    }

    if (matchShortcut(e, sc.copyOriginal) && selectedEntry) {
      navigator.clipboard.writeText(selectedEntry.original).catch(() => {});
      return;
    }

    if (matchShortcut(e, sc.pasteTranslation) && selectedEntry) {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        updateTranslation(selectedEntry._idx ?? 0, text);
      }).catch(() => {});
      return;
    }

    // Smart typing — printable character with no modifier
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && selectedEntry) {
      const current = selectedEntry.translated;
      updateTranslation(selectedEntry._idx ?? 0, current + e.key);
      e.preventDefault();
      requestAnimationFrame(() => editPanelRef.current?.focus());
    }
  }, [sc, navigateBy, selectedEntry, setStatus, updateTranslation]);

  const handleRowClickWrapped = useCallback((entry: TranslationEntry, ctrlKey: boolean, shiftKey: boolean) => {
    handleRowClick(entry, ctrlKey, shiftKey);
  }, [handleRowClick]);

  const focusTable   = useCallback(() => tableRef.current?.focus(), []);

  const handleAddToPersonalDb = useCallback(async () => {
    const dbPath = settings.activePersonalDbPath;
    if (!dbPath) {
      notify(`⚠ ${t("personal_db.no_active_title")}`, "error", t("personal_db.no_active_desc"), 6000);
      return;
    }
    const toAdd = entries.filter(e => selectedKeys.has(String(e._idx)) && e.translated);
    if (toAdd.length === 0) return;
    const info = await addToPersonalDb(dbPath, toAdd, {
      game:     pluginInfo ? undefined : undefined,
      langFrom: "en",
      langTo:   settings.targetLanguage || "fr",
    });
    if (info) {
      notify(`✓ ${t("personal_db.add_success_title")}`,
        "success",
        t("personal_db.add_success_desc", { count: toAdd.length, db: info.name }),
        5000,
      );
    }
    clearSelection();
  }, [entries, selectedKeys, settings.activePersonalDbPath, settings.targetLanguage, addToPersonalDb, notify, t, pluginInfo, clearSelection]);

  /** Add the currently open single entry to the active personal DB. */
  const handleAddSingleToPersonalDb = useCallback(async () => {
    const dbPath = settings.activePersonalDbPath;
    if (!dbPath || !selectedEntry || !selectedEntry.translated) return;
    const info = await addToPersonalDb(dbPath, [selectedEntry], {
      langFrom: "en",
      langTo:   settings.targetLanguage || "fr",
    });
    if (info) {
      notify(`✓ ${t("personal_db.add_success_title")}`, "success",
        t("personal_db.add_success_desc", { count: 1, db: info.name }), 4000);
    }
  }, [selectedEntry, settings.activePersonalDbPath, settings.targetLanguage, addToPersonalDb, notify, t]);

  /** Apply fuzzy suggestions to the current selection. */
  const handleApplyFuzzySelection = useCallback(() => {
    const count = applyFuzzyToSelection();
    if (count > 0) {
      notify(t("fuzzy.bulk_applied", { count }), "success", undefined, 4000);
    }
  }, [applyFuzzyToSelection, notify, t]);

  /** Apply personal DB to all entries (global, from menu). */
  const handleApplyPersonalDbAll = useCallback(async () => {
    if (!settings.activePersonalDbPath) {
      notify(`⚠ ${t("personal_db.no_active_title")}`, "error", t("personal_db.no_active_desc"), 6000);
      return;
    }
    const matched = await applyPersonalDbManual();
    if (matched > 0) {
      notify(`✓ ${t("personal_db.apply_banner_title")}`, "success",
        t("personal_db.apply_banner_desc", { count: matched }), 5000);
    } else {
      notify(`${t("personal_db.apply_banner_title")}`, "success",
        t("personal_db.apply_no_match"), 4000);
    }
  }, [settings.activePersonalDbPath, applyPersonalDbManual, notify, t]);

  /** Apply personal DB only to the current selection (from BulkActionBar). */
  const handleApplyPersonalDbSelection = useCallback(async () => {
    if (!settings.activePersonalDbPath) {
      notify(`⚠ ${t("personal_db.no_active_title")}`, "error", t("personal_db.no_active_desc"), 6000);
      return;
    }
    const matched = await applyPersonalDbManual(selectedKeys);
    if (matched > 0) {
      notify(`✓ ${t("personal_db.apply_banner_title")}`, "success",
        t("personal_db.apply_banner_desc", { count: matched }), 5000);
    } else {
      notify(`${t("personal_db.apply_banner_title")}`, "success",
        t("personal_db.apply_no_match"), 4000);
    }
    clearSelection();
  }, [settings.activePersonalDbPath, applyPersonalDbManual, selectedKeys, notify, t, clearSelection]);

  const handleDeeplBatch = useCallback(async () => {
    if (!settings.deeplApiKey || deeplBatchLoading) return;
    const selected = entries.filter(e => selectedKeys.has(String(e._idx)));
    if (selected.length === 0) return;
    setDeeplBatchLoading(true);
    try {
      const results = await invoke<string[]>("translate_deepl_batch_cmd", {
        apiKey:     settings.deeplApiKey,
        apiType:    settings.deeplApiType ?? "free",
        texts:      selected.map(e => e.original),
        targetLang: settings.targetLanguage,
      });
      let updated = 0;
      results.forEach((translation, i) => {
        if (translation && selected[i] !== undefined) {
          updateTranslation(selected[i]._idx ?? i, translation);
          updated++;
        }
      });
      notify(t("deepl.batch_ok", { count: updated }), "success");
      clearSelection();
    } catch (e) {
      const msg = String(e);
      const label =
        msg === "deepl_invalid_key"       ? t("deepl.error_invalid_key")       :
        msg === "deepl_quota_exceeded"    ? t("deepl.error_quota")             :
        msg === "deepl_no_api_key"        ? t("deepl.error_no_api_key")        :
        msg === "deepl_too_many_requests" ? t("deepl.error_too_many_requests") :
        msg;
      notify(label, "error");
    } finally {
      setDeeplBatchLoading(false);
    }
  }, [settings, entries, selectedKeys, updateTranslation, notify, t, deeplBatchLoading, clearSelection]);

  /* ── Global shortcuts (Ctrl+O, Ctrl+S, etc.) ────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "o") { e.preventDefault(); handleOpenPlugin(); }
      if (ctrl && e.key === "s" && pluginInfo) { e.preventDefault(); handleSaveSession(); }
      if (ctrl && e.key === "i" && pluginInfo) { e.preventDefault(); handleImportTranslations(); }
      if (ctrl && e.key === "e" && pluginInfo) { e.preventDefault(); handleExport(); }
      if (ctrl && e.key === ",") { e.preventDefault(); setShowSettings(true); }
      // Global find & replace — uses configurable shortcut
      if (pluginInfo && matchShortcut(e, sc.globalFind ?? DEFAULT_SHORTCUTS.globalFind)) {
        e.preventDefault();
        setShowGlobalFind(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenPlugin, handleSaveSession, handleImportTranslations, handleExport, pluginInfo, sc.globalFind]);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <IconSetContext.Provider value={activeIconSet}>
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)", overflow: "hidden", fontFamily: "var(--font-ui, system-ui, sans-serif)" }}>

      {/* ── Menu bar ──────────────────────────────────────────────────────── */}
      <MenuBar
        pluginLoaded={!!pluginInfo}
        loading={loading}
        onOpenPlugin={handleOpenPlugin}
        onOpenSession={handleOpenSession}
        onSave={pluginInfo ? handleSaveSession : undefined}
        onImport={pluginInfo ? handleImportTranslations : undefined}
        onExport={pluginInfo ? handleExport : undefined}
        onSettings={() => setShowSettings(true)}
        onSettingsDb={() => setShowSettings(true)}
        onChangelog={() => setShowChangelog(true)}
        alternateRows={settings.alternateRows !== false}
        onToggleAlternateRows={() => updateSettings({ alternateRows: !settings.alternateRows })}
        showColumnFilters={showColumnFilters}
        onToggleColumnFilters={() => setShowColumnFilters((v) => !v)}
        onImportXtXml={pluginInfo ? () => handleImportFormat(t("format.import_xt_title")) : undefined}
        onImportEtXml={pluginInfo ? () => handleImportFormat(t("format.import_et_title")) : undefined}
        onImportCsv={pluginInfo   ? () => handleImportFormat(t("format.import_csv_title")) : undefined}
        onExportXtXml={pluginInfo ? handleExportXtXml : undefined}
        onExportEtXml={pluginInfo ? handleExportEtXml : undefined}
        onExportCsv={pluginInfo   ? handleExportCsv   : undefined}
        onOpenConverter={handleOpenConverter}
        onOpenCompare={handleOpenCompare}
        onGlobalFind={pluginInfo ? () => setShowGlobalFind(true) : undefined}
        globalFindShortcut={formatShortcut(sc.globalFind ?? DEFAULT_SHORTCUTS.globalFind)}
        onApplyPersonalDb={pluginInfo ? handleApplyPersonalDbAll : undefined}
        hasActivePersonalDb={!!settings.activePersonalDbPath}
      />

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <ToolBar
        pluginName={pluginInfo?.plugin_name ?? null}
        loading={loading}
        loadingProgress={loadingProgress}
        onOpenPlugin={handleOpenPlugin}
        onOpenSession={handleOpenSession}
        onSave={pluginInfo ? handleSaveSession : undefined}
        onExport={pluginInfo ? handleExport : undefined}
        onSettings={() => setShowSettings(true)}
        iconSet={activeIconSet}
        lastAutosave={lastAutosave}
      />

      {/* ── Notifications — fixed-height slot so content below never shifts ── */}
      <div style={{ height: 30, flexShrink: 0 }}>
        {notification && (
          <NotificationBanner notification={notification} onDismiss={dismissNotification} />
        )}
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {error && (
          <div style={{ padding: "6px 14px", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 12, borderBottom: "1px solid rgba(239,68,68,0.2)", flexShrink: 0 }}>
            {error}
          </div>
        )}

        <FilterBar
          filter={filter}
          search={search}
          isLocalized={pluginInfo?.is_localized ?? false}
          showColumnFilters={showColumnFilters}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onToggleColumnFilters={() => setShowColumnFilters((v) => !v)}
          filterFuzzyOnly={filterFuzzyOnly}
          onToggleFuzzyOnly={() => setFilterFuzzyOnly((v) => !v)}
          fuzzyMatchCount={fuzzyMatchCount}
        />

        <BulkActionBar
          count={selectedCount}
          totalVisible={displayEntries.length}
          onSetStatus={bulkSetStatus}
          onApplyFromPersonalDb={settings.activePersonalDbPath ? handleApplyPersonalDbSelection : undefined}
          onAddToPersonalDb={settings.activePersonalDbPath ? handleAddToPersonalDb : undefined}
          personalDbName={personalDbInfoLoaded?.name ?? undefined}
          onClear={clearSelection}
          onSelectAll={pluginInfo ? () => selectAll(displayEntries) : undefined}
          onDeeplBatch={settings.deeplApiKey ? handleDeeplBatch : undefined}
          deeplBatchLoading={deeplBatchLoading}
          onApplyFuzzy={pluginInfo ? handleApplyFuzzySelection : undefined}
          fuzzyMatchCount={fuzzyMatchCount}
        />

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <GroupPanel
            groups={groupStats}
            selectedGroup={selectedGroup}
            totalEntries={entries.length}
            onSelectGroup={setSelectedGroup}
            sidebarWidth={layout.sidebarWidth}
            onSidebarResize={setSidebarWidth}
            recordColors={resolvedRecordColors}
          />

          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <TranslationTable
              entries={displayEntries}
              selectedEntry={selectedEntry}
              selectedKeys={selectedKeys}
              sortConfig={sortConfig}
              columnFilters={columnFilters}
              showColumnFilters={showColumnFilters}
              alternateRows={settings.alternateRows !== false}
              rowHover={settings.rowHover !== false}
              columnWidths={layout.columnWidths}
              textSplit={layout.textSplit}
              onRowClick={handleRowClickWrapped}
              onToggleSort={toggleSort as (col: SortConfig["column"]) => void}
              onColumnFilter={setColumnFilter}
              onKeyDown={handleTableKeyDown}
              onColumnResize={setColumnWidth}
              onTextSplit={setTextSplit}
              recordColors={resolvedRecordColors}
              tableRef={tableRef}
              fuzzyMatches={fuzzyMatches}
            />

            {selectedEntry && selectedCount < 2 && (
              <EditPanel
                ref={editPanelRef}
                entry={selectedEntry}
                onTranslate={updateTranslation}
                onSetStatus={setStatus}
                onClose={() => setSelectedEntry(null)}
                onFocusTable={focusTable}
                panelHeight={layout.editPanelHeight}
                onPanelResize={setEditPanelHeight}
                recordColors={resolvedRecordColors}
                editShortcuts={settings.editShortcuts}
                spellLang={settings.spellLang || undefined}
                spellRealtime={settings.spellRealtime}
                spellDebounce={settings.spellDebounce}
                deeplApiKey={settings.deeplApiKey || undefined}
                deeplApiType={settings.deeplApiType}
                deeplTargetLang={settings.targetLanguage}
                onAddToPersonalDb={settings.activePersonalDbPath ? handleAddSingleToPersonalDb : undefined}
                personalDbName={personalDbInfoLoaded?.name ?? undefined}
                fuzzyMatch={selectedEntry._idx !== undefined ? fuzzyMatches.get(selectedEntry._idx) : undefined}
                onAcceptFuzzy={selectedEntry._idx !== undefined ? () => acceptFuzzy(selectedEntry._idx!) : undefined}
                onDismissFuzzy={selectedEntry._idx !== undefined ? () => dismissFuzzy(selectedEntry._idx!) : undefined}
                onRunFuzzy={settings.fuzzy && selectedEntry._idx !== undefined
                  ? async () => {
                      const { match, reason } = await runFuzzySingle(selectedEntry, settings.fuzzy!);
                      if (reason === "no_sources") {
                        notify(t("fuzzy.scan_no_sources"), "success", undefined, 3000);
                      } else if (!match) {
                        notify(t("fuzzy.scan_none"), "success", undefined, 3000);
                      }
                      // match found → bandeau appears automatically, no extra notif needed
                    }
                  : undefined}
                fuzzyScanning={fuzzyScanning}
              />
            )}

            <StatusBar
              total={entries.length}
              untranslated={untranslatedCount}
              pending={pendingCount}
              validated={translatedCount}
              ignored={ignoredCount}
              filtered={displayEntries.length}
              appVersion={appVersion}
              lastAutosave={lastAutosave}
              onChangelog={() => setShowChangelog(true)}
            />
          </div>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
          onOpenThemeManager={() => { setShowSettings(false); setShowThemeManager(true); }}
          onResetLayout={resetLayout}
          defaultExportDir={defaultExportDir}
        />
      )}

      {showThemeManager && (
        <ThemeManagerModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => { setShowThemeManager(false); setShowSettings(true); }}
        />
      )}

      {showUpdateModal && update && (
        <UpdateModal
          version={update.version}
          notes={update.notes}
          onClose={() => setShowUpdateModal(false)}
        />
      )}

      {showChangelog && (
        <ChangelogModal
          appVersion={appVersion}
          onClose={() => setShowChangelog(false)}
        />
      )}

      {showSessionPicker && (
        <SessionPickerModal
          onClose={() => setShowSessionPicker(false)}
          onLoad={(id) => {
            setShowSessionPicker(false);
            loadSession(id, settings.dbFolder);
          }}
          iconSet={activeIconSet}
        />
      )}

      {showDbConverter && (
        <ConvertToBgtModal
          defaultOutputDir={defaultDbDir}
          onClose={() => setShowDbConverter(false)}
          onConvert={handleConvertConfirm}
        />
      )}

      {showCompare && (
        <CompareModal
          activePluginPath={pluginInfo?.plugin_path ?? null}
          activePluginName={pluginInfo?.plugin_name ?? null}
          sessions={compareSessions}
          onClose={() => setShowCompare(false)}
          onRecover={handleRecoverDiff}
          onRecoverAll={handleRecoverAllDiff}
        />
      )}

      {showGlobalFind && pluginInfo && (
        <GlobalFindReplaceModal
          entries={entries}
          displayEntries={displayEntries}
          onClose={() => setShowGlobalFind(false)}
          onUpdateTranslation={updateTranslation}
          onNavigate={(entry) => { setSelectedEntry(entry); }}
          shortcutLabel={formatShortcut(sc.globalFind ?? DEFAULT_SHORTCUTS.globalFind)}
        />
      )}
    </div>
    </IconSetContext.Provider>
  );
}
