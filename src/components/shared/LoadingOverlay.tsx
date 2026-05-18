import { useTranslation } from "react-i18next";

const STATUS_LABELS: Record<string, string> = {
  loading_strings:  "Extraction des archives…",
  parsing_records:  "Lecture des enregistrements…",
};

interface Props {
  /** True while the backend is loading (status phase OR streaming phase). */
  loading:         boolean;
  /** Backend status key emitted before chunks start. */
  loadingStatus?:  string | null;
  /** Number of entries received so far (streaming phase). */
  loadingProgress?: number | null;
}

/**
 * Full-area centered overlay displayed while a plugin is loading.
 *
 * - Status phase (archive extraction / record parsing): large spinner + label.
 * - Streaming phase (chunks arriving): smaller spinner + entry counter.
 * - Hidden when not loading.
 */
export default function LoadingOverlay({ loading, loadingStatus, loadingProgress }: Props) {
  const { t } = useTranslation();

  if (!loading) return null;

  const isStreaming = loadingProgress != null && loadingProgress > 0;

  const label = isStreaming
    ? t("toolbar.loading_entries", {
        defaultValue: "{{count}} entrées chargées…",
        count: loadingProgress!.toLocaleString(),
      })
    : loadingStatus
      ? (STATUS_LABELS[loadingStatus] ?? loadingStatus)
      : t("toolbar.loading", { defaultValue: "Chargement…" });

  return (
    <div
      style={{
        position:      "absolute",
        inset:         0,
        zIndex:        200,
        pointerEvents: "all",
      }}
    >
      {/* ── Backdrop: uses a separate div so opacity doesn't affect card text ── */}
      <div
        style={{
          position:       "absolute",
          inset:          0,
          background:     "var(--bg-primary)",
          opacity:        0.75,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* ── Centered content ─────────────────────────────────────────────────── */}
      <div
        style={{
          position:       "absolute",
          inset:          0,
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            20,
        }}
      >
        {/* Spinner */}
        <div className="bgs-spinner" style={isStreaming ? { width: 32, height: 32 } : undefined} />

        {/* Label card */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            gap:           6,
            background:    "var(--bg-card)",
            border:        "1px solid var(--border-light)",
            borderRadius:  10,
            padding:       "12px 24px",
            boxShadow:     "0 8px 32px rgba(0,0,0,0.35)",
            minWidth:      200,
            textAlign:     "center",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
            {label}
          </span>
          {isStreaming && (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              {t("toolbar.loading_wait", { defaultValue: "Veuillez patienter…" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
