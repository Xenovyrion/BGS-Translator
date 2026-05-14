import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { startDrag } from "../../hooks/useLayout";
import type { TranslationEntry, EntryStatus } from "../../types";
import { TaggedText } from "../shared/TaggedText";

export interface EditPanelHandle { focus: () => void }

interface Props {
  entry:          TranslationEntry;
  onTranslate:    (idx: number, translated: string) => void;
  onSetStatus:    (idx: number, status: EntryStatus) => void;
  onClose:        () => void;
  onFocusTable:   () => void;
  panelHeight:    number;
  onPanelResize:  (delta: number) => void;
  recordColors:   Record<string, string>;
}

// ── Layout constants ───────────────────────────────────────────────────────
const GUTTER_W  = 32;
const TEXT_FZ   = "var(--fz-table, 12px)";
const TEXT_LH   = 1.6;
const TEXT_FONT = "var(--font-content, system-ui, sans-serif)";
const TA_PAD_V  = 5;
const TA_PAD_H  = 7;

// ── Icons ──────────────────────────────────────────────────────────────────
function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1.5"/>
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5V9.5A1.5 1.5 0 0 0 3.5 11H5"/>
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6.5" cy="6.5" r="4.5"/>
      <line x1="10.5" y1="10.5" x2="14" y2="14"/>
    </svg>
  );
}

// ── Text segment utilities ─────────────────────────────────────────────────
type Segment = { text: string; isTag: boolean; isMatch: boolean; isCurrent: boolean };

function findAllOccurrences(
  text: string, query: string, caseSensitive: boolean,
): Array<{ start: number; end: number }> {
  if (!query) return [];
  const hay    = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < hay.length) {
    const found = hay.indexOf(needle, i);
    if (found === -1) break;
    out.push({ start: found, end: found + needle.length });
    i = found + (needle.length || 1);
  }
  return out;
}

function buildSegments(
  text: string,
  matches: Array<{ start: number; end: number; isCurrent: boolean }>,
): Segment[] {
  type Evt = { pos: number; open: boolean; kind: "tag" | "match" | "current" };
  const evts: Evt[] = [];
  for (const m of text.matchAll(/<[^>]*>/g)) {
    evts.push({ pos: m.index!, open: true, kind: "tag" });
    evts.push({ pos: m.index! + m[0].length, open: false, kind: "tag" });
  }
  for (const { start, end, isCurrent } of matches) {
    const kind = isCurrent ? "current" : "match";
    evts.push({ pos: start, open: true, kind });
    evts.push({ pos: end, open: false, kind });
  }
  evts.sort((a, b) => a.pos - b.pos || (a.open ? 1 : -1));

  const segs: Segment[] = [];
  let pos = 0, inTag = false, inMatch = false, inCurrent = false;
  for (const evt of evts) {
    if (evt.pos > pos) segs.push({ text: text.slice(pos, evt.pos), isTag: inTag, isMatch: inMatch, isCurrent: inCurrent });
    pos = evt.pos;
    if (evt.kind === "tag")     inTag     = evt.open;
    if (evt.kind === "match")   inMatch   = evt.open;
    if (evt.kind === "current") inCurrent = evt.open;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), isTag: inTag, isMatch: inMatch, isCurrent: inCurrent });
  return segs;
}

function SegmentedText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.isCurrent) return <mark key={i} style={{ background: "var(--accent)", color: "#fff", borderRadius: 2 }}>{seg.text}</mark>;
        if (seg.isMatch)   return <mark key={i} style={{ background: "rgba(253,224,71,0.4)", color: "inherit", borderRadius: 2 }}>{seg.text}</mark>;
        if (seg.isTag)     return <span key={i} style={{ color: "var(--color-tag)" }}>{seg.text}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}

// ── Dropdown item ──────────────────────────────────────────────────────────
function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      role="menuitem" onClick={onClick}
      style={{ padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-1)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </div>
  );
}

