import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { SessionListItem } from "../../types";
import type { IconSetId } from "../../themes";
import { IconSession, IconPlay, IconSpinner, IconTrash, IconClose, IconSave } from "../../icons";

interface Props {
  onClose:  () => void;
  onLoad:   (id: string) => void;
  iconSet?: IconSetId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function groupSessions(
  items: SessionListItem[],
): { pluginName: string; sessions: SessionListItem[] }[] {
  const map = new Map<string, SessionListItem[]>();
  for (const s of items) {
    const list = map.get(s.plugin_name);
    if (list) list.push(s);
    else map.set(s.plugin_name, [s]);
  }
  return Array.from(map.entries())
    .map(([pluginName, sessions]) => ({ pluginName, sessions }))
    .sort((a, b) => a.pluginName.localeCompare(b.pluginName, undefined, { sensitivity: "base" }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionPickerModal({ onClose, onLoad, iconSet = "minimal" }: Props) {
  const { t } = useTranslation();
  const [sessions,       setSessions]       = useState<SessionListItem[] | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [confirmId,      setConfirmId]      = useState<string | null>(null);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadList = async () => {
    setError(null);
    try {
      const list = await invoke<SessionListItem[]>("list_sessions_cmd");
      setSessions(list);
      // Groups start collapsed — user expands on demand
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { loadList(); }, []);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await invoke("delete_session_cmd", { id });
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const groups = sessions ? groupSessions(sessions) : [];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, width: 700, height: 560, display: "flex", flexDirection: "column", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-dim, rgba(99,102,241,0.15))", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--accent)" }}>
              <IconSession size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
                {t("session.title")}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                {sessions == null
                  ? t("session.loading")
                  : sessions.length === 0
                  ? t("session.empty")
                  : t("session.subtitle", { count: sessions.length })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px 4px", lineHeight: 1, borderRadius: 4, display: "flex", alignItems: "center" }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* ── Content — fixed height, scrollable ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px", minHeight: 0 }}>
          {error && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "8px 12px" }}>
              {error}
            </p>
          )}

          {sessions === null && !error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--text-3)", fontSize: 13 }}>
              <IconSpinner size={14} /> {t("session.loading")}
            </div>
          )}

          {sessions?.length === 0 && (
            <div style={{ textAlign: "center", paddingTop: 80, color: "var(--text-3)", fontSize: 13 }}>
              <div style={{ marginBottom: 12, opacity: 0.4, display: "flex", justifyContent: "center" }}>
                <IconSave size={36} />
              </div>
              {t("session.empty_hint")}
            </div>
          )}

          {groups.map(({ pluginName, sessions: groupSessions }) => {
            const isExpanded = expandedGroups.has(pluginName);
            const latestId   = groupSessions[0]?.id;
            return (
              <div key={pluginName} style={{ marginBottom: 6 }}>

                {/* ── Group header ── */}
                <div
                  onClick={() => toggleGroup(pluginName)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: isExpanded ? "7px 7px 0 0" : 7,
                    cursor: "pointer", userSelect: "none",
                    background: "var(--bg-hover)", border: "1px solid var(--border)",
                    borderBottom: isExpanded ? "1px solid transparent" : "1px solid var(--border)",
                  }}
                >
                  {/* Chevron */}
                  <svg
                    width="11" height="11" viewBox="0 0 24 24"
                    fill="none" stroke="var(--text-3)" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>

                  {/* Plugin name */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", fontFamily: "var(--font-mono, monospace)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pluginName}
                  </span>

                  {/* Count badge */}
                  <span style={{ fontSize: 10, color: "var(--text-3)", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "1px 8px", flexShrink: 0 }}>
                    {groupSessions.length}
                  </span>

                  {/* Load latest button */}
                  {latestId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onLoad(latestId); }}
                      title={t("session.load_latest")}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", flexShrink: 0 }}
                    >
                      <IconPlay size={10} /> {t("session.load_latest")}
                    </button>
                  )}
                </div>

                {/* ── Session rows ── */}
                {isExpanded && (
                  <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 7px 7px", overflow: "hidden" }}>
                    {groupSessions.map((session, i) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        isLatest={i === 0}
                        isLast={i === groupSessions.length - 1}
                        isConfirming={confirmId === session.id}
                        isDeleting={deletingId === session.id}
                        iconSet={iconSet}
                        onLoad={() => onLoad(session.id)}
                        onConfirmDelete={() => setConfirmId(session.id)}
                        onCancelDelete={() => setConfirmId(null)}
                        onDelete={() => handleDelete(session.id)}
                        formatDate={formatDate}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: "10px 20px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 18px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "var(--bg-hover)", color: "var(--text-1)", border: "1px solid var(--border)" }}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────

interface RowProps {
  session:         SessionListItem;
  isLatest:        boolean;
  isLast:          boolean;
  isConfirming:    boolean;
  isDeleting:      boolean;
  iconSet:         IconSetId;
  onLoad:          () => void;
  onConfirmDelete: () => void;
  onCancelDelete:  () => void;
  onDelete:        () => void;
  formatDate:      (iso: string) => string;
  t:               (key: string, opts?: Record<string, unknown>) => string;
}

function SessionRow({
  session, isLatest, isLast, isConfirming, isDeleting, iconSet,
  onLoad, onConfirmDelete, onCancelDelete, onDelete,
  formatDate, t,
}: RowProps) {
  const pct = Math.round(session.progress_percent);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 12px",
      background: isLatest ? "rgba(99,102,241,0.07)" : "transparent",
      borderBottom: isLast ? "none" : "1px solid var(--border)",
    }}>
      {/* Latest dot */}
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: isLatest ? "var(--accent)" : "transparent", flexShrink: 0 }} />

      {/* Date */}
      <span style={{ fontSize: 11, color: "var(--text-2)", whiteSpace: "nowrap", minWidth: 140 }}>
        {formatDate(session.saved_at)}
      </span>

      {/* Progress bar + count */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--bg-primary, rgba(255,255,255,0.06))", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", minWidth: 90, textAlign: "right" }}>
          {session.translated_count.toLocaleString()} / {session.entry_count.toLocaleString()} ({pct}%)
        </span>
      </div>

      {/* Actions */}
      {isConfirming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{t("session.confirm_delete")}</span>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: isDeleting ? "wait" : "pointer", background: "var(--danger, #ef4444)", color: "#fff", border: "none" }}
          >
            {t("session.delete_yes")}
          </button>
          <button
            onClick={onCancelDelete}
            style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, cursor: "pointer", background: "var(--bg-hover)", color: "var(--text-1)", border: "1px solid var(--border)" }}
          >
            {t("session.delete_no")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={onLoad}
            style={{ padding: "4px 12px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 4 }}
          >
            <IconPlay size={10} /> {t("session.load")}
          </button>
          <button
            onClick={onConfirmDelete}
            title={t("session.delete")}
            style={{ width: 28, height: 28, padding: 0, borderRadius: 5, cursor: "pointer", background: "transparent", color: "var(--text-3)", border: "1px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s, background 0.12s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--danger, #ef4444)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <IconTrash set={iconSet} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

