// ── QA Panel — automatic translation quality checks ───────────────────────────
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TranslationEntry } from "../../types";
import { IconClose, IconWarning, IconCheck } from "../../icons";

// ── Rule types ────────────────────────────────────────────────────────────────

export type QaRule =
  | "missing_variables"
  | "extra_variables"
  | "punctuation_mismatch"
  | "double_spaces"
  | "trailing_whitespace"
  | "length_excess"
  | "empty_validated";

export interface QaIssue {
  entryIdx:   number;
  rule:        QaRule;
  detail:      string;
  original:    string;
  translated:  string;
  record_type: string;
  sub_type:    string;
}

// ── Variable patterns ─────────────────────────────────────────────────────────

const VAR_PATTERNS = [
  /<[A-Za-z][^>]*>/g,    // <Alias=Foo>, <Global=Bar>, etc.
  /\[COUNT\]/g,
  /%[sdf%]/g,
  /\{[0-9]+\}/g,          // {0}, {1}, …
  /\[\[.*?\]\]/g,         // [[variable]]
];

function extractVariables(text: string): string[] {
  const vars: string[] = [];
  for (const pat of VAR_PATTERNS) {
    for (const m of text.matchAll(pat)) {
      vars.push(m[0]);
    }
  }
  return vars;
}

function getTerminalPunctuation(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed) return "";
  const last = trimmed[trimmed.length - 1];
  return /[.!?…:;,]/.test(last) ? last : "";
}

// ── Core QA engine ────────────────────────────────────────────────────────────

