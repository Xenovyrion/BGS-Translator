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

const EditPanel = forwardRef<EditPanelHandle, Props>(function EditPanel(
  { entry, onTranslate, onSetStatus, onClose, onFocusTable, panelHeight, onPanelResize, recordColors },
  ref,
) {
  const { t } = useTranslation();
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);
  const [handleHover, setHandleHover] = useState(false);

  const syncScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop  = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);
  const formIdHex    = entry.form_id.toString(16).toUpperCase().padStart(8, "0");
  const recordColor  = recordColors[entry.record_type] ?? "#64748b";

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

  return (
    <div style={{
      height: panelHeight,
      flexShrink: 0,
      background: "var(--bg-edit-panel, var(--bg-card))",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Resize handle (top edge) ─────────────────────────────────── */}
      <div
        onMouseDown={(e) => startDrag(e, "v", onPanelResize)}
        onMouseEnter={() => setHandleHover(true)}
        onMouseLeave={() => setHandleHover(false)}
        style={{
          flexShrink: 0,
          height: 6,
          cursor: "row-resize",
          display: "flex",
          alignItems: "center",
          background: "transparent",
        }}
      >
        <div style={{
          width: "100%",
          height: handleHover ? 2 : 1,
          background: handleHover ? "var(--accent)" : "rgba(0,0,0,0.4)",
          transition: "height 0.1s, background 0.12s",
        }} />
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "4px 10px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-hover)",
        flexShrink: 0,
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

        {/* Status label + buttons */}
        <span style={{
          marginLeft: "auto", flexShrink: 0,
          fontSize: 10, color: "var(--text-3)",
          textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600,
        }}>
          {t("edit.status_label")}
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          {STATUS_CONFIG.map(({ status, label, color }) => {
            const active = entry.status === status;
            return (
              <button
                key={status}
                onClick={() => onSetStatus(entry._idx ?? 0, status)}
                style={{
                  height: 24, padding: "0 8px",
                  borderRadius: 4, cursor: "pointer",
                  fontSize: 11, fontWeight: active ? 700 : 400,
                  background: active ? color : "transparent",
                  color: active ? "#fff" : color,
                  border: `1px solid ${color}`,
                  opacity: active ? 1 : 0.6,
                  transition: "opacity 0.12s, background 0.12s",
                  boxSizing: "border-box",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8, flexShrink: 0 }}>
          {t("edit.hint")}
        </span>

        <button
          onClick={onClose}
          title={t("edit.close_title")}
          style={{ marginLeft: 4, width: 20, height: 20, borderRadius: 4, border: "none", cursor: "pointer", background: "transparent", color: "var(--text-3)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ×
        </button>
      </div>

      {/* ── Contenu ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Original */}
        <div style={{
          flex: 1, padding: "7px 10px", overflowY: "auto",
          borderRight: "1px solid var(--border)",
          fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content, system-ui, sans-serif)",
          color: "var(--text-2)", lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("edit.original_label")}
          </div>
          <TaggedText text={entry.original} />
        </div>

        {/* Traduction */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "7px 10px" }}>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t("edit.translation_label")}
          </div>
          {/* Wrapper: textarea below, overlay on top (pointerEvents:none) */}
          <div style={{ flex: 1, position: "relative" }}>
            {/* Actual textarea — transparent text so only overlay is visible */}
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
                resize: "none", padding: "5px 7px",
                background: "var(--bg-hover)",
                color: "transparent",
                caretColor: "var(--text-1)",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: "var(--fz-table, 12px)", fontFamily: "var(--font-content, system-ui, sans-serif)",
                lineHeight: 1.6, outline: "none", boxSizing: "border-box",
              }}
            />
            {/* Read-only overlay rendered on top — provides visible colored text */}
            <div
              ref={overlayRef}
              aria-hidden
              style={{
                position: "absolute", inset: 0,
                padding: "5px 7px",
                border: "1px solid transparent",
                borderRadius: 6,
                fontSize: "var(--fz-table, 12px)",
                fontFamily: "var(--font-content, system-ui, sans-serif)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                overflow: "hidden",
                pointerEvents: "none",
                color: "var(--text-1)",
                boxSizing: "border-box",
              }}
            >
              <TaggedText text={entry.translated || ""} />
              {/* trailing space prevents last-line height collapse */}
              {" "}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EditPanel;
