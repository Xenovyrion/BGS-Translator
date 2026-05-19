// ── DB Search Panel — inline search across ref DB + personal DB ───────────────
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { DbSearchMatch } from "../../types";
import { IconSearch, IconClose, IconDatabase, IconSpinner } from "../../icons";

interface Props {
  /** Text pre-filled in the search field (e.g. selected text from original). */
  initialQuery?:   string;
  /** Path to the active personal DB (passed to search_db_cmd). */
  personalDbPath?: string;
  /** Called when the user clicks a result — fills the translation field. */
  onApply:         (translated: string) => void;
  onClose:         () => void;
}

export function DbSearchPanel({ initialQuery = "", personalDbPath, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const [query,    setQuery]    = useState(initialQuery);
  const [results,  setResults]  = useState<DbSearchMatch[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + auto-search when opened with a pre-filled query
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery.trim()) runSearch(initialQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await invoke<DbSearchMatch[]>("search_db_cmd", {
        query:          q.trim(),
        personalDbPath: personalDbPath ?? null,
        maxResults:     30,
      });
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter")  { e.preventDefault(); runSearch(query); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
      {/* ── Search bar ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px" }}>
        <IconDatabase size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("db_search.placeholder")}
          style={{
            flex: 1, height: 22, padding: "0 7px",
            background: "var(--bg-primary)", border: "1px solid var(--border)",
            borderRadius: 4, color: "var(--text-1)", fontSize: 12,
            outline: "none", boxSizing: "border-box", minWidth: 0,
          }}
        />
        <button
          onClick={() => runSearch(query)}
          disabled={!query.trim() || loading}
          style={{
            height: 22, padding: "0 10px",
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 4,
            cursor: query.trim() && !loading ? "pointer" : "default",
            fontSize: 11, fontWeight: 600,
            opacity: query.trim() && !loading ? 1 : 0.45,
            flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
          }}
        >
          {loading ? <IconSpinner size={11} /> : <><IconSearch size={11} />{t("db_search.search_btn")}</>}
        </button>
        <button
          onClick={onClose}
          title={t("db_search.close")}
          style={{
            height: 22, width: 22, padding: 0,
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: 4, cursor: "pointer", color: "var(--text-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconClose size={12} />
        </button>
      </div>

      {/* ── Results ────────────────────────────────────────── */}
      {searched && (
        <div style={{ maxHeight: 190, overflowY: "auto", borderTop: "1px solid var(--border)" }}>
          {!loading && results.length === 0 && (
            <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
              {t("db_search.no_results")}
            </div>
          )}
          {results.map((r, i) => (
            <ResultRow
              key={i}
              result={r}
              onApply={() => { onApply(r.translated); onClose(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual result row ─────────────────────────────────────────────────────

function ResultRow({ result, onApply }: { result: DbSearchMatch; onApply: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isPersonal = result.source === "personal_db";

  return (
    <div
      onClick={onApply}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "5px 10px",
        background: hovered ? "var(--bg-primary)" : "transparent",
        cursor: "pointer",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Source badge */}
      <span style={{
        flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
        padding: "1px 5px", borderRadius: 3, marginTop: 2,
        background: isPersonal
          ? "color-mix(in srgb, var(--accent-alt) 15%, transparent)"
          : "color-mix(in srgb, var(--accent) 15%, transparent)",
        color:  isPersonal ? "var(--accent-alt)" : "var(--accent)",
        border: isPersonal
          ? "1px solid color-mix(in srgb, var(--accent-alt) 40%, transparent)"
          : "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
      }}>
        {isPersonal ? "Perso" : "DB"}
      </span>

      {/* Original + translated */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, color: "var(--text-3)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {result.original}
        </div>
        <div style={{
          fontSize: 12, color: "var(--text-1)", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {result.translated}
        </div>
      </div>

      {/* Score */}
      <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, alignSelf: "center" }}>
        {result.score}%
      </span>
    </div>
  );
}
