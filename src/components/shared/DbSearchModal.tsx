// ── DB Search Modal — floating/draggable window for searching ref + personal DB ─
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { DbSearchMatch } from "../../types";
import { IconDatabase, IconSearch, IconClose, IconCheck, IconSpinner } from "../../icons";

const WIN_W = 700;
const WIN_H = 520;

interface Props {
  /** Text to pre-fill in the search field (e.g. selected entry's original). */
  initialQuery?:   string;
  /** Path to the active personal DB (passed to search_db_cmd). */
  personalDbPath?: string;
  /**
   * When provided (i.e. an entry is currently selected), the "Appliquer" button
   * becomes active and calls this with the chosen translated text.
   */
  onApply?:        (translated: string) => void;
  onClose:         () => void;
  /** Shortcut label to display in the title bar, e.g. "Ctrl+D". */
  shortcutLabel?:  string;
}

export default function DbSearchModal({
  initialQuery = "", personalDbPath, onApply, onClose, shortcutLabel,
}: Props) {
  const { t } = useTranslation();

  const [query,    setQuery]    = useState(initialQuery);
  const [results,  setResults]  = useState<DbSearchMatch[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // ── Draggable position ────────────────────────────────────────────────────
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth  - WIN_W) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - WIN_H) / 3)),
  }));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const debounceId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus + auto-search when opened with a pre-filled query
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery.trim()) runSearch(initialQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Drag mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - WIN_W, dragRef.current.origX + e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60,    dragRef.current.origY + e.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  // Scroll selected result into view
  useEffect(() => {
    if (selected === null || !listRef.current) return;
    (listRef.current.children[selected] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Reset selection when results change
  useEffect(() => { setSelected(null); }, [results]);

  // ── Search logic ──────────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<DbSearchMatch[]>("search_db_cmd", {
        query:          q.trim(),
        personalDbPath: personalDbPath ?? null,
        maxResults:     50,
      });
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [personalDbPath]);

  const scheduleSearch = useCallback((q: string) => {
    if (debounceId.current) clearTimeout(debounceId.current);
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    debounceId.current = setTimeout(() => runSearch(q), 300);
  }, [runSearch]);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    scheduleSearch(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (debounceId.current) clearTimeout(debounceId.current); runSearch(query); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(i => Math.min((i ?? -1) + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(i => Math.max((i ?? 1) - 1, 0)); }
  };

  const handleApply = () => {
    if (selected === null || !results[selected]) return;
    onApply?.(results[selected].translated);
    onClose();
  };

  const selectedResult = selected !== null ? results[selected] ?? null : null;
  const canApply = !!onApply && !!selectedResult;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y,
      width: WIN_W, height: WIN_H,
      zIndex: 1100,
      display: "flex", flexDirection: "column",
      background: "var(--bg-primary)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
      overflow: "hidden",
      userSelect: "none",
    }}>

      {/* ── Draggable title bar ─────────────────────────────────────────── */}
      <div
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest("button")) return;
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px 8px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0, cursor: "grab",
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.4, pointerEvents: "none" }}>⠿</span>
        <IconDatabase size={13} style={{ color: "var(--accent)", flexShrink: 0, pointerEvents: "none" }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", flex: 1, pointerEvents: "none" }}>
          {t("db_search.title")}
        </span>
        {shortcutLabel && (
          <span style={{ fontSize: 10, opacity: 0.3, fontFamily: "var(--font-mono, monospace)", pointerEvents: "none" }}>
            {shortcutLabel}
          </span>
        )}
        {!onApply && (
          <span style={{
            fontSize: 10, fontStyle: "italic", color: "var(--text-3)",
            pointerEvents: "none", marginRight: 4,
          }}>
            {t("db_search.no_entry_hint")}
          </span>
        )}
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0 2px", display: "flex", alignItems: "center" }}
        >
          <IconClose size={15} />
        </button>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0, userSelect: "text",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <IconSearch size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("db_search.placeholder")}
          style={{
            flex: 1, padding: "5px 9px",
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            borderRadius: 5, color: "var(--text-1)",
            fontSize: 12, outline: "none",
          }}
        />
        <button
          onClick={() => { if (debounceId.current) clearTimeout(debounceId.current); runSearch(query); }}
          disabled={!query.trim() || loading}
          style={{
            height: 28, padding: "0 12px",
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 5,
            cursor: query.trim() && !loading ? "pointer" : "default",
            fontSize: 12, fontWeight: 600,
            opacity: query.trim() && !loading ? 1 : 0.45,
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
          }}
        >
          {loading ? <IconSpinner size={11} /> : <><IconSearch size={11} />{t("db_search.search_btn")}</>}
        </button>
      </div>

      {/* ── Results count ──────────────────────────────────────────────── */}
      <div style={{ padding: "5px 14px", fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
        {!searched
          ? <span style={{ opacity: 0.45 }}>{t("db_search.empty_hint")}</span>
          : loading
            ? <span style={{ opacity: 0.45 }}>{t("db_search.searching")}</span>
            : results.length === 0
              ? <span style={{ color: "var(--danger, #ef4444)" }}>{t("db_search.no_results")}</span>
              : t("db_search.results_count", { count: results.length })
        }
      </div>

      {/* ── Results list ───────────────────────────────────────────────── */}
      <div
        ref={listRef}
        style={{ flex: 1, overflowY: "auto", borderTop: "1px solid var(--border)", userSelect: "text" }}
      >
        {results.map((r, i) => {
          const isSelected  = selected === i;
          const isPersonal  = r.source === "personal_db";
          const formIdHex   = r.form_id
            ? `0x${r.form_id.toString(16).toUpperCase().padStart(8, "0")}`
            : "—";

          return (
            <div
              key={i}
              onClick={() => setSelected(i)}
              onDoubleClick={() => { setSelected(i); if (onApply) { onApply(r.translated); onClose(); } }}
              style={{
                padding: "6px 14px",
                background: isSelected ? "var(--accent)" : "transparent",
                cursor: "pointer",
                borderBottom: "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: 3,
              }}
            >
              {/* Row header: source badge + record type + form ID + editor ID */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                  background: isSelected
                    ? "rgba(255,255,255,0.2)"
                    : isPersonal
                      ? "color-mix(in srgb, var(--accent-alt) 15%, transparent)"
                      : "color-mix(in srgb, var(--accent) 15%, transparent)",
                  color: isSelected
                    ? "#fff"
                    : isPersonal ? "var(--accent-alt)" : "var(--accent)",
                  border: isSelected ? "1px solid rgba(255,255,255,0.3)"
                    : isPersonal
                      ? "1px solid color-mix(in srgb, var(--accent-alt) 40%, transparent)"
                      : "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
                }}>
                  {isPersonal ? "Perso" : "DB"}
                </span>
                {r.record_type && (
                  <span style={{ fontSize: 10, opacity: isSelected ? 0.8 : 0.5, flexShrink: 0 }}>
                    {r.record_type}{r.sub_type ? ` · ${r.sub_type}` : ""}
                  </span>
                )}
                <span style={{ fontSize: 10, opacity: isSelected ? 0.7 : 0.35, fontFamily: "var(--font-mono, monospace)", flexShrink: 0 }}>
                  {formIdHex}
                </span>
                {r.editor_id && (
                  <span style={{ fontSize: 10, opacity: isSelected ? 0.65 : 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.editor_id}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 10, opacity: isSelected ? 0.7 : 0.35, flexShrink: 0 }}>
                  {r.score}%
                </span>
              </div>

              {/* Original text */}
              <div style={{
                fontSize: 11, lineHeight: 1.4,
                color: isSelected ? "rgba(255,255,255,0.65)" : "var(--text-3)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontStyle: "italic",
              }}>
                {r.original}
              </div>

              {/* Translated text */}
              <div style={{
                fontSize: 12, lineHeight: 1.4, fontWeight: 500,
                color: isSelected ? "#fff" : "var(--text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {r.translated}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: "8px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--bg-card)", flexShrink: 0,
        userSelect: "none",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", flex: 1 }}>
          {canApply
            ? t("db_search.footer_hint_apply")
            : !onApply
              ? t("db_search.footer_hint_browse")
              : t("db_search.footer_hint_select")}
        </span>
        <FBtn
          label={t("db_search.btn_apply")}
          accent
          disabled={!canApply}
          onClick={handleApply}
          title={!onApply ? t("db_search.no_entry_hint") : !selectedResult ? t("db_search.select_hint") : undefined}
        />
        <FBtn label={t("common.close")} onClick={onClose} />
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FBtn({ label, disabled, onClick, accent, title }: {
  label: string; disabled?: boolean; onClick?: () => void; accent?: boolean; title?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "3px 11px",
        background: accent ? "var(--accent)" : "var(--bg-hover)",
        color: accent ? "#fff" : disabled ? "var(--text-3)" : "var(--text-1)",
        border: "1px solid var(--border)",
        borderRadius: 5, fontSize: 12,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        display: "flex", alignItems: "center", gap: 4,
      }}
    >
      {accent && !disabled && <IconCheck size={12} />}
      {label}
    </button>
  );
}
