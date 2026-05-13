import { useState, useEffect, useCallback, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";

import "./i18n";
import { useSettings } from "./hooks/useSettings";
import { usePlugin } from "./hooks/usePlugin";
import { useLayout } from "./hooks/useLayout";
import { DEFAULT_SHORTCUTS } from "./types";
import type { SortConfig, TranslationEntry, ShortcutDef } from "./types";
import { THEME_PRESETS, DEFAULT_RECORD_COLORS } from "./themes";
import type { IconSetId } from "./themes";

import MenuBar     from "./components/layout/MenuBar";
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
    filter, setFilter, search, setSearch,
    selectedGroup, setSelectedGroup,
    selectedEntry, setSelectedEntry,
    selectedKeys, handleRowClick,
    sortConfig, toggleSort,
    groupStats,
    translatedCount, pendingCount, ignoredCount, untranslatedCount,
    openPlugin, loadSession,
    updateTranslation, setStatus, navigateBy, bulkSetStatus,
    selectedCount,
    columnFilters, setColumnFilter,
    dbApplyResult, clearDbApplyResult,
    dbNotFound, clearDbNotFound,
    loadedDbInfo,
  } = usePlugin();

  const [showSettings,       setShowSettings]       = useState(false);
  const [showThemeManager,   setShowThemeManager]   = useState(false);
  const [showUpdateModal,    setShowUpdateModal]     = useState(false);
  const [showChangelog,      setShowChangelog]       = useState(false);
  const [showSessionPicker,  setShowSessionPicker]  = useState(false);
  const [update,             setUpdate]             = useState<UpdateInfo | null>(null);
  const [showColumnFilters,  setShowColumnFilters]  = useState(false);
  const [appVersion,         setAppVersion]         = useState("0.1.0");
  const [lastAutosave,       setLastAutosave]       = useState<Date | null>(null);
  const [sessionError,       setSessionError]       = useState<string | null>(null);

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
            plugin_path: "",
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

  /* ── File actions ────────────────────────────────────────────────────────── */

  const handleOpenPlugin = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    await openPlugin(selected, settings.dbFolder);
  }, [openPlugin, settings.dbFolder]);

  const handleOpenSession = useCallback(() => {
    setShowSessionPicker(true);
  }, []);

  const handleSaveSession = useCallback(async () => {
    if (!pluginInfo) return;
    setSessionError(null);
    try {
      await invoke("save_session_cmd", {
        session: {
          plugin_path: "",
          plugin_name: pluginInfo.plugin_name,
          plugin_info: pluginInfo,
          entries,
          target_language: settings.targetLanguage,
        },
      });
      setLastAutosave(new Date());
    } catch (e) {
      setSessionError(String(e));
    }
  }, [pluginInfo, entries, settings.targetLanguage]);

  const handleExport = useCallback(async () => {
    if (!pluginInfo) return;
    const path = await save({ filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm"] }] });
    if (!path) return;
    await invoke("export_plugin_cmd", { sourcePath: "", outputPath: path, entries });
  }, [pluginInfo, entries]);

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
      if (ctrl && e.key === "e" && pluginInfo) { e.preventDefault(); handleExport(); }
      if (ctrl && e.key === ",") { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenPlugin, handleSaveSession, handleExport, pluginInfo]);

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
        onExport={pluginInfo ? handleExport : undefined}
        onSettings={() => setShowSettings(true)}
        onSettingsDb={() => setShowSettings(true)}
        onChangelog={() => setShowChangelog(true)}
        alternateRows={settings.alternateRows !== false}
        onToggleAlternateRows={() => updateSettings({ alternateRows: !settings.alternateRows })}
        showColumnFilters={showColumnFilters}
        onToggleColumnFilters={() => setShowColumnFilters((v) => !v)}
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

      {/* ── DB auto-apply success banner ──────────────────────────────────── */}
      {dbApplyResult !== null && (
        <div style={{
          padding: "5px 14px", flexShrink: 0,
          background: "rgba(34,197,94,0.1)", borderBottom: "1px solid rgba(34,197,94,0.2)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
        }}>
          <span style={{ color: "#22c55e", fontWeight: 700 }}>✓ {t("db.banner_title")}</span>
          <span style={{ color: "var(--text-2)" }}>
            <strong style={{ color: "var(--text-1)" }}>{dbApplyResult}</strong>{" "}
            {t("db.banner_suffix", { count: dbApplyResult })}
          </span>
          {loadedDbInfo && (
            <span style={{ color: "var(--text-3)", fontSize: 11 }}>
              — {loadedDbInfo.name} ({loadedDbInfo.game})
            </span>
          )}
          <button onClick={clearDbApplyResult} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 14 }}>×</button>
        </div>
      )}

      {/* ── No DB found for detected game ─────────────────────────────────── */}
      {dbNotFound && (
        <div style={{
          padding: "5px 14px", flexShrink: 0,
          background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.25)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
        }}>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠ {t("db.no_db_title")}</span>
          <span style={{ color: "var(--text-2)" }}>
            {t("db.no_db_message", { game: dbNotFound })}
          </span>
          <button onClick={clearDbNotFound} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 14 }}>×</button>
        </div>
      )}

      {/* ── Session save error ────────────────────────────────────────────── */}
      {sessionError && (
        <div style={{
          padding: "5px 14px", flexShrink: 0,
          background: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.25)",
          display: "flex", alignItems: "center", gap: 10, fontSize: 12,
        }}>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠ {t("session.save_error_title")}</span>
          <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>{sessionError}</span>
          <button onClick={() => setSessionError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 14 }}>×</button>
        </div>
      )}

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
    </div>
  );
}
