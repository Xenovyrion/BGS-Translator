import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { IconClose } from "../../icons";

interface Props {
  version: string;
  notes?:  string;
  onClose: () => void;
}

export default function UpdateModal({ version, notes, onClose }: Props) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await invoke("install_update");
      // The app restarts on the Rust side — this line is never reached
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, width: 560, maxHeight: 500, display: "flex", flexDirection: "column", boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11,
              background: "var(--accent-dim)", border: "1px solid var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <DownloadCloudIcon />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
                {t("update.available")}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>BGS Translator</span>
                <span style={{
                  fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                  color: "var(--accent)", background: "var(--accent-dim)",
                  border: "1px solid var(--accent)", borderRadius: 5,
                  padding: "1px 8px", letterSpacing: "0.03em",
                }}>
                  v{version}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}>
            <IconClose size={18} />
          </button>
        </div>

        {/* ── "What's new" subtitle ── */}
        {notes && (
          <div style={{ padding: "14px 24px 0", flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t("update.whats_new")}
            </p>
          </div>
        )}

        {/* ── Corps ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 24px 12px", minHeight: 0 }}>
          {notes
            ? <pre style={{ margin: 0, fontSize: 12, color: "var(--text-2)", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65 }}>{notes.trim()}</pre>
            : <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>{t("update.no_notes")}</p>
          }
        </div>

        {/* ── Erreur ── */}
        {error && (
          <div style={{ padding: "0 24px 8px", flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 11, color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "8px 12px" }}>
              {error}
            </p>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ padding: "12px 24px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={onClose}
            disabled={installing}
            style={{ padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500, background: "var(--bg-hover)", color: "var(--text-1)", border: "1px solid var(--border)" }}
          >
            {t("update.later")}
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{ padding: "8px 18px", borderRadius: 7, cursor: installing ? "wait" : "pointer", fontSize: 12, fontWeight: 600, background: "var(--accent)", color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 6 }}
          >
            {installing ? <><SpinIcon /> {t("update.installing")}</> : <><DownloadIcon /> {t("update.install")}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function DownloadCloudIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: "spin 1s linear infinite" }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
