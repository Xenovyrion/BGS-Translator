import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TranslationEntry } from "../../types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  entry:  TranslationEntry;
  field:  "original" | "translated";
  prefix: string;
  match:  string;
  suffix: string;
}

type SearchScope = "original" | "translated" | "both";

interface Props {
  entries:             TranslationEntry[];
  displayEntries:      TranslationEntry[];
  onClose:             () => void;
  onUpdateTranslation: (idx: number, text: string) => void;
  onNavigate:          (entry: TranslationEntry) => void;
  shortcutLabel?:      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRegex(
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): RegExp | null {
  if (!query.trim()) return null;
  try {
    const pattern = useRegex
      ? query
      : wholeWord
        ? `\\b${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
        : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

function isValidRegex(query: string): boolean {
  try { new RegExp(query); return true; } catch { return false; }
}

function extractSnippet(
  text: string, re: RegExp, radius = 60,
): { prefix: string; match: string; suffix: string } | null {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index;
  const end   = start + m[0].length;
  const from  = Math.max(0, start - radius);
  const to    = Math.min(text.length, end + radius);
  return {
    prefix: (from > 0 ? "…" : "") + text.slice(from, start),
    match:  text.slice(start, end),
    suffix: text.slice(end, to) + (to < text.length ? "…" : ""),
  };
}

function replaceInText(text: string, re: RegExp, replacement: string): string {
  re.lastIndex = 0;
  return text.replace(re, replacement);
}

// ── Component ─────────────────────────────────────────────────────────────────

const WIN_W = 660;
const WIN_H = 500;

export default function GlobalFindReplaceModal({
  entries, displayEntries, onClose, onUpdateTranslation, onNavigate, shortcutLabel,
}: Props) {
  const { t } = useTranslation();

  const [query,          setQuery]          = useState("");
  const [replacement,    setReplacement]    = useState("");
  const [scope,          setScope]          = useState<SearchScope>("both");
  const [caseSensitive,  setCaseSensitive]  = useState(false);
  const [wholeWord,      setWholeWord]      = useState(true);
  const [useRegex,       setUseRegex]       = useState(false);
  const [visibleOnly,    setVisibleOnly]    = useState(false);
  const [selectedIdx,    setSelectedIdx]    = useState<number | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);

  // Draggable position
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth  - WIN_W) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - WIN_H) / 3)),
  }));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const queryRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { queryRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => { setSelectedIdx(null); }, [query, scope, caseSensitive, wholeWord, useRegex, visibleOnly]);

  // When regex mode is toggled on, whole-word is meaningless — disable it
  useEffect(() => { if (useRegex) setWholeWord(false); }, [useRegex]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const regexInvalid = useRegex && query.trim() !== "" && !isValidRegex(query);

  const pool = visibleOnly ? displayEntries : entries;

  const results = useMemo<SearchResult[]>(() => {
    if (regexInvalid) return [];
    const re = buildRegex(query, caseSensitive, wholeWord, useRegex);
    if (!re) return [];
    const out: SearchResult[] = [];
    for (const entry of pool) {
      if (scope === "original" || scope === "both") {
        const snip = extractSnippet(entry.original, re);
        if (snip) out.push({ entry, field: "original", ...snip });
      }
      if (scope === "translated" || scope === "both") {
        const snip = extractSnippet(entry.translated, re);
        if (snip) out.push({ entry, field: "translated", ...snip });
      }
    }
    return out;
  }, [query, scope, caseSensitive, wholeWord, useRegex, pool, regexInvalid]);

  const entryCount      = useMemo(() => new Set(results.map(r => r.entry._idx)).size, [results]);
  const selectedResult  = selectedIdx !== null ? results[selectedIdx] ?? null : null;
  const canReplace      = selectedResult !== null && selectedResult.field === "translated";
  const replaceAllCount = results.filter(r => r.field === "translated").length;

  const handleReplace = useCallback(() => {
    if (!selectedResult || selectedResult.field !== "translated") return;
    const re = buildRegex(query, caseSensitive, wholeWord, useRegex);
    if (!re) return;
    const newText = replaceInText(selectedResult.entry.translated, re, replacement);
    onUpdateTranslation(selectedResult.entry._idx ?? 0, newText);
    showToast(t("global_search.replaced_toast", { count: 1 }));
  }, [selectedResult, query, caseSensitive, wholeWord, useRegex, replacement, onUpdateTranslation, showToast, t]);

  const handleReplaceAll = useCallback(() => {
    const re = buildRegex(query, caseSensitive, wholeWord, useRegex);
    if (!re) return;
    const affected = new Map<number, TranslationEntry>();
    for (const r of results) {
      if (r.field === "translated" && r.entry._idx !== undefined)
        affected.set(r.entry._idx, r.entry);
    }
    let count = 0;
    for (const [idx, entry] of affected) {
      const newText = replaceInText(entry.translated, re, replacement);
      if (newText !== entry.translated) { onUpdateTranslation(idx, newText); count++; }
    }
    showToast(t("global_search.replaced_toast", { count }));
    setSelectedIdx(null);
  }, [query, caseSensitive, wholeWord, useRegex, replacement, results, onUpdateTranslation, showToast, t]);

  useEffect(() => {
    if (selectedIdx === null || !listRef.current) return;
    (listRef.current.children[selectedIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
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
      }}
    >
      {/* Draggable title bar */}
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
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", flex: 1, pointerEvents: "none" }}>
          {t("global_search.title")}
        </span>
        {shortcutLabel && (
          <span style={{ fontSize: 10, opacity: 0.3, fontFamily: "var(--font-mono, monospace)", pointerEvents: "none" }}>
            {shortcutLabel}
          </span>
        )}
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>✕</button>
      </div>

      {/* Fields */}
      <div style={{ padding: "10px 14px 0", flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, userSelect: "text" }}>
        <FieldRow label={t("global_search.search_label")}>
          <input
            ref={queryRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={useRegex ? t("global_search.search_placeholder_regex") : t("global_search.search_placeholder")}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (results.length > 0) setSelectedIdx(0); } }}
            style={{ ...inputStyle, borderColor: regexInvalid ? "var(--danger, #ef4444)" : "var(--border)" }}
          />
          {regexInvalid && (
            <span style={{ fontSize: 10, color: "var(--danger, #ef4444)", whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("global_search.regex_error")}
            </span>
          )}
        </FieldRow>
        <FieldRow label={t("global_search.replace_label")}>
          <input
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            placeholder={useRegex ? t("global_search.replace_placeholder_regex") : t("global_search.replace_placeholder")}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      {/* Options — row 1: scope + case + whole word */}
      <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0, userSelect: "none" }}>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t("global_search.scope_label")} :</span>
        {(["original", "translated", "both"] as SearchScope[]).map(s => (
          <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12, color: "var(--text-2)" }}>
            <input type="radio" name="gfr-scope" checked={scope === s} onChange={() => setScope(s)} style={{ accentColor: "var(--accent)", margin: 0 }} />
            {t(`global_search.scope_${s}`)}
          </label>
        ))}
        <span style={{ width: 1, height: 12, background: "var(--border)" }} />
        <CheckOpt label={t("global_search.opt_case")} checked={caseSensitive} onChange={setCaseSensitive} />
        <CheckOpt label={t("global_search.opt_word")} checked={wholeWord} onChange={setWholeWord} disabled={useRegex} />
      </div>

      {/* Options — row 2: regex + visible only */}
      <div style={{
        padding: "6px 14px 8px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--border)", flexShrink: 0, userSelect: "none",
      }}>
        <CheckOpt
          label={t("global_search.opt_regex")}
          checked={useRegex}
          onChange={setUseRegex}
          badge=".*"
        />
        <span style={{ width: 1, height: 12, background: "var(--border)" }} />
        <CheckOpt
          label={t("global_search.opt_visible", { count: displayEntries.length })}
          checked={visibleOnly}
          onChange={setVisibleOnly}
        />
      </div>

      {/* Results header */}
      <div style={{ padding: "5px 14px", fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
        {regexInvalid
          ? <span style={{ color: "var(--danger, #ef4444)" }}>{t("global_search.regex_error")}</span>
          : !query.trim()
            ? <span style={{ opacity: 0.45 }}>{t("global_search.empty_hint")}</span>
            : results.length === 0
              ? <span style={{ color: "var(--danger, #ef4444)" }}>{t("global_search.no_results")}</span>
              : t("global_search.results_header", { count: results.length, entries: entryCount })
        }
      </div>

      {/* Results list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", borderTop: "1px solid var(--border)", userSelect: "text" }}>
        {results.map((r, i) => {
          const isSelected = selectedIdx === i;
          const formId = r.entry.form_id
            ? `0x${r.entry.form_id.toString(16).toUpperCase().padStart(8, "0")}`
            : "—";
          return (
            <div
              key={i}
              onClick={() => { setSelectedIdx(i); onNavigate(r.entry); }}
              style={{
                padding: "5px 14px",
                background: isSelected ? "var(--accent)" : "transparent",
                cursor: "pointer",
                borderBottom: "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: 2,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 10, padding: "1px 5px", borderRadius: 3, fontWeight: 600, flexShrink: 0,
                  background: r.field === "original" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                  color: r.field === "original"
                    ? (isSelected ? "#fca5a5" : "var(--danger, #ef4444)")
                    : (isSelected ? "#86efac" : "var(--success, #22c55e)"),
                }}>
                  {t(`global_search.field_${r.field}`)}
                </span>
                <span style={{ fontSize: 10, opacity: isSelected ? 0.7 : 0.4, fontFamily: "var(--font-mono, monospace)", flexShrink: 0 }}>{formId}</span>
                <span style={{ fontSize: 10, opacity: isSelected ? 0.7 : 0.4, flexShrink: 0 }}>{r.entry.record_type}</span>
                {r.entry.editor_id && (
                  <span style={{ fontSize: 10, opacity: isSelected ? 0.55 : 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.entry.editor_id}</span>
                )}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.4, color: isSelected ? "rgba(255,255,255,0.9)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ opacity: 0.6 }}>{r.prefix}</span>
                <span style={{ background: isSelected ? "rgba(255,255,255,0.22)" : "rgba(99,102,241,0.25)", fontWeight: 700, borderRadius: 2, padding: "0 1px" }}>{r.match}</span>
                <span style={{ opacity: 0.6 }}>{r.suffix}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 6,
        background: "var(--bg-card)", flexShrink: 0, position: "relative",
        userSelect: "none",
      }}>
        {toast && (
          <span style={{
            position: "absolute", bottom: "calc(100% + 4px)", left: 14,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, color: "var(--success, #22c55e)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}>{toast}</span>
        )}
        <FBtn label={t("global_search.btn_replace")}   disabled={!canReplace}        onClick={handleReplace}    title={!selectedResult ? t("global_search.no_selection") : !canReplace ? t("global_search.read_only") : undefined} />
        <FBtn label={t("global_search.btn_replace_all", { count: replaceAllCount })} disabled={replaceAllCount === 0} onClick={handleReplaceAll} accent />
        <div style={{ flex: 1 }} />
        <FBtn label={t("common.close")} onClick={onClose} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-3)", width: 76, textAlign: "right", flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

function CheckOpt({ label, checked, onChange, disabled, badge }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; badge?: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: disabled ? "default" : "pointer", fontSize: 12, color: disabled ? "var(--text-3)" : "var(--text-2)", opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)", margin: 0 }}
      />
      {label}
      {badge && (
        <span style={{
          fontSize: 10, padding: "0 4px", borderRadius: 3,
          background: checked ? "var(--accent)" : "var(--bg-hover)",
          color: checked ? "#fff" : "var(--text-3)",
          fontFamily: "var(--font-mono, monospace)", lineHeight: "16px",
          transition: "background 0.15s, color 0.15s",
        }}>{badge}</span>
      )}
    </label>
  );
}

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
      }}
    >{label}</button>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: "4px 8px",
  background: "var(--bg-hover)",
  border: "1px solid var(--border)",
  borderRadius: 5, color: "var(--text-1)",
  fontSize: 12, fontFamily: "var(--font-ui, system-ui)",
  outline: "none",
};
