import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core"; // used by spell check
import { startDrag } from "../../hooks/useLayout";
import type { TranslationEntry, EntryStatus, EditPanelShortcuts, ShortcutDef, FuzzyMatch, ActiveProvider } from "../../types";
import { DEFAULT_EDIT_SHORTCUTS, matchShortcut, formatShortcut, fuzzyScoreColor, fuzzyScoreLabel, getProviderStyle } from "../../types";
import { TaggedText } from "../shared/TaggedText";
import { ProviderLetterBadge } from "../shared/ProviderBadge";
import {
  IconCopy, IconSearch, IconCheck, IconClose, IconReplace, IconExternalLink,
  IconArrowUp, IconArrowDown, IconCaseSensitive, IconSpellCheck,
  IconSettings as IconGear, IconSpinner, IconDatabase,
} from "../../icons";

interface SpellError {
  word: string;
  char_start: number;
  char_len: number;
}

interface SpellPopup {
  word: string;
  suggestions: string[];
  charStart: number;
  charLen: number;
  x: number;
  y: number;
}

export interface EditPanelHandle { focus: () => void }

interface Props {
  entry:          TranslationEntry;
  onTranslate:    (idx: number, translated: string) => void;
  onSetStatus:    (idx: number, status: EntryStatus) => void;
  onClose:            () => void;
  onFocusTable:       () => void;
  panelHeight:        number;
  onPanelResize:      (delta: number) => void;
  recordColors:       Record<string, string>;
  editShortcuts?:     EditPanelShortcuts;
  spellLang?:         string;
  spellRealtime?:     boolean;
  spellDebounce?:     number;
  /** Active API providers (shown as translate buttons). */
  activeApiProviders?:      ActiveProvider[];
  /** Active browser launcher providers (shown as open-browser buttons). */
  activeLauncherProviders?: ActiveProvider[];
  /** ID of the provider currently loading (null = none). */
  translateLoadingId?:      string | null;
  /** Per-provider error messages. */
  translateErrorMap?:       Map<string, string>;
  /** Called when the user clicks a translate button for an API provider. */
  onTranslateWith?:         (provider: ActiveProvider) => void;
  /** Called when the user clicks a browser launcher button. */
  onOpenBrowserWith?:       (provider: ActiveProvider) => void;
  /** Target language code (e.g. "fr"). */
  targetLang?:              string;
  onApplyPersonalDb?: () => void;    // Apply personal DB to this entry
  onAddToPersonalDb?: () => void;    // Add this entry to personal DB
  personalDbName?:    string;        // Name of the active personal DB (for tooltip)
  /** Opens the global DB search modal, pre-filled with the current entry's original text. */
  onOpenDbSearch?:    () => void;
  /** Fuzzy suggestion for this entry (if any) */
  fuzzyMatch?:        FuzzyMatch;
  onAcceptFuzzy?:     () => void;
  onDismissFuzzy?:    () => void;
  /** Manual fuzzy trigger for this single entry */
  onRunFuzzy?:        () => void;
  fuzzyScanning?:     boolean;
}

// ── Layout constants ───────────────────────────────────────────────────────
const GUTTER_W  = 32;
const TEXT_FZ   = "var(--fz-table, 12px)";
const TEXT_LH   = 1.6;
const TEXT_FONT = "var(--font-content, system-ui, sans-serif)";
const TA_PAD_V  = 5;
const TA_PAD_H  = 7;
// Uniform height for every tool button in the panel
const BTN_H     = 22;

// ── Text-segment utilities ─────────────────────────────────────────────────
type Segment = { text: string; isTag: boolean; isMatch: boolean; isCurrent: boolean; isSpellError: boolean };