export function runQaChecks(entries: TranslationEntry[]): QaIssue[] {
  const issues: QaIssue[] = [];

  for (const entry of entries) {
    const idx        = entry._idx ?? 0;
    const orig       = entry.original  ?? "";
    const transl     = entry.translated ?? "";
    const status     = entry.status;
    const isTransl   = transl.trim().length > 0;

    // Skip untranslated entries for most checks (except empty_validated)
    if (!isTransl) {
      if (status === "validated") {
        issues.push({
          entryIdx:   idx,
          rule:        "empty_validated",
          detail:      "",
          original:    orig,
          translated:  transl,
          record_type: entry.record_type,
          sub_type:    entry.sub_type,
        });
      }
      continue;
    }

    // ── Missing variables ─────────────────────────────────────────────────────
    const origVars   = extractVariables(orig);
    const translVars = extractVariables(transl);
    const missing    = origVars.filter(v => !translVars.includes(v));
    if (missing.length > 0) {
      issues.push({
        entryIdx:   idx,
        rule:        "missing_variables",
        detail:      missing.join(", "),
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }

    // ── Extra variables (in translation but not in original) ──────────────────
    const extra = translVars.filter(v => !origVars.includes(v));
    if (extra.length > 0) {
      issues.push({
        entryIdx:   idx,
        rule:        "extra_variables",
        detail:      extra.join(", "),
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }

    // ── Punctuation mismatch ──────────────────────────────────────────────────
    const origPunct   = getTerminalPunctuation(orig);
    const translPunct = getTerminalPunctuation(transl);
    if (origPunct && translPunct && origPunct !== translPunct) {
      issues.push({
        entryIdx:   idx,
        rule:        "punctuation_mismatch",
        detail:      `«${origPunct}» → «${translPunct}»`,
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }

    // ── Double spaces ─────────────────────────────────────────────────────────
    if (/  /.test(transl)) {
      issues.push({
        entryIdx:   idx,
        rule:        "double_spaces",
        detail:      "",
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }

    // ── Trailing / leading whitespace ─────────────────────────────────────────
    if (transl !== transl.trim()) {
      issues.push({
        entryIdx:   idx,
        rule:        "trailing_whitespace",
        detail:      "",
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }

    // ── Length excess (> 250 % of original) ───────────────────────────────────
    if (orig.length > 0 && transl.length > orig.length * 2.5) {
      const pct = Math.round((transl.length / orig.length) * 100);
      issues.push({
        entryIdx:   idx,
        rule:        "length_excess",
        detail:      `${pct}%`,
        original:    orig,
        translated:  transl,
        record_type: entry.record_type,
        sub_type:    entry.sub_type,
      });
    }
  }

  return issues;
}

// ── QaPanel component ─────────────────────────────────────────────────────────

interface Props {
  entries:    TranslationEntry[];
  onNavigate: (idx: number) => void;
  onClose:    () => void;
}

const ALL_RULES: QaRule[] = [
  "missing_variables",
  "extra_variables",
  "punctuation_mismatch",
  "double_spaces",
  "trailing_whitespace",
  "length_excess",
  "empty_validated",
];

const RULE_COLORS: Record<QaRule, string> = {
  missing_variables:    "var(--danger)",
  extra_variables:      "var(--warning)",
  punctuation_mismatch: "var(--warning)",
  double_spaces:        "var(--info)",
  trailing_whitespace:  "var(--info)",
  length_excess:        "var(--accent-alt, #8b5cf6)",
  empty_validated:      "var(--danger)",
};

export function QaPanel({ entries, onNavigate, onClose }: Props) {
  const { t } = useTranslation();
  const [activeRules, setActiveRules] = useState<Set<QaRule>>(new Set(ALL_RULES));

  const issues = useMemo(() => runQaChecks(entries), [entries]);

  const filtered = useMemo(
    () => issues.filter(i => activeRules.has(i.rule)),
    [issues, activeRules],
  );

  const countByRule = useMemo(() => {
    const map: Partial<Record<QaRule, number>> = {};
    for (const issue of issues) {
      map[issue.rule] = (map[issue.rule] ?? 0) + 1;
    }
    return map;
  }, [issues]);

  const toggleRule = (rule: QaRule) => {
    setActiveRules(prev => {
      const next = new Set(prev);
      if (next.has(rule)) next.delete(rule); else next.add(rule);
      return next;
    });
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(900px, 92vw)", maxHeight: "82vh",
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: 10, display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}>
        {/* ── Header ───────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-hover)", flexShrink: 0,
        }}>
          <IconWarning size={16} style={{ color: issues.length > 0 ? "var(--warning)" : "var(--success)" }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>
            {t("qa.title")}
          </span>
          <span style={{
            marginLeft: 4, fontSize: 11, fontWeight: 700,
            padding: "1px 8px", borderRadius: 10,
            background: issues.length > 0
              ? "color-mix(in srgb, var(--danger) 15%, transparent)"
              : "color-mix(in srgb, var(--success) 15%, transparent)",
            color: issues.length > 0 ? "var(--danger)" : "var(--success)",
            border: issues.length > 0
              ? "1px solid color-mix(in srgb, var(--danger) 40%, transparent)"
              : "1px solid color-mix(in srgb, var(--success) 40%, transparent)",
          }}>
            {issues.length > 0
              ? t("qa.issue_count", { count: issues.length })
              : t("qa.no_issues_badge")}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, padding: 0,
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 5, cursor: "pointer", color: "var(--text-3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* ── Filter chips ─────────────────────────────────── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 5,
          padding: "10px 18px",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          {ALL_RULES.map(rule => {
            const count   = countByRule[rule] ?? 0;
            const active  = activeRules.has(rule);
            const color   = RULE_COLORS[rule];
            return (
              <button
                key={rule}
                onClick={() => toggleRule(rule)}
                style={{
                  height: 24, padding: "0 10px",
                  borderRadius: 12,
                  border: `1px solid ${active ? color : "var(--border)"}`,
                  background: active
                    ? `color-mix(in srgb, ${color} 18%, transparent)`
                    : "transparent",
                  color: active ? color : "var(--text-3)",
                  cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400,
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all 0.1s",
                  opacity: count === 0 ? 0.45 : 1,
                }}
              >
                {t(`qa.rule_${rule}`)}
                {count > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, padding: "0 4px",
                    borderRadius: 8, fontSize: 10, fontWeight: 700,
                    background: active ? color : "var(--border)",
                    color: active ? "#fff" : "var(--text-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Results table ─────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {issues.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: 40, gap: 12,
              color: "var(--text-3)",
            }}>
              <IconCheck size={32} style={{ color: "var(--success)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}>
                {t("qa.no_issues")}
              </span>
              <span style={{ fontSize: 12, fontStyle: "italic" }}>
                {t("qa.no_issues_desc")}
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>
              {t("qa.all_filtered")}
            </div>
          ) : (
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontSize: 12,
            }}>
              <thead>
                <tr style={{ background: "var(--bg-hover)", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={TH}>#</th>
                  <th style={TH}>{t("qa.col_rule")}</th>
                  <th style={TH}>{t("qa.col_type")}</th>
                  <th style={{ ...TH, width: "35%" }}>{t("qa.col_original")}</th>
                  <th style={{ ...TH, width: "35%" }}>{t("qa.col_translated")}</th>
                  <th style={TH}>{t("qa.col_detail")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue, i) => (
                  <IssueRow
                    key={i}
                    issue={issue}
                    onNavigate={() => { onClose(); onNavigate(issue.entryIdx); }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div style={{
          padding: "8px 18px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-hover)",
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", flex: 1 }}>
            {t("qa.hint")}
          </span>
          <button
            onClick={onClose}
            style={{
              height: 28, padding: "0 16px",
              background: "var(--bg-primary)", color: "var(--text-1)",
              border: "1px solid var(--border)", borderRadius: 5,
              cursor: "pointer", fontSize: 12,
            }}
          >
            {t("qa.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "6px 12px", textAlign: "left",
  fontWeight: 600, fontSize: 11,
  color: "var(--text-2)", borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

function IssueRow({ issue, onNavigate }: { issue: QaIssue; onNavigate: () => void }) {
  const [hovered, setHovered] = useState(false);
  const color = RULE_COLORS[issue.rule];
  const { t } = useTranslation();

  return (
    <tr
      onClick={onNavigate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--bg-hover)" : "transparent",
        cursor: "pointer",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <td style={{ ...TD, color: "var(--text-3)", fontFamily: "monospace", fontWeight: 600 }}>
        {issue.entryIdx + 1}
      </td>
      <td style={TD}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
          whiteSpace: "nowrap",
        }}>
          {t(`qa.rule_${issue.rule}`)}
        </span>
      </td>
      <td style={TD}>
        <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--bg-primary)", padding: "1px 5px", borderRadius: 3 }}>
          {issue.record_type}{issue.sub_type ? ` · ${issue.sub_type}` : ""}
        </span>
      </td>
      <td style={{ ...TD, maxWidth: 0 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }}>
          {issue.original}
        </span>
      </td>
      <td style={{ ...TD, maxWidth: 0 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-1)" }}>
          {issue.translated || <em style={{ color: "var(--text-3)" }}>—</em>}
        </span>
      </td>
      <td style={{ ...TD, color: "var(--text-3)", fontStyle: issue.detail ? "normal" : "italic" }}>
        {issue.detail || "—"}
      </td>
    </tr>
  );
}

const TD: React.CSSProperties = {
  padding: "6px 12px",
  verticalAlign: "middle",
};
