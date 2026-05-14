import { useState, useEffect, useCallback, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";

import "./i18n";
import { useSettings } from "./hooks/useSettings";
import { usePlugin } from "./hooks/usePlugin";
import { useLayout } from "./hooks/useLayout";
import { DEFAULT_SHORTCUTS } from "./types";
import type { SortConfig, TranslationEntry, ShortcutDef, SessionListItem } from "./types";
import { THEME_PRESETS, DEFAULT_RECORD_COLORS } from "./themes";
import type { IconSetId } from "./themes";

import MenuBar          from "./components/layout/MenuBar";
import ConvertToBgtModal from "./components/shared/ConvertToBgtModal";
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

function matchShortcut(e: React.KeyboardEvent, sc: ShortcutDef): boolean {
  if (e.key !== sc.key) return false;
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
    sortConfig, toggleSort,
    groupStats,
    translatedCount, pendingCount, ignoredCount, untranslatedCount,
    openPlugin, loadSession,
    updateTranslation, setStatus, navigateBy, bulkSetStatus, applyImportedTranslations, applyTextBasedImport,
    selectedCount,
    columnFilters, setColumnFilter,
    dbApplyResult, clearDbApplyResult,
    dbNotFound, clearDbNotFound,
    loadedDbInfo,
  } = usePlugin({
    propagateIdentical: settings.propagateIdentical !== false,
    dbApplyValidates:   settings.dbApplyValidates   !== false,
  });

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
      }
      // Always ensure the folder exists on startup (logged server-side)
      invoke("ensure_dir_cmd", { path: base }).catch(() => {});
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create the configured export folder whenever it changes, so the save dialog opens there
  useEffect(() => {
    if (!settings.exportFolder) return;
    invoke("ensure_dir_cmd", { path: settings.exportFolder }).catch(() => {});
  }, [settings.exportFolder]);

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
  // null = modal closed, string = source file path shown in the ConvertToBgt modal
  const [convertBgtSource,   setConvertBgtSource]   = useState<string | null>(null);
  const [defaultDbDir,       setDefaultDbDir]       = useState<string>("");

  const notify = useCallback((message: string, type: Notification["type"], detail?: string, duration?: number) => {
    setNotification({ message, type, detail, key: Date.now(), duration });
  }, []);
  const dismissNotification = useCallback(() => setNotification(null), []);

  const editPanelRef = useRef<EditPanelHandle>(null);
  const tableRef     = useRef<HTMLDivElement>(null);

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
    if (dbApplyResult === null) return;
    const detail = `${dbApplyResult.toLocaleString()} ${t("db.banner_suffix", { count: dbApplyResult })}${loadedDbInfo ? ` — ${loadedDbInfo.name} (${loadedDbInfo.game})` : ""}`;
    notify(`✓ ${t("db.banner_title")}`, "success", detail, 6000);
    clearDbApplyResult();
  }, [dbApplyResult]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Convert to .bgt ──────────────────────────────────────────────────────

  const handleConvertToBgt = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "XML / CSV / EET", extensions: ["xml", "csv", "tsv", "eet"] }],
      title: t("format.convert_title"),
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    // Fetch (or refresh) default databases dir
    try {
      const dir = await invoke<string>("get_databases_dir_cmd", { customDir: null });
      setDefaultDbDir(dir);
    } catch {
      setDefaultDbDir("");
    }
    setConvertBgtSource(selected);
  }, [t]);

  const handleConvertConfirm = useCallback(async (opts: {
    dbName: string; game: string; langFrom: string; langTo: string;
    outputFolder: string; readOnly: boolean;
  }) => {
    if (!convertBgtSource) return;
    const sourcePath = convertBgtSource;
    setConvertBgtSource(null);

    // Build output path from chosen output folder
    const folder     = opts.outputFolder.replace(/\\/g, "/").replace(/\/$/, "");
    const outputPath = (folder ? folder + "/" : "") + opts.dbName + ".bgt";

    try {
      const count = await invoke<number>("convert_to_bgt_cmd", {
        sourcePath,
        outputPath,
        dbName:   opts.dbName,
        game:     opts.game,
        langFrom: opts.langFrom,
        langTo:   opts.langTo,
        readOnly: opts.readOnly,
      });
      notify(
        `✓ ${t("convert_bgt.success", { count, name: opts.dbName })}`,
        "success",
        undefined,
        6000,
      );
    } catch (e) {
      notify(`⚠ ${t("convert_bgt.error", { error: String(e) })}`, "error", String(e), 10000);
    }
  }, [convertBgtSource, notify, t]);

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
  const clearSelection = useCallback(() => setSelectedEntry(null), [setSelectedEntry]);

  const handleAddToDb = useCallback(async () => {
    const toAdd = entries.filter(e => selectedKeys.has(String(e._idx)) && e.translated);
    if (toAdd.length === 0) return;
    try {
      const count = await invoke<number>("add_to_db_cmd", { entries: toAdd });
      alert(t("db.added", { count }));
    } catch (e) { alert(t("db.error", { error: String(e) })); }
  }, [entries, selectedKeys, t]);

  /* ── Global shortcuts (Ctrl+O, Ctrl+S, etc.) ────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "o") { e.preventDefault(); handleOpenPlugin(); }
      if (ctrl && e.key === "s" && pluginInfo) { e.preventDefault(); handleSaveSession(); }
      if (ctrl && e.key === "i" && pluginInfo) { e.preventDefault(); handleImportTranslations(); }
      if (ctrl && e.key === "e" && pluginInfo) { e.preventDefault(); handleExport(); }
      if (ctrl && e.key === ",") { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenPlugin, handleSaveSession, handleImportTranslations, handleExport, pluginInfo]);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
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
        onConvertToBgt={handleConvertToBgt}
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
        />

        <BulkActionBar
          count={selectedCount}
          onSetStatus={bulkSetStatus}
          onAddToDb={loadedDbInfo && !loadedDbInfo.read_only ? handleAddToDb : undefined}
          onClear={clearSelection}
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
            />

            {selectedEntry && (
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
              />
            )}

            <StatusBar
              total={entries.length}
              untranslated={untranslatedCount}
              pending={pendingCount}
              validated={translatedCount}
              ignored={ignoredCount}
              filtered={displayEntries.length}
              selectedCount={selectedCount}
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
          onClose={() => setShowThemeManager(false)}
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

      <ConvertToBgtModal
        isOpen={!!convertBgtSource}
        sourceFile={convertBgtSource ?? ""}
        defaultOutputDir={defaultDbDir}
        onClose={() => setConvertBgtSource(null)}
        onConfirm={handleConvertConfirm}
      />
    </div>
  );
}
