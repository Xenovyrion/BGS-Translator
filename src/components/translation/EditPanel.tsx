import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { startDrag } from "../../hooks/useLayout";
import type { TranslationEntry, EntryStatus } from "../../types";
import { TaggedText } from "../shared/TaggedText";

export interface EditPanelHandle {
  focus: () => void;
}

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

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="9" height="9" rx="1.5"/>
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5V9.5A1.5 1.5 0 0 0 3.5 11H5"/>
    </svg>
  );
}

const GUTTER_W   = 32;
const TEXT_FZ    = "var(--fz-table, 12px)";
const TEXT_LH    = 1.6;
const TEXT_FONT  = "var(--font-content, system-ui, sans-serif)";
// Must match the textarea padding so gutter numbers align with text rows
const TA_PAD_V   = 5;
const TA_PAD_H   = 7;

const EditPanel = forwardRef<EditPanelHandle, Props>(function EditPanel(
  { entry, onTranslate, onSetStatus, onClose, onFocusTable, panelHeight, onPanelResize, recordColors },
  ref,
) {
  const { t } = useTranslation();
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const overlayRef      = useRef<HTMLDivElement>(null);
  const translGutterRef = useRef<HTMLDivElement>(null);
  const [handleHover, setHandleHover] = useState(false);
  const [copiedSide, setCopiedSide]   = useState<"original" | "translation" | null>(null);

  const syncScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop  = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
    if (translGutterRef.current && textareaRef.current) {
      translGutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const formIdHex   = entry.form_id.toString(16).toUpperCase().padStart(8, "0");
  const recordColor = recordColors[entry.record_type] ?? "#64748b";

  const origLines   = entry.original.split("\n");
  const translLines = (entry.translated ?? "").split("\n");
  const origMulti   = origLines.length > 1;
  const translMulti = translLines.length > 1;

  const fmtCount = (n: number) => n.toLocaleString();

  const copyText = useCallback((text: string, side: "original" | "translation") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSide(side);
      setTimeout(() => setCopiedSide(null), 1500);
    });
  }, []);

  const STATUS_CONFIG: Array<{ status: EntryStatus; label: string; color: string }> = [
    { status: "validated",    label: t("edit.status_validated"),    color: "#22c55e" },
    { status: "pending",      label: t("edit.status_pending"),      color: "#f59e0b" },
    { status: "ignored",      label: t("edit.status_ignored"),      color: "#64748b" },
    { status: "untranslated", label: t("edit.status_untranslated"), color: "#ef4444" },
  ];

  useImperativeHandle(ref, () => ({
    focus() {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    },
  }));

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onTranslate(entry._idx ?? 0, e.target.value);
  }, [entry._idx, onTranslate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      onSetStatus(entry._idx ?? 0, "validated");
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") { onFocusTable(); e.preventDefault(); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.stopPropagation();
  }, [entry._idx, onSetStatus, onFocusTable]);

  // ── Shared styles ──────────────────────────────────────────────────────────
  const colHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    marginBottom: 4, flexShrink: 0,
    padding: "2px 0",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--text-1)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.07em",
  };
  const dotStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--text-3)", opacity: 0.5,
  };
  const metaStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--text-2)",
  };
  const copyBtnStyle: React.CSSProperties = {
    marginLeft: "auto", height: 20, padding: "0 7px",
    border: "1px solid var(--border)", borderRadius: 4,
    cursor: "pointer", background: "var(--bg-hover)",
    color: "var(--text-2)", fontSize: 11,
    display: "flex", alignItems: "center", gap: 4,
    flexShrink: 0, transition: "color 0.12s, border-color 0.12s",
  };
  const gutterNumStyle: React.CSSProperties = {
    width: GUTTER_W, flexShrink: 0,
    fontSize: TEXT_FZ, fontFamily: "monospace",
    lineHeight: TEXT_LH,
    color: "var(--text-3)", opacity: 0.45,
    userSelect: "none", textAlign: "right",
    paddingRight: 7,
    // ensure empty lines still occupy one line-height
    minHeight: "1.6em",
  };
  const textLineStyle: React.CSSProperties = {
    flex: 1,
    fontSize: TEXT_FZ, fontFamily: TEXT_FONT,
    color: "var(--text-2)", lineHeight: TEXT_LH,
    whiteSpace: "pre-wrap", wordBreak: "break-word",
    minHeight: "1.6em",
    userSelect: "text",
  };

  return (
    <div style={{
      height: panelHeight, flexShrink: 0,
      background: "var(--bg-edit-panel, var(--bg-card))",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* ── Resize handle ─────────────────────────────────────────────── */}
      <div
        onMouseDown={(e) => startDrag(e, "v", onPanelResize)}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        style={{ flexShrink: 0, height: 6, cursor: "row-resize", display: "flex", alignItems: "center", background: "transparent" }}
      >
        <div style={{
          width: "100%", height: handleHover ? 2 : 1,
          background: handleHover ? "var(--accent)" : "rgba(0,0,0,0.4)",
          transition: "height 0.1s, background 0.12s",
        }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "4px 10px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-hover)", flexShrink: 0,
      }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-3)" }}>
          [<span style={{ color: recordColor, fontWeight: 700 }}>{entry.record_type}</span>] {formIdHex}
        </span>
        {entry.editor_id && (
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
            {entry.editor_id}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-primary)", padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>
          {entry.sub_type}
        </span>
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>
          {t("edit.status_label")}
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          {STATUS_CONFIG.map(({ status, label, color }) => {
            const active = entry.status === status;
            return (
              <button key={status} onClick={() => onSetStatus(entry._idx ?? 0, status)} style={{
                height: 24, padding: "0 8px", borderRadius: 4, cursor: "pointer",
                fontSize: 11, fontWeight: active ? 700 : 400,
                background: active ? color : "transparent",
                color: active ? "#fff" : color,
                border: `1px solid ${color}`,
                opacity: active ? 1 : 0.6,
                transition: "opacity 0.12s, background 0.12s",
                boxSizing: "border-box",
              }}>{label}</button>
            );
          })}
        </div>
        <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8, flexShrink: 0 }}>{t("edit.hint")}</span>
        <button onClick={onClose} title={t("edit.close_title")} style={{ marginLeft: 4, width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-3)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ×
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Original (read-only, selectable) ──────────────────────── */}
        <div style={{
          flex: 1, padding: "7px 10px",
          borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}>
          {/* Column header */}
          <div style={colHeaderStyle}>
            <span style={labelStyle}>{t("edit.original_label")}</span>
            <span style={dotStyle}>·</span>
            <span style={metaStyle}>{fmtCount(entry.original.length)} {t("edit.chars")}</span>
            {origMulti && <>
              <span style={dotStyle}>·</span>
              <span style={metaStyle}>{fmtCount(origLines.length)} {t("edit.lines")}</span>
            </>}
            <button style={copyBtnStyle} onClick={() => copyText(entry.original, "original")} title={t("edit.copy_original")}>
              {copiedSide === "original"
                ? <span style={{ color: "#22c55e" }}>{t("edit.copied")}</span>
                : <><CopyIcon />{t("edit.copy")}</>
              }
            </button>
          </div>

          {/* Per-line rendering: gutter number + text in same row → perfect alignment even on wrapped lines */}
          <div style={{ flex: 1 }}>
            {origLines.map((line, i) => (
              <div key={i} style={{ display: "flex" }}>
                {origMulti && <div style={gutterNumStyle}>{i + 1}</div>}
                <div style={textLineStyle}>
                  {line === "" ? "​" /* zero-width space keeps line height */ : <TaggedText text={line} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Translation ───────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "7px 10px" }}>
          {/* Column header */}
          <div style={colHeaderStyle}>
            <span style={labelStyle}>{t("edit.translation_label")}</span>
            <span style={dotStyle}>·</span>
            <span style={metaStyle}>{fmtCount((entry.translated ?? "").length)} {t("edit.chars")}</span>
            {translMulti && <>
              <span style={dotStyle}>·</span>
              <span style={metaStyle}>{fmtCount(translLines.length)} {t("edit.lines")}</span>
            </>}
            <button style={copyBtnStyle} onClick={() => copyText(entry.translated ?? "", "translation")} title={t("edit.copy_translation")}>
              {copiedSide === "translation"
                ? <span style={{ color: "#22c55e" }}>{t("edit.copied")}</span>
                : <><CopyIcon />{t("edit.copy")}</>
              }
            </button>
          </div>

          {/* Gutter + textarea+overlay */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {translMulti && (
              <div
                ref={translGutterRef}
                style={{
                  width: GUTTER_W, flexShrink: 0,
                  overflowY: "hidden", height: "100%",
                  // Match textarea vertical padding so line 1 aligns exactly
                  paddingTop: TA_PAD_V,
                  boxSizing: "border-box",
                }}
              >
                {translLines.map((_, i) => (
                  <div key={i} style={gutterNumStyle}>{i + 1}</div>
                ))}
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
                style={{
                  position: "absolute", inset: 0,
                  width: "100%", height: "100%",
                  resize: "none",
                  padding: `${TA_PAD_V}px ${TA_PAD_H}px`,
                  background: "var(--bg-hover)",
                  color: "transparent", caretColor: "var(--text-1)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  fontSize: TEXT_FZ, fontFamily: TEXT_FONT,
                  lineHeight: TEXT_LH, outline: "none", boxSizing: "border-box",
                }}
              />
              <div
                ref={overlayRef}
                aria-hidden
                style={{
                  position: "absolute", inset: 0,
                  padding: `${TA_PAD_V}px ${TA_PAD_H}px`,
                  border: "1px solid transparent", borderRadius: 6,
                  fontSize: TEXT_FZ, fontFamily: TEXT_FONT,
                  lineHeight: TEXT_LH,
                  whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word",
                  overflow: "hidden", pointerEvents: "none",
                  color: "var(--text-1)", boxSizing: "border-box",
                }}
              >
                <TaggedText text={entry.translated || ""} />
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
