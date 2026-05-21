import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { IconClose, IconSearch } from "../../icons";

import type {
  DiffStats, PluginDiffResult, RecordDiff,
  ChangeKind, SessionListItem,
} from "../../types";
import DiffStatsBar from "./DiffStatsBar";
import DiffTable    from "./DiffTable";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "check_done"; stats: DiffStats }
  | { kind: "computing" }
  | { kind: "done"; result: PluginDiffResult }
  | { kind: "error"; message: string };

interface Props {
  /** Path of the currently-open plugin (pre-fills "Plugin B"). Null in standalone mode. */
  activePluginPath: string | null;
  /** Active plugin name (reserved for future session matching). */
  activePluginName?: string | null;
  /** All known sessions (for auto-detection of the old plugin's session). */
  sessions:         SessionListItem[];
  onClose:          () => void;
  /** Called when user clicks "Récupérer" on a single field — applies to the current session. */
  onRecover:        (formId: number, subType: string, textNew: string | null, translation: string) => void;
  /** Called when user clicks "Récupérer tout" — bulk apply, single notification. */
  onRecoverAll:     (recoveries: Array<{ formId: number; subType: string; textNew: string | null; translation: string }>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

function pluginStem(p: string): string {
  const base = filename(p);
  const dot  = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompareModal({
  activePluginPath, sessions, onClose, onRecover, onRecoverAll,
}: Props) {
  const { t } = useTranslation();

  const [pathOld,   setPathOld]   = useState("");
  const [pathNew,   setPathNew]   = useState(activePluginPath ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Filter state
  const [filterKinds, setFilterKinds] = useState<Set<ChangeKind>>(
    () => new Set(["added", "removed", "modified"] as ChangeKind[])
  );
  const [filterQuery,             setFilterQuery]             = useState("");
  const [filterRecoverableOnly,   setFilterRecoverableOnly]   = useState(false);

  // Escape key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-detect session for pathOld when it changes
  useEffect(() => {
    if (!pathOld) { setSessionId(null); return; }
    const stem = pluginStem(pathOld).toLowerCase();
    const match = sessions
      .filter(s => s.plugin_name.toLowerCase() === stem)
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))[0];
    setSessionId(match?.id ?? null);
  }, [pathOld, sessions]);

  // Is "Plugin B = active plugin"? → recovery mode available
  const recoveryMode = !!activePluginPath && pathNew === activePluginPath;

  // ── File pickers ────────────────────────────────────────────────────────────

  const pickOld = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
      title: t("compare.pick_old_title"),
      multiple: false,
    });
    if (selected && typeof selected === "string") {
      setPathOld(selected);
      setPhase({ kind: "idle" });
    }
  }, [t]);

  const pickNew = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "Bethesda Plugin", extensions: ["esp", "esm", "esl"] }],
      title: t("compare.pick_new_title"),
      multiple: false,
    });
    if (selected && typeof selected === "string") {
      setPathNew(selected);
      setPhase({ kind: "idle" });
    }
  }, [t]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const canRun = pathOld.trim() !== "" && pathNew.trim() !== "";

  const handleCheck = useCallback(async () => {
    if (!canRun) return;
    setPhase({ kind: "checking" });
    try {
      const stats = await invoke<DiffStats>("check_plugin_diff_cmd", {
        pathOld, pathNew,
      });
      setPhase({ kind: "check_done", stats });
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  }, [canRun, pathOld, pathNew]);

  const handleCompute = useCallback(async () => {
    if (!canRun) return;
    setPhase({ kind: "computing" });
    try {
      const result = await invoke<PluginDiffResult>("compute_plugin_diff_cmd", {
        pathOld,
        pathNew,
        sessionId: sessionId ?? null,
        includeUnchanged: filterKinds.has("unchanged"),
      });
      setPhase({ kind: "done", result });
    } catch (e) {
      setPhase({ kind: "error", message: String(e) });
    }
  }, [canRun, pathOld, pathNew, sessionId, filterKinds]);

  // ── Recovery handlers ───────────────────────────────────────────────────────

  const handleRecover = useCallback((
    formId: number, subType: string, textNew: string | null, translation: string
  ) => {
    onRecover(formId, subType, textNew, translation);
  }, [onRecover]);

  const handleRecoverAll = useCallback((
    recoveries: Array<{ formId: number; subType: string; textNew: string | null; translation: string }>
  ) => {
    onRecoverAll(recoveries);
  }, [onRecoverAll]);

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const toggleKind = (kind: ChangeKind) => {
    setFilterKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  // Records to display
  const records: RecordDiff[] = phase.kind === "done" ? phase.result.records : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "var(--modal-backdrop, rgba(0,0,0,0.55))",
        display: "flex", alignItems: "stretch", justifyContent: "stretch",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel — takes most of the viewport, with comfortable margins */}
      <div style={{
        margin: "16px 24px",
        flex: 1,
        background: "var(--bg-card)",
        borderRadius: 10,
        border: "1px solid var(--border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-menubar)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <IconSearch size={15} /> {t("compare.title")}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none",
              color: "var(--text-2)", cursor: "pointer",
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* ── File pickers ── */}
        <div style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          flexShrink: 0,
          background: "var(--bg-primary)",
        }}>
          {/* Plugin A */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>
              {t("compare.plugin_old")}
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{
                flex: 1, fontSize: 11,
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "4px 8px",
                color: pathOld ? "var(--text-1)" : "var(--text-2)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                opacity: pathOld ? 1 : 0.5,
              }}>
                {pathOld ? filename(pathOld) : t("compare.pick_placeholder")}
              </div>
              <button onClick={pickOld} style={btnStyle}>
                {t("compare.browse")}
              </button>
            </div>
            {/* Session info */}
            {pathOld && (
              <div style={{ fontSize: 10, color: "var(--text-2)", opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                {sessionId ? (
                  <><IconSearch size={9} /> {t("compare.session_found")}: {sessionId.split("__")[0]}</>
                ) : t("compare.session_none")}
              </div>
            )}
          </div>

          {/* Plugin B */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>
              {t("compare.plugin_new")}
              {recoveryMode && (
                <span style={{
                  marginLeft: 8,
                  background: "color-mix(in srgb, var(--diff-added) 15%, transparent)", color: "var(--diff-added)",
                  border: "1px solid color-mix(in srgb, var(--diff-added) 30%, transparent)",
                  borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600,
                }}>
                  {t("compare.active_plugin")}
                </span>
              )}
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{
                flex: 1, fontSize: 11,
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "4px 8px",
                color: pathNew ? "var(--text-1)" : "var(--text-2)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                opacity: pathNew ? 1 : 0.5,
              }}>
                {pathNew ? filename(pathNew) : t("compare.pick_placeholder")}
              </div>
              <button onClick={pickNew} style={btnStyle}>
                {t("compare.browse")}
              </button>
            </div>
            {recoveryMode && (
              <div style={{ fontSize: 10, color: "var(--diff-added)", opacity: 0.8 }}>
                {t("compare.recovery_mode_hint")}
              </div>
            )}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <button
            onClick={handleCheck}
            disabled={!canRun || phase.kind === "checking" || phase.kind === "computing"}
            style={{ ...btnStyle, padding: "5px 16px", opacity: canRun ? 1 : 0.4 }}
          >
            {phase.kind === "checking" ? t("compare.checking") : t("compare.check")}
          </button>

          <button
            onClick={handleCompute}
            disabled={!canRun || phase.kind === "checking" || phase.kind === "computing"}
            style={{
              ...btnStyle,
              padding: "5px 16px",
              background: "var(--accent)",
              color: "var(--bg-primary, #fff)",
              opacity: canRun ? 1 : 0.4,
            }}
          >
            {phase.kind === "computing" ? t("compare.computing") : t("compare.compare")}
          </button>

          {/* Check result inline — stats only, no extra button */}
          {phase.kind === "check_done" && <CheckResult stats={phase.stats} />}
          {phase.kind === "error" && (
            <span style={{ fontSize: 11, color: "var(--diff-removed)", flex: 1 }}>
              ⚠ {phase.message}
            </span>
          )}
        </div>

        {/* ── Filters (only when diff is loaded) ── */}
        {phase.kind === "done" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 14px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            flexWrap: "wrap",
          }}>
            {(["added", "removed", "modified", "unchanged"] as ChangeKind[]).map(kind => (
              <FilterChip
                key={kind}
                kind={kind}
                active={filterKinds.has(kind)}
                onToggle={() => toggleKind(kind)}
              />
            ))}

            <div style={{ width: 1, height: 18, background: "var(--border)" }} />

            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={filterRecoverableOnly}
                onChange={e => setFilterRecoverableOnly(e.target.checked)}
                style={{ accentColor: "var(--accent)" }}
              />
              ✨ {t("compare.filter_recoverable")}
            </label>

            <div style={{ width: 1, height: 18, background: "var(--border)" }} />

            <input
              type="text"
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              placeholder={t("compare.search_placeholder")}
              style={{
                flex: 1, minWidth: 140,
                background: "var(--bg-hover)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "3px 8px",
                fontSize: 11, color: "var(--text-1)",
                outline: "none",
              }}
            />
          </div>
        )}

        {/* ── Stats bar ── */}
        {phase.kind === "done" && <DiffStatsBar stats={phase.result.stats} />}

        {/* ── Diff table / placeholder ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {phase.kind === "idle" && (
            <IdlePlaceholder t={t} />
          )}
          {(phase.kind === "checking" || phase.kind === "computing") && (
            <Placeholder text={t("compare.placeholder_loading")} spinner />
          )}
          {phase.kind === "done" && (
            <DiffTable
              records={records}
              filterKinds={filterKinds}
              filterQuery={filterQuery}
              filterRecoverableOnly={filterRecoverableOnly}
              onRecover={handleRecover}
              onRecoverAll={handleRecoverAll}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}>
          {phase.kind === "done" && (
            <button
              onClick={handleCompute}
              title={t("compare.recompute_hint")}
              style={{ ...btnStyle, padding: "5px 16px" }}
            >
              {t("compare.recompute")}
            </button>
          )}
          <button onClick={onClose} style={{ ...btnStyle, padding: "5px 16px" }}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Idle placeholder with usage guide ────────────────────────────────────────

function IdlePlaceholder({ t }: { t: (k: string) => string }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20, padding: "32px 48px",
    }}>
      {/* Usage guide */}
      <div style={{
        maxWidth: 560,
        background: "var(--accent-dim, rgba(59,130,246,0.07))",
        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
        borderRadius: 8,
        padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
          <span>ℹ️</span>
          <span>{t("compare.usage_title")}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 6, lineHeight: 1.6 }}>
          <div>
            <span style={{ color: "var(--diff-modified)", fontWeight: 600 }}>Plugin A</span>
            {" — "}{t("compare.usage_plugin_a")}
          </div>
          <div>
            <span style={{ color: "var(--diff-added)", fontWeight: 600 }}>Plugin B</span>
            {" — "}{t("compare.usage_plugin_b")}
          </div>
          <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
            {t("compare.usage_goal")}
          </div>
        </div>
      </div>

      <span style={{ fontSize: 12, color: "var(--text-2)", opacity: 0.6 }}>
        {t("compare.placeholder_idle")}
      </span>
    </div>
  );
}