function findAllOccurrences(text: string, query: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
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
  spellErrors: SpellError[] = [],
): Segment[] {
  type Evt = { pos: number; open: boolean; kind: "tag" | "match" | "current" | "spell" };
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
  for (const { char_start, char_len } of spellErrors) {
    evts.push({ pos: char_start, open: true, kind: "spell" });
    evts.push({ pos: char_start + char_len, open: false, kind: "spell" });
  }
  evts.sort((a, b) => a.pos - b.pos || (a.open ? 1 : -1));
  const segs: Segment[] = [];
  let pos = 0, inTag = false, inMatch = false, inCurrent = false, inSpell = false;
  for (const evt of evts) {
    if (evt.pos > pos) segs.push({ text: text.slice(pos, evt.pos), isTag: inTag, isMatch: inMatch, isCurrent: inCurrent, isSpellError: inSpell });
    pos = evt.pos;
    if (evt.kind === "tag")     inTag     = evt.open;
    if (evt.kind === "match")   inMatch   = evt.open;
    if (evt.kind === "current") inCurrent = evt.open;
    if (evt.kind === "spell")   inSpell   = evt.open;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), isTag: inTag, isMatch: inMatch, isCurrent: inCurrent, isSpellError: inSpell });
  return segs;
}

function SegmentedText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.isCurrent)    return <mark key={i} style={{ background: "var(--accent)", color: "#fff", borderRadius: 2 }}>{seg.text}</mark>;
        if (seg.isMatch)      return <mark key={i} style={{ background: "rgba(253,224,71,0.4)", color: "inherit", borderRadius: 2 }}>{seg.text}</mark>;
        if (seg.isSpellError) return <span key={i} style={{ textDecoration: "underline wavy var(--danger)", textDecorationThickness: "1.5px", textUnderlineOffset: "2px" }}>{seg.text}</span>;
        if (seg.isTag)        return <span key={i} style={{ color: "var(--color-tag)" }}>{seg.text}</span>;
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}

// ── Dropdown menu item ─────────────────────────────────────────────────────
function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      role="menuitem" onClick={onClick}
      style={{ padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-1)", display: "flex", alignItems: "center" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </div>
  );
}

