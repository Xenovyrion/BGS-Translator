import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import type { DbBrowseEntry, DbBrowseResult, RecordTypeCount } from "../../types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE  = 200;
const LEFT_W     = 200;   // left type-filter panel width (px)
const WIN_MIN_W  = 700;
const WIN_MIN_H  = 420;
const TITLE_H    = 36;

type SortKey = "record_type" | "form_id" | "editor_id" | "original" | "translated";

interface SrPreviewItem {
  idx:          number;
  original_text: string;
  before:       string;
  after:        string;
}

interface NewRowState {
  original:    string;
  translated:  string;
  record_type: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  refDbLoaded:     boolean;
  refDbPath?:      string;          // path of the loaded .bgt (needed to save after edits)
  personalDbPath?: string;
  initialTab?:     "ref" | "perso";
  initialSearch?:  string;
  onApply?:        (translated: string) => void;
  onClose:         () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formIdHex(id: number) {
  return id === 0 ? "—" : id.toString(16).toUpperCase().padStart(8, "0");
}

function coveragePct(count: number, translated: number) {
  return count === 0 ? 0 : Math.round((translated / count) * 100);
}

function sortEntries(entries: DbBrowseEntry[], col: SortKey | null, dir: "asc" | "desc") {
  if (!col) return entries;
  return [...entries].sort((a, b) => {
    let va: string | number = a[col as keyof DbBrowseEntry] as string | number;
    let vb: string | number = b[col as keyof DbBrowseEntry] as string | number;
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DbManagerModal({
  refDbLoaded, refDbPath, personalDbPath, initialTab, initialSearch, onApply, onClose,
}: Props) {
  const { t } = useTranslation();

  // ── Window position + size ──
  const [pos,  setPos]  = useState(() => ({
    x: Math.max(0, (window.innerWidth  - 1100) / 2),
    y: Math.max(0, (window.innerHeight - 660)  / 2),
  }));
  const [size, setSize] = useState({ w: 1100, h: 660 });
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  const posDragRef    = useRef<{ ox: number; oy: number } | null>(null);
  const resizeDragRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const colDragRef    = useRef<{ col: number; startX: number; startW: number } | null>(null);

  // ── Column widths (type, formid, edid) ──
  const [colW, setColW] = useState([65, 95, 130]);
  const flexW = Math.max(100, (size.w - LEFT_W - 1 - colW[0] - colW[1] - colW[2]) / 2);

  // ── Tab ──
  const defaultTab: "ref" | "perso" =
    initialTab ?? (refDbLoaded ? "ref" : personalDbPath ? "perso" : "ref");
  const [tab, setTab] = useState<"ref" | "perso">(defaultTab);

  // ── Browse data ──
  const [recordTypes,  setRecordTypes]  = useState<RecordTypeCount[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [search,       setSearch]       = useState(initialSearch ?? "");
  const [searchInput,  setSearchInput]  = useState(initialSearch ?? "");
  const [entries,      setEntries]      = useState<DbBrowseEntry[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ── Sort ──
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Selection ──
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // ── Edit mode (perso tab only) ──
  const [editMode,     setEditMode]     = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Map<number, string>>(new Map());
  const [newRow,       setNewRow]       = useState<NewRowState | null>(null);
  const [saving,       setSaving]       = useState(false);

  // ── Search & Replace ──
  const [showSR,      setShowSR]      = useState(false);
  const [srFind,      setSrFind]      = useState("");
  const [srReplace,   setSrReplace]   = useState("");
  const [srRegex,     setSrRegex]     = useState(false);
  const [srPreview,   setSrPreview]   = useState<SrPreviewItem[]>([]);
  const [srLoading,   setSrLoading]   = useState(false);
  const [srError,     setSrError]     = useState<string | null>(null);

  const source = tab === "ref" ? "ref_db" : "personal_db";

  // ── Reset edit state when tab changes ──────────────────────────────────────
  useEffect(() => {
    setEditMode(false);
    setPendingEdits(new Map());
    setNewRow(null);
    setShowSR(false);
    setSrPreview([]);
    setSrError(null);
    setError(null);
  }, [tab]);

  // ── Load record types ──────────────────────────────────────────────────────

  const reloadRecordTypes = useCallback(() => {
    if (tab === "ref"   && !refDbLoaded)    return;
    if (tab === "perso" && !personalDbPath) return;
    invoke<RecordTypeCount[]>("get_db_record_types_cmd", {
      source,
      personalDbPath: tab === "perso" ? personalDbPath : undefined,
    })
      .then(setRecordTypes)
      .catch(e => setError(String(e)));
  }, [tab, refDbLoaded, personalDbPath, source]);

  useEffect(() => {
    setRecordTypes([]); setSelectedType(""); setEntries([]);
    setTotal(0); setPage(0); setError(null);
    reloadRecordTypes();
  }, [tab, refDbLoaded, personalDbPath]); // eslint-disable-line

  // ── Load entries ───────────────────────────────────────────────────────────

  const loadEntries = useCallback(async (
    src: string, rt: string, sq: string, pg: number,
  ) => {
    if (tab === "ref"   && !refDbLoaded)    return;
    if (tab === "perso" && !personalDbPath) return;
    setLoading(true); setError(null);
    try {
      const result = await invoke<DbBrowseResult>("get_db_entries_cmd", {
        source:         src,
        personalDbPath: tab === "perso" ? personalDbPath : undefined,
        recordType:     rt || undefined,
        search:         sq || undefined,
        offset:         pg * PAGE_SIZE,
        limit:          PAGE_SIZE,
      });
      setEntries(result.entries);
      setTotal(result.total);
      setSelectedIdx(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [tab, refDbLoaded, personalDbPath]); // eslint-disable-line

  useEffect(() => {
    loadEntries(source, selectedType, search, page);
  }, [source, selectedType, search, page, loadEntries]);

  const reloadAll = useCallback(() => {
    reloadRecordTypes();
    loadEntries(source, selectedType, search, page);
  }, [reloadRecordTypes, loadEntries, source, selectedType, search, page]);

  // ── Debounce search ────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── ESC to close ──────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── Window drag ───────────────────────────────────────────────────────────

  const onTitleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return;
    posDragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!posDragRef.current) return;
      // No clamping — allow free drag beyond window edges
      setPos({
        x: ev.clientX - posDragRef.current.ox,
        y: ev.clientY - posDragRef.current.oy,
      });
    };
    const onUp = () => {
      posDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Window resize ─────────────────────────────────────────────────────────

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeDragRef.current = { sx: e.clientX, sy: e.clientY, sw: size.w, sh: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const { sx, sy, sw, sh } = resizeDragRef.current;
      setSize({
        w: Math.max(WIN_MIN_W, sw + ev.clientX - sx),
        h: Math.max(WIN_MIN_H, sh + ev.clientY - sy),
      });
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Column resize ─────────────────────────────────────────────────────────

  const onColResizeMouseDown = (colIdx: number, startW: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    colDragRef.current = { col: colIdx, startX: e.clientX, startW };
    document.body.style.cursor = "col-resize";
    const onMove = (ev: MouseEvent) => {
      if (!colDragRef.current) return;
      const delta = ev.clientX - colDragRef.current.startX;
      const newW  = Math.max(40, colDragRef.current.startW + delta);
      setColW(prev => {
        const next = [...prev];
        next[colDragRef.current!.col] = newW;
        return next;
      });
    };
    const onUp = () => {
      colDragRef.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Sort toggle ────────────────────────────────────────────────────────────

  const toggleSort = (key: SortKey) => {
    if (sortCol === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(key); setSortDir("asc"); }
  };

  // ── Edit actions ───────────────────────────────────────────────────────────

  const handleValider = async () => {
    if (!dbPath) return;
    setSaving(true);
    setError(null);
    try {
      if (pendingEdits.size > 0) {
        const updates = [...pendingEdits.entries()].map(([idx, translated]) => ({ idx, translated }));
        await invoke(cmdUpdate, { path: dbPath, updates });
      }
      if (newRow && newRow.original.trim()) {
        await invoke(cmdAddRow, {
          path:        dbPath,
          original:    newRow.original,
          translated:  newRow.translated,
          recordType:  newRow.record_type,
          subType:     "",
          editorId:    "",
        });
      }
      setPendingEdits(new Map());
      setNewRow(null);
      setEditMode(false);
      reloadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAnnuler = () => {
    setPendingEdits(new Map());
    setNewRow(null);
    setEditMode(false);
    setShowSR(false);
    setSrPreview([]);
  };

  const handlePurge = async () => {
    if (!dbPath) return;
    setSaving(true);
    setError(null);
    try {
      const removed = await invoke<number>(cmdPurge, { path: dbPath });
      if (removed > 0) reloadAll();
      log_info(`[db_manager] Purged ${removed} entries`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (!dbPath) return;
    try {
      const selected = await dialogOpen({
        multiple: false,
        title:    t("db_manager.import_dialog_title"),
        filters:  [
          { name: t("db_manager.import_filter_all"), extensions: ["eet", "bgt", "bgtx", "csv", "tsv", "xml"] },
          { name: "EET",  extensions: ["eet"] },
          { name: "BGT",  extensions: ["bgt"] },
          { name: "BGTX", extensions: ["bgtx"] },
          { name: "CSV",  extensions: ["csv", "tsv"] },
          { name: "XML",  extensions: ["xml"] },
        ],
      });
      if (!selected || typeof selected !== "string") return;
      setSaving(true);
      setError(null);
      const count = await invoke<number>(cmdImport, {
        path:    dbPath,
        srcPath: selected,
      });
      log_info(`[db_manager] Imported ${count} entries`);
      reloadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Search & Replace ───────────────────────────────────────────────────────

  const handleSrPreview = async () => {
    if (!dbPath || !srFind) return;
    setSrLoading(true);
    setSrError(null);
    setSrPreview([]);
    try {
      const result = await invoke<DbBrowseResult>("get_db_entries_cmd", {
        source,
        personalDbPath: isPerso ? personalDbPath : undefined,
        recordType:     selectedType || undefined,
        search:         undefined,
        offset:         0,
        limit:          99999,
      });
      const preview: SrPreviewItem[] = [];
      for (const e of result.entries) {
        if (!e.translated) continue;
        let after: string;
        if (srRegex) {
          const re = new RegExp(srFind, "g");
          after = e.translated.replace(re, srReplace);
        } else {
          after = e.translated.split(srFind).join(srReplace);
        }
        if (after !== e.translated) {
          preview.push({ idx: e.idx, original_text: e.original, before: e.translated, after });
        }
      }
      setSrPreview(preview);
    } catch (e) {
      setSrError(String(e));
    } finally {
      setSrLoading(false);
    }
  };

  const handleSrApply = async () => {
    if (!dbPath || srPreview.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updates = srPreview.map(p => ({ idx: p.idx, translated: p.after }));
      await invoke(cmdUpdate, { path: dbPath, updates });
      setSrPreview([]);
      setShowSR(false);
      reloadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalPages    = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refUnavail    = tab === "ref"   && !refDbLoaded;
  const persoUnavail  = tab === "perso" && !personalDbPath;
  const isUnavail     = refUnavail || persoUnavail;
  const allCount      = recordTypes.reduce((s, r) => s + r.count, 0);
  const allTrans      = recordTypes.reduce((s, r) => s + r.translated, 0);
  const selectedEntry = selectedIdx !== null ? entries.find(e => e.idx === selectedIdx) ?? null : null;
  const displayEntries = sortEntries(entries, sortCol, sortDir);
  const hasPending    = pendingEdits.size > 0 || (newRow !== null && newRow.original.trim() !== "");
  const isPerso       = tab === "perso";

  // Active path + command names — differ only between ref and perso tabs
  const dbPath     = isPerso ? personalDbPath : refDbPath;
  const cmdUpdate  = isPerso ? "update_personal_db_entries_cmd" : "update_ref_db_entries_cmd";
  const cmdPurge   = isPerso ? "purge_personal_db_cmd"          : "purge_ref_db_cmd";
  const cmdAddRow  = isPerso ? "add_entry_to_personal_db_cmd"   : "add_entry_to_ref_db_cmd";
  const cmdImport  = isPerso ? "import_into_personal_db_cmd"    : "import_into_ref_db_cmd";
  const isDbEditable = !isUnavail && !!dbPath;

  const colDefs: { key: SortKey; label: string; w: number; fixed?: boolean }[] = [
    { key: "record_type", label: t("db_manager.col_type"),       w: colW[0], fixed: true },
    { key: "form_id",     label: t("db_manager.col_formid"),     w: colW[1], fixed: true },
    { key: "editor_id",   label: t("db_manager.col_edid"),       w: colW[2], fixed: true },
    { key: "original",    label: t("db_manager.col_original"),   w: flexW },
    { key: "translated",  label: t("db_manager.col_translated"), w: flexW },
  ];

  // ── Styles ────────────────────────────────────────────────────────────────

  const btnBase: React.CSSProperties = {
    padding: "3px 10px",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-2)",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    background: "var(--accent)",
    border: "none",
    color: "#fff",
    fontWeight: 600,
  };
  const btnDanger: React.CSSProperties = {
    ...btnBase,
    color: "#e06c75",
    borderColor: "rgba(224,108,117,0.35)",
  };
  const inlineInputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-1)",
    fontSize: 12,
    fontFamily: "inherit",
    padding: 0,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: "fixed",
      left: pos.x, top: pos.y,
      width:  size.w,
      height: size.h,
      background:   "var(--bg-menubar)",
      border:       "1px solid var(--border-light)",
      borderRadius: 6,
      boxShadow:    "0 24px 64px rgba(0,0,0,0.8)",
      display: "flex", flexDirection: "column",
      zIndex: 500,
      userSelect: "none",
      overflow: "hidden",
    }}>

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        style={{
          height: TITLE_H,
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center",
          padding: "0 10px", gap: 8,
          cursor: "grab", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>
          {t("db_manager.title")}
        </span>

        {(["ref", "perso"] as const).map(tp => (
          <button key={tp} onClick={() => { setTab(tp); setPage(0); }} style={{
            padding: "3px 14px",
            background: tab === tp ? "var(--accent)" : "var(--bg-hover)",
            border:     "1px solid var(--border)",
            borderRadius: 4,
            color:  tab === tp ? "#fff" : "var(--text-2)",
            fontSize: 12, cursor: "pointer",
          }}>
            {tp === "ref" ? t("db_manager.tab_ref") : t("db_manager.tab_perso")}
          </button>
        ))}

        <button onClick={onClose} title={t("db_manager.close")} style={{
          marginLeft: 4, background: "none", border: "none",
          color: "var(--text-2)", fontSize: 16, cursor: "pointer",
          padding: "2px 6px", borderRadius: 4,
        }}>×</button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {isUnavail ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          color: "var(--text-3)", gap: 8,
        }}>
          <span style={{ fontSize: 32 }}>🗄️</span>
          <span style={{ fontSize: 13 }}>
            {refUnavail ? t("db_manager.no_ref_db") : t("db_manager.no_perso_db")}
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Left: type filter ─────────────────────────────────────────── */}
          <div style={{
            width: LEFT_W, flexShrink: 0,
            background: "var(--bg-card)",
            borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{
              padding: "6px 8px",
              borderBottom: "1px solid var(--border)",
              fontSize: 10, color: "var(--text-3)", fontWeight: 700,
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}>
              {t("db_manager.record_types")}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <TypeRow
                label={t("db_manager.type_all")}
                count={allCount} translated={allTrans}
                selected={selectedType === ""}
                onClick={() => { setSelectedType(""); setPage(0); }}
              />
              {recordTypes.map(rt => (
                <TypeRow
                  key={rt.record_type || "(none)"}
                  label={rt.record_type || t("db_manager.type_unknown")}
                  count={rt.count} translated={rt.translated}
                  selected={selectedType === rt.record_type}
                  onClick={() => { setSelectedType(rt.record_type); setPage(0); }}
                />
              ))}
            </div>
          </div>

          {/* ── Right: search + table ─────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            {/* Search bar */}
            <div style={{
              padding: "5px 8px",
              borderBottom: "1px solid var(--border)",
              display: "flex", gap: 6, alignItems: "center", flexShrink: 0,
            }}>
              <input
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setPage(0); }}
                placeholder={t("db_manager.search_placeholder")}
                style={{
                  flex: 1, padding: "3px 8px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: 4, color: "var(--text-1)", fontSize: 12,
                  outline: "none",
                }}
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearch(""); setPage(0); }}
                  style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14 }}
                  title={t("db_manager.clear_search")}
                >×</button>
              )}
              <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {loading ? t("db_manager.loading") : t("db_manager.results_count", { count: total.toLocaleString() })}
              </span>
            </div>

            {/* Search & Replace panel */}
            {showSR && isDbEditable && editMode && (
              <div style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-card)",
                flexShrink: 0,
              }}>
                {/* S&R inputs row */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 8px" }}>
                  <input
                    value={srFind}
                    onChange={e => { setSrFind(e.target.value); setSrPreview([]); }}
                    placeholder={t("db_manager.sr_find")}
                    style={{ flex: 1, padding: "3px 7px", background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none" }}
                  />
                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>→</span>
                  <input
                    value={srReplace}
                    onChange={e => { setSrReplace(e.target.value); setSrPreview([]); }}
                    placeholder={t("db_manager.sr_replace")}
                    style={{ flex: 1, padding: "3px 7px", background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={srRegex} onChange={e => { setSrRegex(e.target.checked); setSrPreview([]); }} />
                    {t("db_manager.sr_regex")}
                  </label>
                  {selectedType && (
                    <span style={{ fontSize: 10, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px" }}>
                      {selectedType}
                    </span>
                  )}
                  <button
                    onClick={handleSrPreview}
                    disabled={!srFind || srLoading}
                    style={{ ...btnBase, opacity: !srFind ? 0.5 : 1 }}
                  >
                    {srLoading ? "…" : t("db_manager.sr_preview")}
                  </button>
                  {srPreview.length > 0 && (
                    <button onClick={handleSrApply} disabled={saving} style={btnPrimary}>
                      {t("db_manager.sr_apply", { count: srPreview.length })}
                    </button>
                  )}
                  <button onClick={() => { setShowSR(false); setSrPreview([]); setSrError(null); }}
                    style={{ ...btnBase, padding: "3px 7px" }}>×</button>
                </div>

                {/* S&R error */}
                {srError && (
                  <div style={{ padding: "3px 8px 5px", fontSize: 11, color: "#e06c75" }}>{srError}</div>
                )}

                {/* S&R preview list */}
                {srPreview.length > 0 && (
                  <div style={{
                    maxHeight: 140, overflowY: "auto",
                    padding: "0 8px 6px",
                    borderTop: "1px solid var(--border)",
                  }}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", padding: "4px 0 2px", fontWeight: 600 }}>
                      {t("db_manager.sr_preview_count", { count: srPreview.length })}
                      {srPreview.length > 30 && ` ${t("db_manager.sr_preview_truncated")}`}
                    </div>
                    {srPreview.slice(0, 30).map(item => (
                      <div key={item.idx} style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11, padding: "1px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <span style={{ color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180, flexShrink: 0 }}>
                          {item.original_text}
                        </span>
                        <span style={{ color: "var(--text-3)" }}>:</span>
                        <span style={{ color: "#e06c75", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {item.before}
                        </span>
                        <span style={{ color: "var(--text-3)" }}>→</span>
                        <span style={{ color: "#4ec9b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {item.after}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* No matches */}
                {!srLoading && srFind && srPreview.length === 0 && !srError && (
                  <div style={{ padding: "3px 8px 5px", fontSize: 11, color: "var(--text-3)" }}>
                    {t("db_manager.sr_no_match")}
                  </div>
                )}
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {error ? (
                <div style={{ padding: 16, color: "#e06c75", fontSize: 12 }}>{t("db_manager.error")}: {error}</div>
              ) : entries.length === 0 && !loading ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
                  {search || selectedType ? t("db_manager.no_results_filter") : t("db_manager.no_results")}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <colgroup>
                    {colDefs.map((c, i) => <col key={i} style={{ width: c.w }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {colDefs.map((col, i) => {
                        const isFixed    = col.fixed ?? false;
                        const isSorted   = sortCol === col.key;
                        const fixedIndex = isFixed ? i : -1;
                        return (
                          <th
                            key={i}
                            onClick={() => toggleSort(col.key)}
                            style={{
                              position: "sticky", top: 0, zIndex: 5,
                              background: "var(--bg-menubar)",
                              borderBottom: "2px solid var(--border)",
                              padding: "5px 8px",
                              textAlign: "left",
                              color: isSorted ? "var(--text-1)" : "var(--text-2)",
                              fontWeight: 600, fontSize: 11,
                              whiteSpace: "nowrap",
                              cursor: "pointer",
                              userSelect: "none",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              boxShadow: "0 1px 0 var(--border)",
                            }}
                          >
                            <span>{col.label}</span>
                            {isSorted && (
                              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>
                                {sortDir === "asc" ? "▲" : "▼"}
                              </span>
                            )}
                            {isFixed && (
                              <div
                                onMouseDown={e => onColResizeMouseDown(fixedIndex, colW[fixedIndex], e)}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  right: 0, top: 0, bottom: 0, width: 5,
                                  cursor: "col-resize",
                                  borderRight: "1px solid transparent",
                                  transition: "border-color 0.1s",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderRightColor = "var(--accent)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderRightColor = "transparent"; }}
                              />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── New row form (Ajouter ligne) ─────────────────── */}
                    {newRow !== null && isDbEditable && editMode && (
                      <tr style={{ background: "rgba(78,201,176,0.08)", borderBottom: "1px solid rgba(78,201,176,0.2)" }}>
                        <td style={{ padding: "3px 6px" }}>
                          <input
                            value={newRow.record_type}
                            onChange={e => setNewRow(r => r ? { ...r, record_type: e.target.value.toUpperCase() } : r)}
                            placeholder="TYPE"
                            style={{ ...inlineInputStyle, width: colW[0] - 12, color: "var(--text-3)", fontFamily: "monospace", fontSize: 11 }}
                          />
                        </td>
                        <td style={{ padding: "3px 6px", color: "var(--text-3)", fontSize: 10 }}>—</td>
                        <td style={{ padding: "3px 6px", color: "var(--text-3)", fontSize: 11 }}>—</td>
                        <td style={{ padding: "3px 6px" }}>
                          <input
                            value={newRow.original}
                            onChange={e => setNewRow(r => r ? { ...r, original: e.target.value } : r)}
                            placeholder={t("db_manager.new_row_original_placeholder")}
                            autoFocus
                            style={{ ...inlineInputStyle, color: "var(--text-2)", fontStyle: "italic" }}
                          />
                        </td>
                        <td style={{ padding: "3px 6px", display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            value={newRow.translated}
                            onChange={e => setNewRow(r => r ? { ...r, translated: e.target.value } : r)}
                            placeholder={t("db_manager.new_row_translated_placeholder")}
                            style={{ ...inlineInputStyle, flex: 1 }}
                          />
                          <button
                            title={t("db_manager.new_row_discard")}
                            onClick={() => setNewRow(null)}
                            style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                          >✕</button>
                        </td>
                      </tr>
                    )}

                    {/* ── Regular rows ─────────────────────────────────── */}
                    {displayEntries.map((entry, rowIdx) => {
                      const isSelected  = selectedIdx === entry.idx;
                      const isEven      = rowIdx % 2 === 0;
                      const pendingVal  = pendingEdits.get(entry.idx);
                      const hasEdit     = pendingVal !== undefined;
                      const displayTrad = pendingVal ?? entry.translated;

                      return (
                        <tr
                          key={entry.idx}
                          onClick={() => { if (!editMode) setSelectedIdx(isSelected ? null : entry.idx); }}
                          onDoubleClick={() => {
                            if (!editMode && onApply && entry.translated) { onApply(entry.translated); onClose(); }
                          }}
                          style={{
                            background: isSelected
                              ? "var(--accent-dim)"
                              : hasEdit
                              ? "rgba(78,201,176,0.07)"
                              : isEven ? "transparent" : "var(--bg-row-alt)",
                            cursor: editMode ? "default" : "pointer",
                            borderBottom: "1px solid rgba(255,255,255,0.035)",
                          }}
                        >
                          <td style={{ padding: "4px 8px", color: "var(--text-3)", fontFamily: "monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.record_type || "—"}
                          </td>
                          <td style={{ padding: "4px 8px", color: "var(--text-3)", fontFamily: "monospace", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {formIdHex(entry.form_id)}
                          </td>
                          <td title={entry.editor_id} style={{ padding: "4px 8px", color: "var(--text-3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.editor_id || "—"}
                          </td>
                          <td title={entry.original} style={{ padding: "4px 8px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
                            {entry.original}
                          </td>

                          {/* ── Translated cell: editable in edit mode ── */}
                          {editMode && isDbEditable ? (
                            <td
                              style={{
                                padding: "2px 6px",
                                background: hasEdit ? "rgba(78,201,176,0.12)" : "transparent",
                                borderLeft: hasEdit ? "2px solid rgba(78,201,176,0.5)" : "2px solid transparent",
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <input
                                value={displayTrad}
                                placeholder={t("db_manager.empty_translation")}
                                onChange={ev => {
                                  const val = ev.target.value;
                                  setPendingEdits(prev => {
                                    const next = new Map(prev);
                                    if (val === entry.translated) next.delete(entry.idx);
                                    else next.set(entry.idx, val);
                                    return next;
                                  });
                                }}
                                style={{
                                  ...inlineInputStyle,
                                  color: displayTrad ? "var(--text-1)" : "var(--text-3)",
                                }}
                              />
                            </td>
                          ) : (
                            <td title={entry.translated} style={{
                              padding: "4px 8px",
                              color:      entry.translated ? "var(--text-1)" : "var(--text-3)",
                              fontWeight: entry.translated ? 500 : 400,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {entry.translated
                                ? entry.translated
                                : <em style={{ opacity: 0.45 }}>{t("db_manager.no_translation")}</em>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, padding: "5px 8px",
                borderTop: "1px solid var(--border)", flexShrink: 0,
              }}>
                <PagBtn disabled={page === 0}             onClick={() => setPage(0)}>«</PagBtn>
                <PagBtn disabled={page === 0}             onClick={() => setPage(p => p - 1)}>‹</PagBtn>
                <span style={{ fontSize: 11, color: "var(--text-2)", minWidth: 110, textAlign: "center" }}>
                  {t("db_manager.page", { current: page + 1, total: totalPages })}
                </span>
                <PagBtn disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</PagBtn>
                <PagBtn disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</PagBtn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Action bar (edit mode — available for both ref and perso tabs) ──── */}
      {isDbEditable && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "5px 10px",
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          background: "var(--bg-card)",
          flexWrap: "wrap",
        }}>
          {/* Edit mode toggle button */}
          <button
            onClick={() => { if (editMode) handleAnnuler(); else setEditMode(true); }}
            style={{
              padding: "4px 12px",
              background: editMode ? "rgba(78,201,176,0.15)" : "var(--bg-hover)",
              border:     editMode ? "1px solid rgba(78,201,176,0.55)" : "1px solid var(--border)",
              borderRadius: 4,
              color:      editMode ? "#4ec9b0" : "var(--text-2)",
              fontSize: 11,
              fontWeight: editMode ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 5,
            }}
            title={editMode ? t("db_manager.edit_mode_active_hint") : t("db_manager.enter_edit_mode_hint")}
          >
            {editMode
              ? <><span style={{ fontSize: 8 }}>●</span> {t("db_manager.edit_mode_active")}</>
              : t("db_manager.enter_edit_mode")}
          </button>

          {editMode && (
            <>
              <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />
              <button onClick={handlePurge}  disabled={saving} style={btnDanger}   title={t("db_manager.purge_hint")}>
                {t("db_manager.purge")}
              </button>
              <button onClick={handleImport} disabled={saving} style={btnBase}     title={t("db_manager.import_hint")}>
                {t("db_manager.import")}
              </button>
              <button
                onClick={() => { setShowSR(!showSR); setSrPreview([]); setSrError(null); }}
                disabled={saving}
                style={{ ...btnBase, background: showSR ? "rgba(86,156,214,0.2)" : undefined }}
                title={t("db_manager.sr_hint")}
              >
                {t("db_manager.search_replace")}
              </button>
              <button
                onClick={() => setNewRow(r => r ? null : { original: "", translated: "", record_type: selectedType || "" })}
                disabled={saving}
                style={btnBase}
                title={t("db_manager.add_row_hint")}
              >
                {t("db_manager.add_row")}
              </button>
            </>
          )}

          <div style={{ flex: 1 }} />

          {editMode && (
            <>
              {hasPending && (
                <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
                  {t("db_manager.pending_changes", { count: pendingEdits.size + (newRow?.original.trim() ? 1 : 0) })}
                </span>
              )}
              <button onClick={handleAnnuler} disabled={saving} style={btnBase}>
                {t("db_manager.discard")}
              </button>
              <button onClick={handleValider} disabled={saving || !hasPending} style={{
                ...btnPrimary,
                opacity: !hasPending ? 0.5 : 1,
                cursor:  !hasPending ? "default" : "pointer",
              }}>
                {saving ? "…" : t("db_manager.validate")}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid var(--border)",
        padding: "5px 10px",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        background: "var(--bg-card)",
      }}>
        {selectedEntry ? (
          <span style={{ flex: 1, fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedEntry.record_type}
            {selectedEntry.sub_type  ? ` · ${selectedEntry.sub_type}`  : ""}
            {selectedEntry.editor_id ? ` · ${selectedEntry.editor_id}` : ""}
            {" · "}
            {formIdHex(selectedEntry.form_id)}
          </span>
        ) : (
          <span style={{ flex: 1, fontSize: 11, color: "var(--text-3)" }}>
            {onApply ? t("db_manager.hint_apply") : t("db_manager.hint_browse")}
          </span>
        )}

        {onApply && !editMode && (
          <button
            disabled={!selectedEntry?.translated}
            onClick={() => {
              if (selectedEntry?.translated) { onApply(selectedEntry.translated); onClose(); }
            }}
            style={{
              padding: "3px 14px",
              background: selectedEntry?.translated ? "var(--accent)" : "var(--bg-hover)",
              border: "1px solid var(--border)", borderRadius: 4,
              color: selectedEntry?.translated ? "#fff" : "var(--text-3)",
              fontSize: 12, cursor: selectedEntry?.translated ? "pointer" : "default",
            }}
          >
            {t("db_manager.btn_apply")}
          </button>
        )}

        <button
          onClick={onClose}
          style={{
            padding: "3px 12px",
            background: "var(--bg-hover)",
            border: "1px solid var(--border)", borderRadius: 4,
            color: "var(--text-2)", fontSize: 12, cursor: "pointer",
          }}
        >
          {t("db_manager.btn_close")}
        </button>
      </div>

      {/* ── Resize handle ─────────────────────────────────────────────────── */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          position: "absolute", right: 0, bottom: 0,
          width: 14, height: 14, cursor: "nwse-resize",
          opacity: 0.4,
          background: "linear-gradient(135deg, transparent 50%, var(--text-3) 50%)",
        }}
      />
    </div>
  );
}

// ── Dummy log helper (avoids importing the full log module) ───────────────────
function log_info(msg: string) { console.info(msg); }

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeRow({
  label, count, translated, selected, onClick,
}: {
  label: string; count: number; translated: number;
  selected: boolean; onClick: () => void;
}) {
  const pct = coveragePct(count, translated);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center",
        width: "100%", padding: "4px 8px",
        background:  selected ? "rgba(86,156,214,0.18)" : "transparent",
        border:      "none",
        borderLeft:  selected ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer", textAlign: "left", gap: 5,
      }}
    >
      <span style={{
        flex: 1, fontSize: 12,
        color: selected ? "var(--text-1)" : "var(--text-2)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, color: "var(--text-3)",
        background: "var(--bg-hover)",
        borderRadius: 8, padding: "1px 5px", flexShrink: 0,
      }}>
        {count.toLocaleString()}
      </span>
      <span title={`${pct}% traduit`} style={{
        width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: pct === 100 ? "#4ec9b0"
                  : pct >  50  ? "#dcdcaa"
                  : pct >   0  ? "#ce9178"
                  :              "#e06c75",
      }} />
    </button>
  );
}

function PagBtn({ disabled, onClick, children }: {
  disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled} onClick={onClick}
      style={{
        padding: "2px 7px",
        background: "var(--bg-hover)",
        border: "1px solid var(--border)", borderRadius: 4,
        color: disabled ? "var(--text-3)" : "var(--text-2)",
        cursor: disabled ? "default" : "pointer", fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
