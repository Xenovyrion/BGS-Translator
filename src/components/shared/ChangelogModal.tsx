import { useState, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { IconClose } from "../../icons";

// GitHub repository URL — update this once the repo is public.
// On error (404, network), falls back to "No release notes available."
const GITHUB_RELEASES_URL = "https://api.github.com/repos/OWNER/BGSTranslator/releases?per_page=20";

interface Release {
  tag_name:     string;
  name:         string;
  body:         string;
  published_at: string;
}

interface Props {
  appVersion: string;
  onClose:    () => void;
}

export default function ChangelogModal({ appVersion, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [releases,    setReleases]    = useState<Release[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  useEffect(() => {
    fetch(GITHUB_RELEASES_URL)
      .then((res) => res.ok ? res.json() : Promise.reject(res.status))
      .then((data: Release[]) => {
        setReleases(data);
        const current = data.find((r) => r.tag_name === `v${appVersion}` || r.tag_name === appVersion);
        setExpandedTag(current?.tag_name ?? data[0]?.tag_name ?? null);
      })
      .catch(() => setError(t("changelog.load_error")))
      .finally(() => setLoading(false));
  }, [appVersion]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, width: 660, height: 760, display: "flex", flexDirection: "column", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ padding: "18px 24px 15px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{t("changelog.title")}</h3>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-3)" }}>
              {t("changelog.subtitle")} <strong style={{ color: "var(--accent)" }}>v{appVersion}</strong>
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}><IconClose size={18} /></button>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 48 }}>
              <SpinIcon />
            </div>
          )}
          {error && (
            <p style={{ padding: "28px 24px", fontSize: 12, color: "var(--text-3)", textAlign: "center", margin: 0, whiteSpace: "pre-line" }}>{error}</p>
          )}
          {!loading && !error && releases.length === 0 && (
            <p style={{ padding: "28px 24px", fontSize: 12, color: "var(--text-3)", textAlign: "center", margin: 0 }}>{t("changelog.empty")}</p>
          )}

          {releases.map((release) => {
            const isExpanded = expandedTag === release.tag_name;
            const isCurrent  = release.tag_name === `v${appVersion}` || release.tag_name === appVersion;
            const tag         = release.tag_name;
            const releaseName = release.name && release.name !== tag ? release.name : null;

            return (
              <div
                key={tag}
                style={{
                  borderBottom: "1px solid var(--border)",
                  borderLeft: isCurrent ? "3px solid var(--accent)" : "3px solid transparent",
                  background: isCurrent ? "rgba(99,102,241,0.04)" : "transparent",
                }}
              >
                {/* Release row */}
                <button
                  onClick={() => setExpandedTag(isExpanded ? null : tag)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "11px 20px 11px 21px", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <ChevronIcon expanded={isExpanded} />

                  <span style={{
                    fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                    color: isCurrent ? "var(--accent)" : "var(--accent)",
                    background: "var(--accent-dim)",
                    border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
                    borderRadius: 5, padding: "2px 7px", flexShrink: 0,
                  }}>
                    {tag}
                  </span>

                  {releaseName && (
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {releaseName}
                    </span>
                  )}
                  {!releaseName && <span style={{ flex: 1 }} />}

                  {isCurrent && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid var(--accent)", borderRadius: 5, padding: "2px 8px", flexShrink: 0, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {t("changelog.current_badge")}
                    </span>
                  )}

                  {release.published_at && (
                    <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                      {new Date(release.published_at).toLocaleDateString(i18n.language, { day: "2-digit", month: "long", year: "numeric" })}
                    </span>
                  )}
                </button>

                {/* Release body */}
                {isExpanded && (
                  <div style={{ padding: "4px 24px 20px 50px" }}>
                    {renderMarkdown(release.body?.trim() || t("changelog.fallback_body"))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ flexShrink: 0, color: "var(--text-3)", transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: "spin 1s linear infinite", color: "var(--text-3)" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const tokenRe = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRe);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} style={{ color: "var(--text-1)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          return (
            <span key={i} onClick={() => openUrl(link[2])}
              style={{ color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              {link[1]}
            </span>
          );
        }
        return part;
      })}
    </>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={key++} style={{ margin: "4px 0 10px", paddingLeft: 0, listStyle: "none" }}>
        {listItems.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, marginBottom: 3 }}>
            <span style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0, fontSize: 10 }}>●</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("## ")) {
      flushList();
      elements.push(
        <div key={key++} style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 8px", paddingBottom: 7, borderBottom: "1px solid rgba(99,102,241,0.25)" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{t.slice(3)}</span>
        </div>
      );
    } else if (t.startsWith("### ")) {
      flushList();
      elements.push(
        <p key={key++} style={{ margin: "10px 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
          {t.slice(4)}
        </p>
      );
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      listItems.push(t.slice(2));
    } else if (t === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={key++} style={{ margin: "4px 0", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.7 }}>
          {renderInline(t)}
        </p>
      );
    }
  }
  flushList();
  return <>{elements}</>;
}

import React from "react";