// ── Generic loading / empty placeholder ───────────────────────────────────────

function Placeholder({ text, spinner = false }: { text: string; spinner?: boolean }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "var(--text-2)", gap: 12,
    }}>
      {spinner && (
        <>
          <style>{`@keyframes compare-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            width: 28, height: 28, border: "3px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "compare-spin 0.8s linear infinite",
          }} />
        </>
      )}
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  );
}

function CheckResult({ stats }: { stats: DiffStats }) {
  const { t } = useTranslation();
  const noChanges = stats.added === 0 && stats.removed === 0 && stats.modified === 0;

  if (noChanges) {
    return (
      <span style={{ fontSize: 12, color: "var(--diff-added)", fontWeight: 600 }}>
        ✅ {t("compare.check_no_diff")}
      </span>
    );
  }

  return (
    <span style={{ fontSize: 12, color: "var(--text-1)" }}>
      <span style={{ color: "var(--diff-added)", fontWeight: 600 }}>+{stats.added}</span>
      {" · "}
      <span style={{ color: "var(--diff-removed)", fontWeight: 600 }}>−{stats.removed}</span>
      {" · "}
      <span style={{ color: "var(--diff-modified)", fontWeight: 600 }}>~{stats.modified}</span>
      {stats.recoverable > 0 && (
        <span style={{ color: "var(--diff-recoverable)", fontWeight: 600 }}> · ✨{stats.recoverable}</span>
      )}
      <span style={{ color: "var(--text-2)", marginLeft: 6, fontSize: 11 }}>
        — {t("compare.check_hint")}
      </span>
    </span>
  );
}

const KIND_COLOR_FILTER: Record<ChangeKind, string> = {
  added:     "var(--diff-added)",
  removed:   "var(--diff-removed)",
  modified:  "var(--diff-modified)",
  unchanged: "var(--diff-unchanged)",
};

function FilterChip({ kind, active, onToggle }: { kind: ChangeKind; active: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const color = KIND_COLOR_FILTER[kind];
  const label = t(`compare.filter_${kind}`);
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "2px 10px",
        background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        border: `1px solid ${active ? color : "var(--border)"}`,
        borderRadius: 12,
        color: active ? color : "var(--text-2)",
        fontSize: 11, cursor: "pointer",
        fontWeight: active ? 600 : 400,
        transition: "all 0.15s",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? color : "var(--text-2)", flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ── Shared style ──────────────────────────────────────────────────────────────

const btnStyle = {
  padding: "4px 12px",
  background: "var(--bg-hover)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-1)",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};