// ── EditPanel ──────────────────────────────────────────────────────────────
const EditPanel = forwardRef<EditPanelHandle, Props>(function EditPanel(
  { entry, onTranslate, onSetStatus, onClose, onFocusTable, panelHeight, onPanelResize, recordColors },
  ref,
) {
  const { t } = useTranslation();

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const overlayRef      = useRef<HTMLDivElement>(null);
  const translGutterRef = useRef<HTMLDivElement>(null);
  const findInputRef    = useRef<HTMLInputElement>(null);
  const opsRef          = useRef<HTMLDivElement>(null);
  const lineRefs        = useRef<(HTMLDivElement | null)[]>([]);

  // ── State ───────────────────────────────────────────────────────────────
  const [handleHover,    setHandleHover]    = useState(false);
  const [copiedSide,     setCopiedSide]     = useState<"original" | "translation" | null>(null);
  const [findVisible,    setFindVisible]    = useState(false);
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [findQuery,      setFindQuery]      = useState("");
  const [replaceQuery,   setReplaceQuery]   = useState("");
  const [findCase,       setFindCase]       = useState(false);
  const [matchIdx,       setMatchIdx]       = useState(0);
  const [opsOpen,        setOpsOpen]        = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────
  const formIdHex   = entry.form_id.toString(16).toUpperCase().padStart(8, "0");
  const recordColor = recordColors[entry.record_type] ?? "#64748b";
  const origLines   = entry.original.split("\n");
  const translLines = (entry.translated ?? "").split("\n");
  const origMulti   = origLines.length > 1;
  const translMulti = translLines.length > 1;

  // Line start offsets in the full original string (for match→line mapping)
  const origLineOffsets = useMemo(() => {
    let offset = 0;
    return origLines.map(line => { const o = offset; offset += line.length + 1; return o; });
  }, [origLines]);

  // Tags present in original / translation
  const origTags   = useMemo(() => [...new Set(entry.original.match(/<[^>]+>/g) ?? [])], [entry.original]);
  const translTags = useMemo(() => [...new Set((entry.translated ?? "").match(/<[^>]+>/g) ?? [])], [entry.translated]);
  const missingTags = useMemo(() => origTags.filter(t => !translTags.includes(t)), [origTags, translTags]);

  // All search matches across both columns
  const allMatches = useMemo(() => {
    if (!findQuery) return [];
    const orig  = findAllOccurrences(entry.original,        findQuery, findCase).map(o => ({ ...o, col: "original"    as const }));
    const transl = findAllOccurrences(entry.translated ?? "", findQuery, findCase).map(o => ({ ...o, col: "translation" as const }));
    return [...orig, ...transl];
  }, [findQuery, findCase, entry.original, entry.translated]);

  const matchCount  = allMatches.length;
  const clampedIdx  = matchCount > 0 ? ((matchIdx % matchCount) + matchCount) % matchCount : 0;
  const currentMatch = matchCount > 0 ? allMatches[clampedIdx] : null;

  // Translation overlay segments (null = no active search, use TaggedText)
  const translOverlaySegs = useMemo(() => {
    if (!findQuery) return null;
    const matches = allMatches
      .filter(m => m.col === "translation")
      .map(m => ({ start: m.start, end: m.end, isCurrent: currentMatch?.col === "translation" && m.start === currentMatch.start }));
    return buildSegments(entry.translated || "", matches);
  }, [findQuery, allMatches, currentMatch, entry.translated]);

  // ── Effects ─────────────────────────────────────────────────────────────
  // Reset match index when query or entry changes
  useEffect(() => { setMatchIdx(0); }, [findQuery, findCase, entry._idx]);

  // Scroll to current match
  useEffect(() => {
    if (!currentMatch) return;
    if (currentMatch.col === "original") {
      let lineIdx = 0;
      for (let j = origLineOffsets.length - 1; j >= 0; j--) {
        if (origLineOffsets[j] <= currentMatch.start) { lineIdx = j; break; }
      }
      lineRefs.current[lineIdx]?.scrollIntoView({ block: "nearest" });
    } else {
      const before = (entry.translated ?? "").slice(0, currentMatch.start);
      const matchLine = before.split("\n").length - 1;
      const lineHeightPx = 12 * TEXT_LH; // approximation (CSS variable not measurable here)
      if (textareaRef.current) {
        const scrollTarget = matchLine * lineHeightPx - textareaRef.current.clientHeight / 3;
        textareaRef.current.scrollTop = Math.max(0, scrollTarget);
        if (overlayRef.current)      overlayRef.current.scrollTop      = textareaRef.current.scrollTop;
        if (translGutterRef.current) translGutterRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    }
  }, [currentMatch, origLineOffsets, entry.translated]);

  // Close ops dropdown on outside click
  useEffect(() => {
    if (!opsOpen) return;
    const close = (e: MouseEvent) => {
      if (opsRef.current && !opsRef.current.contains(e.target as Node)) setOpsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [opsOpen]);

  // ── Callbacks ────────────────────────────────────────────────────────────
  const syncScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop  = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
    if (translGutterRef.current && textareaRef.current) {
      translGutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const copyText = useCallback((text: string, side: "original" | "translation") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSide(side);
      setTimeout(() => setCopiedSide(null), 1500);
    });
  }, []);

  const openFind = useCallback((mode: "find" | "replace") => {
    const sel = textareaRef.current?.value.slice(
      textareaRef.current.selectionStart, textareaRef.current.selectionEnd,
    ) ?? "";
    if (sel) setFindQuery(sel);
    setFindVisible(true);
    setReplaceVisible(mode === "replace");
    setTimeout(() => findInputRef.current?.focus(), 10);
  }, []);

  const closeFind = useCallback(() => {
    setFindVisible(false);
    setFindQuery("");
    setReplaceQuery("");
    textareaRef.current?.focus();
  }, []);

  const applyOp = useCallback((op: "trim" | "upper" | "lower" | "strip-tags") => {
    const text = entry.translated ?? "";
    let next = text;
    if (op === "trim")       next = text.split("\n").map(l => l.trim()).join("\n");
    if (op === "upper")      next = text.toUpperCase();
    if (op === "lower")      next = text.toLowerCase();
    if (op === "strip-tags") next = text.replace(/<[^>]*>/g, "");
    if (next !== text) onTranslate(entry._idx ?? 0, next);
    setOpsOpen(false);
  }, [entry.translated, entry._idx, onTranslate]);

  const insertAtCursor = useCallback((tag: string) => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, value } = textareaRef.current;
    const next = value.slice(0, selectionStart) + tag + value.slice(selectionEnd);
    onTranslate(entry._idx ?? 0, next);
    setOpsOpen(false);
    const newCursor = selectionStart + tag.length;
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.setSelectionRange(newCursor, newCursor);
      textareaRef.current.focus();
    });
  }, [entry._idx, onTranslate]);

  const replaceCurrent = useCallback(() => {
    if (!currentMatch || currentMatch.col !== "translation") return;
    const text = entry.translated ?? "";
    onTranslate(entry._idx ?? 0, text.slice(0, currentMatch.start) + replaceQuery + text.slice(currentMatch.end));
  }, [currentMatch, replaceQuery, entry.translated, entry._idx, onTranslate]);

  const replaceAll = useCallback(() => {
    const translMatches = allMatches.filter(m => m.col === "translation");
    if (!translMatches.length) return;
    let text = entry.translated ?? "";
    for (let i = translMatches.length - 1; i >= 0; i--) {
      const { start, end } = translMatches[i];
      text = text.slice(0, start) + replaceQuery + text.slice(end);
    }
    onTranslate(entry._idx ?? 0, text);
  }, [allMatches, replaceQuery, entry.translated, entry._idx, onTranslate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTranslate(entry._idx ?? 0, e.target.value);
  }, [entry._idx, onTranslate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault(); e.stopPropagation(); openFind("find"); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "h") {
      e.preventDefault(); e.stopPropagation(); openFind("replace"); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      onSetStatus(entry._idx ?? 0, "validated"); e.preventDefault(); return;
    }
    if (e.key === "Escape") {
      if (findVisible) { closeFind(); e.preventDefault(); return; }
      onFocusTable(); e.preventDefault(); return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.stopPropagation();
  }, [entry._idx, onSetStatus, onFocusTable, findVisible, openFind, closeFind]);

  const handleFindKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setMatchIdx(idx => idx + (e.shiftKey ? -1 : 1));
    }
    if (e.key === "Escape") { e.preventDefault(); closeFind(); }
  }, [closeFind]);

  useImperativeHandle(ref, () => ({
    focus() {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    },
  }));

  // ── Shared styles ─────────────────────────────────────────────────────────
  const STATUS_CONFIG: Array<{ status: EntryStatus; label: string; color: string }> = [
    { status: "validated",    label: t("edit.status_validated"),    color: "#22c55e" },
    { status: "pending",      label: t("edit.status_pending"),      color: "#f59e0b" },
    { status: "ignored",      label: t("edit.status_ignored"),      color: "#64748b" },
    { status: "untranslated", label: t("edit.status_untranslated"), color: "#ef4444" },
  ];

  const colHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexShrink: 0, padding: "2px 0" };
  const labelStyle:     React.CSSProperties = { fontSize: 11, color: "var(--text-1)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" };
  const dotStyle:       React.CSSProperties = { fontSize: 11, color: "var(--text-3)", opacity: 0.5 };
  const metaStyle:      React.CSSProperties = { fontSize: 11, color: "var(--text-2)" };
  const iconBtnStyle:   React.CSSProperties = { height: 20, padding: "0 7px", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-2)", fontSize: 11, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 };
  const gutterNumStyle: React.CSSProperties = { width: GUTTER_W, flexShrink: 0, fontSize: TEXT_FZ, fontFamily: "monospace", lineHeight: TEXT_LH, color: "var(--text-3)", opacity: 0.45, userSelect: "none", textAlign: "right", paddingRight: 7, minHeight: "1.6em" };
  const textLineStyle:  React.CSSProperties = { flex: 1, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, color: "var(--text-2)", lineHeight: TEXT_LH, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: "1.6em", userSelect: "text" };

  const fmtN = (n: number) => n.toLocaleString();

  // ── Render helper: original line with search highlights ───────────────────
  const renderOrigLine = (line: string, i: number) => {
    const lineStart = origLineOffsets[i];
    const lineEnd   = lineStart + line.length;
    const lineMatches = allMatches
      .filter(m => m.col === "original" && m.end > lineStart && m.start < lineEnd)
      .map(m => ({ start: Math.max(0, m.start - lineStart), end: Math.min(line.length, m.end - lineStart), isCurrent: currentMatch?.col === "original" && m.start === currentMatch.start }));
    const content = line === ""
      ? "​"
      : lineMatches.length
        ? <SegmentedText segments={buildSegments(line, lineMatches)} />
        : <TaggedText text={line} />;
    return (
      <div key={i} ref={el => { lineRefs.current[i] = el; }} style={{ display: "flex" }}>
        {origMulti && <div style={gutterNumStyle}>{i + 1}</div>}
        <div style={textLineStyle}>{content}</div>
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: panelHeight, flexShrink: 0, background: "var(--bg-edit-panel, var(--bg-card))", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Resize handle ─────────────────────────────────────────────── */}
      <div onMouseDown={e => startDrag(e, "v", onPanelResize)} onMouseEnter={() => setHandleHover(true)} onMouseLeave={() => setHandleHover(false)} style={{ flexShrink: 0, height: 6, cursor: "row-resize", display: "flex", alignItems: "center" }}>
        <div style={{ width: "100%", height: handleHover ? 2 : 1, background: handleHover ? "var(--accent)" : "rgba(0,0,0,0.4)", transition: "height 0.1s, background 0.12s" }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)", flexShrink: 0 }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-3)" }}>
          [<span style={{ color: recordColor, fontWeight: 700 }}>{entry.record_type}</span>] {formIdHex}
        </span>
        {entry.editor_id && <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{entry.editor_id}</span>}
        <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-primary)", padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{entry.sub_type}</span>
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{t("edit.status_label")}</span>
        <div style={{ display: "flex", gap: 3 }}>
          {STATUS_CONFIG.map(({ status, label, color }) => {
            const active = entry.status === status;
            return (
              <button key={status} onClick={() => onSetStatus(entry._idx ?? 0, status)} style={{ height: 24, padding: "0 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400, background: active ? color : "transparent", color: active ? "#fff" : color, border: `1px solid ${color}`, opacity: active ? 1 : 0.6, transition: "opacity 0.12s, background 0.12s", boxSizing: "border-box" }}>
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8, flexShrink: 0 }}>{t("edit.hint")}</span>
        <button onClick={onClose} title={t("edit.close_title")} style={{ marginLeft: 4, width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-3)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>

      {/* ── Find / Replace bar ────────────────────────────────────────── */}
      {findVisible && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)", padding: "5px 10px", gap: 4 }}>
          {/* Find row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <SearchIcon />
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={e => setFindQuery(e.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder={t("edit.find_placeholder")}
              style={{ flex: 1, height: 24, padding: "0 7px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none", boxSizing: "border-box", minWidth: 0 }}
            />
            {/* Case-sensitive toggle */}
            <button
              onClick={() => setFindCase(c => !c)}
              title={t("edit.find_case")}
              style={{ height: 24, padding: "0 7px", borderRadius: 4, border: "1px solid var(--border)", cursor: "pointer", background: findCase ? "var(--accent)" : "var(--bg-primary)", color: findCase ? "#fff" : "var(--text-2)", fontSize: 11, fontWeight: 600, flexShrink: 0 }}
            >Aa</button>
            {/* Prev / Next */}
            <button onClick={() => setMatchIdx(i => i - 1)} disabled={matchCount === 0} style={{ ...iconBtnStyle, padding: "0 6px", background: "var(--bg-primary)" }}>↑</button>
            <button onClick={() => setMatchIdx(i => i + 1)} disabled={matchCount === 0} style={{ ...iconBtnStyle, padding: "0 6px", background: "var(--bg-primary)" }}>↓</button>
            {/* Match count */}
            <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, minWidth: 46, textAlign: "right" }}>
              {findQuery
                ? matchCount === 0
                  ? t("edit.find_no_result")
                  : `${clampedIdx + 1} / ${matchCount}`
                : ""}
            </span>
            {/* Toggle replace */}
            <button onClick={() => setReplaceVisible(r => !r)} style={{ ...iconBtnStyle, background: replaceVisible ? "var(--bg-hover)" : "var(--bg-primary)", marginLeft: 4 }}>⇄</button>
            {/* Close */}
            <button onClick={closeFind} style={{ ...iconBtnStyle, background: "var(--bg-primary)" }}>×</button>
          </div>
          {/* Replace row */}
          {replaceVisible && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 17 }}>
              <input
                value={replaceQuery}
                onChange={e => setReplaceQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); closeFind(); } }}
                placeholder={t("edit.replace_placeholder")}
                style={{ flex: 1, height: 24, padding: "0 7px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none", boxSizing: "border-box", minWidth: 0 }}
              />
              <button onClick={replaceCurrent} disabled={!currentMatch || currentMatch.col !== "translation"} style={{ ...iconBtnStyle, background: "var(--bg-primary)", flexShrink: 0 }}>{t("edit.replace_btn")}</button>
              <button onClick={replaceAll} disabled={matchCount === 0} style={{ ...iconBtnStyle, background: "var(--bg-primary)", flexShrink: 0 }}>{t("edit.replace_all")}</button>
            </div>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Original ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: "7px 10px", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={colHeaderStyle}>
            <span style={labelStyle}>{t("edit.original_label")}</span>
            <span style={dotStyle}>·</span>
            <span style={metaStyle}>{fmtN(entry.original.length)} {t("edit.chars")}</span>
            {origMulti && <><span style={dotStyle}>·</span><span style={metaStyle}>{fmtN(origLines.length)} {t("edit.lines")}</span></>}
            <button style={{ ...iconBtnStyle, marginLeft: "auto" }} onClick={() => copyText(entry.original, "original")} title={t("edit.copy_original")}>
              {copiedSide === "original" ? <span style={{ color: "#22c55e" }}>{t("edit.copied")}</span> : <><CopyIcon />{t("edit.copy")}</>}
            </button>
          </div>
          <div style={{ flex: 1 }}>
            {origLines.map((line, i) => renderOrigLine(line, i))}
          </div>
        </div>

        {/* ── Translation ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "7px 10px" }}>
          <div style={colHeaderStyle}>
            <span style={labelStyle}>{t("edit.translation_label")}</span>
            <span style={dotStyle}>·</span>
            <span style={metaStyle}>{fmtN((entry.translated ?? "").length)} {t("edit.chars")}</span>
            {translMulti && <><span style={dotStyle}>·</span><span style={metaStyle}>{fmtN(translLines.length)} {t("edit.lines")}</span></>}
            {/* Missing tags warning */}
            {missingTags.length > 0 && (
              <span title={`${t("edit.missing_tags")}\n${missingTags.join("\n")}`} style={{ fontSize: 11, color: "#f59e0b", cursor: "help", flexShrink: 0 }}>
                ⚠ {missingTags.length}
              </span>
            )}
            {/* Tools dropdown */}
            <div ref={opsRef} style={{ position: "relative", marginLeft: "auto" }}>
              <button style={iconBtnStyle} onClick={() => setOpsOpen(o => !o)} title={t("edit.ops_btn")}>
                ⚙ {t("edit.ops_btn")}
              </button>
              {opsOpen && (
                <div role="menu" style={{ position: "absolute", top: "calc(100% + 3px)", right: 0, zIndex: 200, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", minWidth: 210, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
                  <MenuItem onClick={() => applyOp("trim")}>{t("edit.op_trim")}</MenuItem>
                  <MenuItem onClick={() => applyOp("upper")}>{t("edit.op_upper")}</MenuItem>
                  <MenuItem onClick={() => applyOp("lower")}>{t("edit.op_lower")}</MenuItem>
                  <MenuItem onClick={() => applyOp("strip-tags")}>{t("edit.op_strip_tags")}</MenuItem>
                  {origTags.length > 0 && (
                    <>
                      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                      <div style={{ fontSize: 10, color: "var(--text-3)", padding: "2px 12px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("edit.op_tags_section")}</div>
                      {origTags.map(tag => (
                        <div key={tag} style={{ display: "flex", alignItems: "center", padding: "3px 12px", gap: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-tag)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag}</span>
                          <button onClick={() => insertAtCursor(tag)} style={{ height: 18, padding: "0 6px", border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-2)", fontSize: 10, flexShrink: 0 }}>{t("edit.op_insert")}</button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Copy */}
            <button style={iconBtnStyle} onClick={() => copyText(entry.translated ?? "", "translation")} title={t("edit.copy_translation")}>
              {copiedSide === "translation" ? <span style={{ color: "#22c55e" }}>{t("edit.copied")}</span> : <><CopyIcon />{t("edit.copy")}</>}
            </button>
          </div>

          {/* Gutter + textarea+overlay */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {translMulti && (
              <div ref={translGutterRef} style={{ width: GUTTER_W, flexShrink: 0, overflowY: "hidden", height: "100%", paddingTop: TA_PAD_V, boxSizing: "border-box" }}>
                {translLines.map((_, i) => <div key={i} style={gutterNumStyle}>{i + 1}</div>)}
              </div>
            )}
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={textareaRef}
                value={entry.translated}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onScroll={syncScroll}
                placeholder={t("edit.placeholder")}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", resize: "none", padding: `${TA_PAD_V}px ${TA_PAD_H}px`, background: "var(--bg-hover)", color: "transparent", caretColor: "var(--text-1)", border: "1px solid var(--border)", borderRadius: 6, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, lineHeight: TEXT_LH, outline: "none", boxSizing: "border-box" }}
              />
              <div ref={overlayRef} aria-hidden style={{ position: "absolute", inset: 0, padding: `${TA_PAD_V}px ${TA_PAD_H}px`, border: "1px solid transparent", borderRadius: 6, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, lineHeight: TEXT_LH, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word", overflow: "hidden", pointerEvents: "none", color: "var(--text-1)", boxSizing: "border-box" }}>
                {translOverlaySegs
                  ? <SegmentedText segments={translOverlaySegs} />
                  : <TaggedText text={entry.translated || ""} />
                }
                {" "}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EditPanel;