// ── Uniform tool button ────────────────────────────────────────────────────
function ToolBtn({ children, onClick, title, active, disabled, style }: {
  children: React.ReactNode; onClick?: () => void; title?: string;
  active?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        height: BTN_H, padding: "0 8px",
        border: "1px solid var(--border)", borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        background: active ? "var(--accent)" : "var(--bg-primary)",
        color: active ? "#fff" : disabled ? "var(--text-3)" : "var(--text-2)",
        fontSize: 11, display: "flex", alignItems: "center", gap: 4,
        flexShrink: 0, boxSizing: "border-box", opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── EditPanel ──────────────────────────────────────────────────────────────
const EditPanel = forwardRef<EditPanelHandle, Props>(function EditPanel(
  { entry, onTranslate, onSetStatus, onClose, onFocusTable, panelHeight, onPanelResize, recordColors, editShortcuts: editSc, spellLang, spellRealtime, spellDebounce = 600, activeApiProviders = [], activeLauncherProviders = [], translateLoadingId, translateErrorMap, onTranslateWith, onOpenBrowserWith, onApplyPersonalDb, onAddToPersonalDb, personalDbName, onOpenDbSearch, fuzzyMatch, onAcceptFuzzy, onDismissFuzzy, onRunFuzzy, fuzzyScanning = false },
  ref,
) {
  const { t } = useTranslation();
  const sc = editSc ?? DEFAULT_EDIT_SHORTCUTS;

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
  const [spellErrors,    setSpellErrors]    = useState<SpellError[]>([]);
  const [spellChecking,  setSpellChecking]  = useState(false);
  const [spellPopup,     setSpellPopup]     = useState<SpellPopup | null>(null);
  const spellPopupRef                       = useRef<HTMLDivElement>(null);

  // ── Derived ─────────────────────────────────────────────────────────────
  const formIdHex   = entry.form_id.toString(16).toUpperCase().padStart(8, "0");
  const recordColor = recordColors[entry.record_type] ?? "var(--text-3)";
  const origLines   = entry.original.split("\n");
  const translLines = (entry.translated ?? "").split("\n");
  const origMulti   = origLines.length > 1;
  const translMulti = translLines.length > 1;

  const origLineOffsets = useMemo(() => {
    let offset = 0;
    return origLines.map(line => { const o = offset; offset += line.length + 1; return o; });
  }, [origLines]);

  const origTags    = useMemo(() => [...new Set(entry.original.match(/<[^>]+>/g) ?? [])], [entry.original]);
  const translTags  = useMemo(() => [...new Set((entry.translated ?? "").match(/<[^>]+>/g) ?? [])], [entry.translated]);
  const missingTags = useMemo(() => origTags.filter(t => !translTags.includes(t)), [origTags, translTags]);

  const allMatches = useMemo(() => {
    if (!findQuery) return [];
    const orig   = findAllOccurrences(entry.original,         findQuery, findCase).map(o => ({ ...o, col: "original"    as const }));
    const transl = findAllOccurrences(entry.translated ?? "", findQuery, findCase).map(o => ({ ...o, col: "translation" as const }));
    return [...orig, ...transl];
  }, [findQuery, findCase, entry.original, entry.translated]);

  const matchCount   = allMatches.length;
  const clampedIdx   = matchCount > 0 ? ((matchIdx % matchCount) + matchCount) % matchCount : 0;
  const currentMatch = matchCount > 0 ? allMatches[clampedIdx] : null;

  const translOverlaySegs = useMemo(() => {
    if (!findQuery && !spellErrors.length) return null;
    const matches = allMatches
      .filter(m => m.col === "translation")
      .map(m => ({ start: m.start, end: m.end, isCurrent: currentMatch?.col === "translation" && m.start === currentMatch.start }));
    return buildSegments(entry.translated || "", matches, spellErrors);
  }, [findQuery, allMatches, currentMatch, entry.translated, spellErrors]);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { setMatchIdx(0); }, [findQuery, findCase, entry._idx]);

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
      if (textareaRef.current) {
        const lineH = 12 * TEXT_LH;
        textareaRef.current.scrollTop = Math.max(0, matchLine * lineH - textareaRef.current.clientHeight / 3);
        if (overlayRef.current)      overlayRef.current.scrollTop      = textareaRef.current.scrollTop;
        if (translGutterRef.current) translGutterRef.current.scrollTop = textareaRef.current.scrollTop;
      }
    }
  }, [currentMatch, origLineOffsets, entry.translated]);

  useEffect(() => {
    if (!opsOpen) return;
    const close = (e: MouseEvent) => {
      if (opsRef.current && !opsRef.current.contains(e.target as Node)) setOpsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [opsOpen]);

  // Close spell popup when clicking outside of it
  useEffect(() => {
    if (!spellPopup) return;
    const close = (e: MouseEvent) => {
      if (spellPopupRef.current && !spellPopupRef.current.contains(e.target as Node)) setSpellPopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [spellPopup]);

  // Clear spell errors when entry changes
  useEffect(() => {
    setSpellErrors([]);
    setSpellPopup(null);
  }, [entry._idx]);

  // Real-time spell check with debounce
  useEffect(() => {
    if (!spellRealtime || !spellLang || !entry.translated) return;
    const timer = setTimeout(async () => {
      try {
        const errors = await invoke<SpellError[]>("spellcheck_cmd", { lang: spellLang, text: entry.translated });
        setSpellErrors(errors);
      } catch { /* dictionary may not be loaded yet */ }
    }, spellDebounce);
    return () => clearTimeout(timer);
  }, [entry.translated, spellRealtime, spellLang, spellDebounce]);

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
    const ta  = textareaRef.current;
    const sel = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
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

  // Apply a text operation — selection-aware: if text is selected, operate only on that range.
  const applyOp = useCallback((op: "trim" | "upper" | "lower" | "strip-tags") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value } = ta;
    const hasSelection = selectionStart !== selectionEnd;

    const transform = (s: string) => {
      if (op === "trim")       return s.split("\n").map(l => l.trim()).join("\n");
      if (op === "upper")      return s.toUpperCase();
      if (op === "lower")      return s.toLowerCase();
      if (op === "strip-tags") return s.replace(/<[^>]*>/g, "");
      return s;
    };

    if (hasSelection) {
      const before      = value.slice(0, selectionStart);
      const transformed = transform(value.slice(selectionStart, selectionEnd));
      const after       = value.slice(selectionEnd);
      onTranslate(entry._idx ?? 0, before + transformed + after);
      const newEnd = selectionStart + transformed.length;
      requestAnimationFrame(() => {
        ta.setSelectionRange(selectionStart, newEnd);
        ta.focus();
      });
    } else {
      const next = transform(value);
      if (next !== value) onTranslate(entry._idx ?? 0, next);
    }
    setOpsOpen(false);
  }, [entry._idx, onTranslate]);

  const insertAtCursor = useCallback((tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value } = ta;
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


  const runSpellCheck = useCallback(async () => {
    if (!spellLang) return;
    setSpellChecking(true);
    setSpellPopup(null);
    try {
      const errors = await invoke<SpellError[]>("spellcheck_cmd", { lang: spellLang, text: entry.translated ?? "" });
      setSpellErrors(errors);
    } catch (e) {
      console.warn("Spell check failed:", e);
    } finally {
      setSpellChecking(false);
    }
  }, [spellLang, entry.translated]);

  const handleTextareaClick = useCallback(async (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!spellErrors.length || !spellLang) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const caretPos = ta.selectionStart;
    const error = spellErrors.find(err => caretPos >= err.char_start && caretPos <= err.char_start + err.char_len);
    if (!error) { setSpellPopup(null); return; }
    try {
      const suggestions = await invoke<string[]>("get_suggestions_cmd", { lang: spellLang, word: error.word });
      const POPUP_H = 300;
      const flipUp = e.clientY + POPUP_H > window.innerHeight;
      const y = flipUp ? e.clientY - POPUP_H : e.clientY + 6;
      setSpellPopup({ word: error.word, suggestions, charStart: error.char_start, charLen: error.char_len, x: e.clientX, y });
    } catch {}
  }, [spellErrors, spellLang]);

  const applySpellSuggestion = useCallback((suggestion: string, charStart: number, charLen: number) => {
    const text = entry.translated ?? "";
    onTranslate(entry._idx ?? 0, text.slice(0, charStart) + suggestion + text.slice(charStart + charLen));
    setSpellErrors(prev => prev.filter(e => e.char_start !== charStart));
    setSpellPopup(null);
  }, [entry.translated, entry._idx, onTranslate]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTranslate(entry._idx ?? 0, e.target.value);
  }, [entry._idx, onTranslate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (matchShortcut(e, sc.find))        { e.preventDefault(); e.stopPropagation(); openFind("find");    return; }
    if (matchShortcut(e, sc.replace))     { e.preventDefault(); e.stopPropagation(); openFind("replace"); return; }
    if (matchShortcut(e, sc.opTrim))      { e.preventDefault(); applyOp("trim");      return; }
    if (matchShortcut(e, sc.opUpper))     { e.preventDefault(); applyOp("upper");     return; }
    if (matchShortcut(e, sc.opLower))     { e.preventDefault(); applyOp("lower");     return; }
    if (matchShortcut(e, sc.opStripTags)) { e.preventDefault(); applyOp("strip-tags"); return; }
    // DB search is triggered globally (Ctrl+D by default) — not from this handler

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      onSetStatus(entry._idx ?? 0, "validated"); e.preventDefault(); return;
    }
    if (e.key === "Escape") {
      if (findVisible) { closeFind(); e.preventDefault(); return; }
      onFocusTable(); e.preventDefault(); return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.stopPropagation();
  }, [entry._idx, onSetStatus, onFocusTable, findVisible, openFind, closeFind, applyOp, sc]);

  const handleFindKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); setMatchIdx(i => i + (e.shiftKey ? -1 : 1)); }
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
    { status: "validated",    label: t("edit.status_validated"),    color: "var(--status-validated)"    },
    { status: "pending",      label: t("edit.status_pending"),      color: "var(--status-pending)"      },
    { status: "ignored",      label: t("edit.status_ignored"),      color: "var(--status-ignored)"      },
    { status: "untranslated", label: t("edit.status_untranslated"), color: "var(--status-untranslated)" },
  ];
  const colHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexShrink: 0 };
  const labelStyle:     React.CSSProperties = { fontSize: 11, color: "var(--text-1)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" };
  const dotStyle:       React.CSSProperties = { fontSize: 11, color: "var(--text-3)", opacity: 0.5 };
  const metaStyle:      React.CSSProperties = { fontSize: 11, color: "var(--text-2)" };
  const gutterNumStyle: React.CSSProperties = { width: GUTTER_W, flexShrink: 0, fontSize: TEXT_FZ, fontFamily: "monospace", lineHeight: TEXT_LH, color: "var(--text-3)", opacity: 0.45, userSelect: "none", textAlign: "right", paddingRight: 7, minHeight: "1.6em" };
  const textLineStyle:  React.CSSProperties = { flex: 1, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, color: "var(--text-2)", lineHeight: TEXT_LH, whiteSpace: "pre-wrap", wordBreak: "break-word", minHeight: "1.6em", userSelect: "text" };

  const fmtN = (n: number) => n.toLocaleString();
  const fmtSc = (def: ShortcutDef) => formatShortcut(def);

  // ── Original-line renderer ────────────────────────────────────────────────
  const renderOrigLine = (line: string, i: number) => {
    const lineStart   = origLineOffsets[i];
    const lineEnd     = lineStart + line.length;
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
        <button onClick={onClose} title={t("edit.close_title")} style={{ marginLeft: 4, width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-3)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconClose size={14} /></button>
      </div>

      {/* ── Find / Replace bar ────────────────────────────────────────── */}
      {findVisible && (
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", background: "var(--bg-hover)", padding: "5px 10px", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconSearch size={12} />
            <input
              ref={findInputRef}
              value={findQuery}
              onChange={e => setFindQuery(e.target.value)}
              onKeyDown={handleFindKeyDown}
              placeholder={t("edit.find_placeholder")}
              style={{ flex: 1, height: BTN_H, padding: "0 7px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none", boxSizing: "border-box", minWidth: 0 }}
            />
            <ToolBtn active={findCase} onClick={() => setFindCase(c => !c)} title={t("edit.find_case")}><IconCaseSensitive /></ToolBtn>
            <ToolBtn onClick={() => setMatchIdx(i => i - 1)} disabled={matchCount === 0} title="Match précédent (Maj+Entrée)"><IconArrowUp size={11} /></ToolBtn>
            <ToolBtn onClick={() => setMatchIdx(i => i + 1)} disabled={matchCount === 0} title="Match suivant (Entrée)"><IconArrowDown size={11} /></ToolBtn>
            <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, minWidth: 52, textAlign: "right" }}>
              {findQuery ? (matchCount === 0 ? t("edit.find_no_result") : `${clampedIdx + 1} / ${matchCount}`) : ""}
            </span>
            <ToolBtn onClick={() => setReplaceVisible(r => !r)} active={replaceVisible} title={t("edit.toggle_replace") + " (Ctrl+H)"} style={{ marginLeft: 4 }}><IconReplace size={12} /></ToolBtn>
            <ToolBtn onClick={closeFind} title="Fermer (Échap)"><IconClose size={12} /></ToolBtn>
          </div>
          {replaceVisible && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 18 }}>
              <input
                value={replaceQuery}
                onChange={e => setReplaceQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); closeFind(); } }}
                placeholder={t("edit.replace_placeholder")}
                style={{ flex: 1, height: BTN_H, padding: "0 7px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-1)", fontSize: 12, outline: "none", boxSizing: "border-box", minWidth: 0 }}
              />
              <ToolBtn onClick={replaceCurrent} disabled={!currentMatch || currentMatch.col !== "translation"} title={t("edit.replace_btn") + " — remplace l'occurrence courante dans la traduction"}>
                {t("edit.replace_btn")}
              </ToolBtn>
              <ToolBtn onClick={replaceAll} disabled={matchCount === 0} title={t("edit.replace_all") + " — remplace toutes les occurrences dans la traduction"}>
                {t("edit.replace_all")}
              </ToolBtn>
            </div>
          )}
        </div>
      )}

      {/* ── Fuzzy suggestion bandeau ──────────────────────────────────── */}
      {fuzzyMatch && (
        <div style={{
          flexShrink: 0, padding: "5px 10px",
          background: `${fuzzyScoreColor(fuzzyMatch.score)}18`,
          borderBottom: `1px solid ${fuzzyScoreColor(fuzzyMatch.score)}44`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* Score badge */}
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 700,
            color: fuzzyScoreColor(fuzzyMatch.score),
            background: `${fuzzyScoreColor(fuzzyMatch.score)}22`,
            border: `1px solid ${fuzzyScoreColor(fuzzyMatch.score)}55`,
            borderRadius: 4, padding: "1px 5px",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <IconSearch size={10} /> {fuzzyScoreLabel(fuzzyMatch.score)}
          </span>

          {/* Suggestion text */}
          <span style={{
            flex: 1, fontSize: 12, fontStyle: "italic",
            color: "var(--text-2)", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={fuzzyMatch.suggested}>
            {fuzzyMatch.suggested}
          </span>

          {/* Origin label */}
          <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
            {t(`fuzzy.origin_${fuzzyMatch.origin}`)}
          </span>

          {/* Accept */}
          <button
            onClick={() => {
              onTranslate(entry._idx ?? 0, fuzzyMatch.suggested);
              onSetStatus(entry._idx ?? 0, "validated");
              onAcceptFuzzy?.();
            }}
            style={{
              height: 22, padding: "0 8px", flexShrink: 0,
              borderRadius: 4, border: `1px solid ${fuzzyScoreColor(fuzzyMatch.score)}`,
              cursor: "pointer", fontSize: 11, fontWeight: 600,
              background: fuzzyScoreColor(fuzzyMatch.score), color: "#fff",
              boxSizing: "border-box", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <IconCheck size={12} /> {t("fuzzy.accept")}
          </button>

          {/* Dismiss */}
          <button
            onClick={onDismissFuzzy}
            style={{
              height: 22, padding: "0 8px", flexShrink: 0,
              borderRadius: 4, border: "1px solid var(--border)",
              cursor: "pointer", fontSize: 11,
              background: "transparent", color: "var(--text-3)",
              boxSizing: "border-box", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <IconClose size={12} /> {t("fuzzy.dismiss")}
          </button>
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
            <ToolBtn style={{ marginLeft: "auto" }} onClick={() => copyText(entry.original, "original")} title={t("edit.copy_original")}>
              {copiedSide === "original" ? <span style={{ color: "var(--success)" }}>{t("edit.copied")}</span> : <><IconCopy size={11} />{t("edit.copy")}</>}
            </ToolBtn>
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
            {missingTags.length > 0 && (
              <span title={`${t("edit.missing_tags")}\n${missingTags.join("\n")}`} style={{ fontSize: 11, color: "var(--warning)", cursor: "help", flexShrink: 0 }}>⚠ {missingTags.length}</span>
            )}

            {/* Spacer — pushes all action buttons to the right */}
            <div style={{ flex: 1 }} />

            {/* ── Group: Personal DB ──────────────────────────────────────── */}
            {(onApplyPersonalDb || onAddToPersonalDb) && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
                {onApplyPersonalDb && (
                  <ToolBtn
                    onClick={onApplyPersonalDb}
                    title={personalDbName
                      ? t("bulk.apply_personal_db_named", { name: personalDbName })
                      : t("bulk.apply_personal_db")}
                    style={{ background: "var(--info)", color: "#fff", border: "1px solid var(--info)", opacity: 1 }}
                  >
                    <IconArrowDown size={11} />
                    <span style={{ fontSize: 10, fontWeight: 700 }}>DB</span>
                  </ToolBtn>
                )}
                {onAddToPersonalDb && (
                  <ToolBtn
                    onClick={() => { if (entry.translated) onAddToPersonalDb!(); }}
                    disabled={!entry.translated}
                    title={personalDbName
                      ? t("bulk.add_personal_db_named", { name: personalDbName })
                      : t("bulk.add_personal_db")}
                    style={{ background: "var(--accent-alt)", color: "#fff", border: "1px solid var(--accent-alt)", opacity: entry.translated ? 1 : 0.4 }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700 }}>+</span>
                    <span style={{ fontSize: 10, fontWeight: 700 }}>DB</span>
                  </ToolBtn>
                )}
              </>
            )}

            {/* ── Group: DB Search ────────────────────────────────────────── */}
            {onOpenDbSearch && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
                <ToolBtn
                  onClick={onOpenDbSearch}
                  title={t("db_search.btn_title")}
                  style={{ gap: 4 }}
                >
                  <IconDatabase size={12} />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>{t("db_search.btn_label")}</span>
                </ToolBtn>
              </>
            )}

            {/* ── Group: Fuzzy trigger — hidden while bandeau is visible ─── */}
            {onRunFuzzy && !fuzzyMatch && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
                <ToolBtn
                  onClick={onRunFuzzy}
                  disabled={fuzzyScanning}
                  title={t("fuzzy.run_title")}
                  style={{ gap: 5 }}
                >
                  {fuzzyScanning
                    ? <><IconSpinner size={11} /><span style={{ fontSize: 10, fontWeight: 600 }}>{t("fuzzy.btn_label")}</span></>
                    : <><IconSearch size={12} /><span style={{ fontSize: 10, fontWeight: 600 }}>{t("fuzzy.btn_label")}</span></>
                  }
                </ToolBtn>
              </>
            )}

            {/* ── Group: API translate providers ──────────────────────────── */}
            {activeApiProviders.length > 0 && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
                {activeApiProviders.map(provider => {
                  const loading = translateLoadingId === provider.id;
                  const error   = translateErrorMap?.get(provider.id);
                  const ps      = getProviderStyle(provider.id);
                  return (
                    <div key={provider.id} style={{ position: "relative" }}>
                      <ToolBtn
                        onClick={() => onTranslateWith?.(provider)}
                        disabled={loading || !!translateLoadingId}
                        title={t("providers.btn_translate", { name: provider.name }) + (provider.shortcut ? ` (${provider.shortcut})` : "")}
                        style={{
                          background: loading ? ps.bgIdle : ps.bgActive,
                          color:      loading ? ps.color  : "#fff",
                          border:     `1px solid ${ps.border}`,
                          opacity:    loading ? 0.7 : 1,
                          gap: 5,
                        }}
                      >
                        {loading
                          ? <IconSpinner size={11} />
                          : <>
                              <ProviderLetterBadge letter={ps.letter} color={ps.bgActive} bgColor="rgba(255,255,255,0.25)" />
                              <span style={{ fontSize: 10, fontWeight: 600, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{provider.name}</span>
                            </>
                        }
                      </ToolBtn>
                      {error && (
                        <div style={{
                          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 300,
                          background: "var(--danger-dim)", border: "1px solid var(--danger)",
                          borderRadius: 6, padding: "5px 10px",
                          fontSize: 11, color: "var(--danger)", whiteSpace: "nowrap",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        }}>
                          {error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Group: Browser launcher providers ───────────────────────── */}
            {activeLauncherProviders.length > 0 && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />
                {activeLauncherProviders.map(provider => {
                  const ps = getProviderStyle(provider.id);
                  return (
                    <ToolBtn
                      key={provider.id}
                      onClick={() => onOpenBrowserWith?.(provider)}
                      title={t("providers.btn_open_browser", { name: provider.name }) + (provider.shortcut ? ` (${provider.shortcut})` : "")}
                      style={{ background: ps.bgIdle, color: ps.color, border: `1px solid ${ps.border}`, gap: 5 }}
                    >
                      <IconExternalLink size={12} />
                      <span style={{ fontSize: 10, fontWeight: 600, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{provider.name}</span>
                    </ToolBtn>
                  );
                })}
              </>
            )}

            {/* ── Group: Utilities (spell check · tools · copy) ───────────── */}
            <div style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />

            {spellLang && (
              <ToolBtn
                onClick={runSpellCheck}
                disabled={spellChecking}
                active={spellErrors.length > 0}
                title={t("spellcheck.btn_check")}
              >
                {spellChecking
                  ? <IconSpinner size={11} />
                  : <><IconSpellCheck />{spellErrors.length > 0 && <span style={{ fontSize: 10 }}>{spellErrors.length}</span>}</>
                }
              </ToolBtn>
            )}

            {/* Tools dropdown */}
            <div ref={opsRef} style={{ position: "relative" }}>
              <ToolBtn onClick={() => setOpsOpen(o => !o)} title={t("edit.ops_btn")}><IconGear size={12} /></ToolBtn>
              {opsOpen && (
                <div role="menu" style={{ position: "absolute", top: `calc(100% + 3px)`, right: 0, zIndex: 200, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
                  {([ ["trim","op_trim"],["upper","op_upper"],["lower","op_lower"],["strip-tags","op_strip_tags"] ] as [string, string][]).map(([op, i18Key]) => {
                    const scKey = op === "trim" ? "opTrim" : op === "upper" ? "opUpper" : op === "lower" ? "opLower" : "opStripTags";
                    const hint = fmtSc(sc[scKey as keyof EditPanelShortcuts]);
                    return (
                      <MenuItem key={op} onClick={() => applyOp(op as "trim"|"upper"|"lower"|"strip-tags")}>
                        <span style={{ flex: 1 }}>{t(`edit.${i18Key}`)}</span>
                        {hint && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 12, flexShrink: 0 }}>{hint}</span>}
                      </MenuItem>
                    );
                  })}
                  {origTags.length > 0 && (
                    <>
                      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                      <div style={{ fontSize: 10, color: "var(--text-3)", padding: "2px 12px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("edit.op_tags_section")}</div>
                      {origTags.map(tag => (
                        <div key={tag} style={{ display: "flex", alignItems: "center", padding: "3px 12px", gap: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--color-tag)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag}</span>
                          <button onClick={() => insertAtCursor(tag)} title={`${t("edit.op_insert")} ${tag} au curseur`} style={{ height: BTN_H - 4, padding: "0 6px", border: "1px solid var(--border)", borderRadius: 3, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-2)", fontSize: 10, flexShrink: 0 }}>
                            {t("edit.op_insert")}
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <ToolBtn onClick={() => copyText(entry.translated ?? "", "translation")} title={t("edit.copy_translation")}>
              {copiedSide === "translation" ? <span style={{ color: "var(--success)" }}>{t("edit.copied")}</span> : <><IconCopy size={11} />{t("edit.copy")}</>}
            </ToolBtn>
          </div>

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
                onClick={handleTextareaClick}
                placeholder={t("edit.placeholder")}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", resize: "none", padding: `${TA_PAD_V}px ${TA_PAD_H}px`, background: "var(--bg-hover)", color: "transparent", caretColor: "var(--text-1)", border: "1px solid var(--border)", borderRadius: 6, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, lineHeight: TEXT_LH, outline: "none", boxSizing: "border-box" }}
              />
              <div ref={overlayRef} aria-hidden style={{ position: "absolute", inset: 0, padding: `${TA_PAD_V}px ${TA_PAD_H}px`, border: "1px solid transparent", borderRadius: 6, fontSize: TEXT_FZ, fontFamily: TEXT_FONT, lineHeight: TEXT_LH, whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word", overflow: "hidden", pointerEvents: "none", color: "var(--text-1)", boxSizing: "border-box" }}>
                {translOverlaySegs ? <SegmentedText segments={translOverlaySegs} /> : <TaggedText text={entry.translated || ""} />}
                {" "}
              </div>

              {/* Spell suggestions popup */}
              {spellPopup && (
                <div
                  ref={spellPopupRef}
                  style={{
                    position: "fixed", zIndex: 500,
                    left: Math.min(spellPopup.x, window.innerWidth - 220),
                    top: spellPopup.y,
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "6px 0", minWidth: 180,
                    boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 12px 6px" }}>
                    «{spellPopup.word}» — {t("spellcheck.suggestions_title")}
                  </div>
                  {spellPopup.suggestions.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-3)", padding: "4px 12px" }}>{t("spellcheck.no_suggestions")}</div>
                  ) : (
                    spellPopup.suggestions.slice(0, 8).map((s, i) => (
                      <div
                        key={i}
                        onClick={() => applySpellSuggestion(s, spellPopup.charStart, spellPopup.charLen)}
                        style={{ padding: "5px 12px", fontSize: 13, cursor: "pointer", color: "var(--text-1)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        {s}
                      </div>
                    ))
                  )}
                  <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                  <div
                    onClick={() => { setSpellErrors(prev => prev.filter(e => e.char_start !== spellPopup.charStart)); setSpellPopup(null); }}
                    style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", color: "var(--text-3)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {t("spellcheck.ignore")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EditPanel;
