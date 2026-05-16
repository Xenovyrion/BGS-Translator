import { useTranslation } from "react-i18next";
import { IconSave } from "../../icons";

const fmtN = (n: number) => n.toLocaleString("fr-FR");

interface Props {
  total:          number;
  untranslated:   number;
  pending:        number;
  validated:      number;
  ignored:        number;
  filtered:       number;
  appVersion:     string;
  lastAutosave?:  Date | null;
  onChangelog:    () => void;
}

export default function StatusBar({
  total, untranslated, pending, validated, ignored,
  filtered,
  appVersion, lastAutosave, onChangelog,
}: Props) {
  const { t } = useTranslation();

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "0 10px",
      borderTop: "2px solid rgba(0,0,0,0.35)",
      background: "var(--bg-statusbar)",
      fontSize: 11, color: "var(--text-3)",
      userSelect: "none", flexShrink: 0,
      height: 24, gap: 0,
    }}>
      {/* ── Version (gauche) ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginRight: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          BGS Translator v{appVersion}
        </span>
        <span style={{ width: 1, height: 12, background: "var(--border)", display: "inline-block" }} />
        <button
          onClick={onChangelog}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "var(--text-3)",
            padding: 0, lineHeight: 1,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.textDecoration = "none"; }}
        >
          {t("statusbar.changelog")}
        </button>
      </div>

      <div style={{ width: 1, height: 12, background: "var(--border)", marginRight: 14, flexShrink: 0 }} />

      {/* ── Statistiques ─────────────────────────────────────── */}
      <Chip label={t("statusbar.total")}        count={total}        color="var(--text-3)" />
      <Sep />
      <Chip label={t("statusbar.untranslated")} count={untranslated} color="#ef4444" />
      <Sep />
      <Chip label={t("statusbar.pending")}      count={pending}      color="#f59e0b" />
      <Sep />
      <Chip label={t("statusbar.validated")}    count={validated}    color="#22c55e" />
      <Sep />
      <Chip label={t("statusbar.ignored")}      count={ignored}      color="#64748b" />

      {/* ── Droite ───────────────────────────────────────────── */}
      <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
        {lastAutosave && (
          <span style={{ fontStyle: "italic", opacity: 0.7, display: "flex", alignItems: "center", gap: 3 }}
            title={lastAutosave.toLocaleString()}>
            <IconSave size={11} /> {lastAutosave.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {filtered !== total && (
          <span style={{ fontStyle: "italic" }}>
            {t("statusbar.filtered", { count: fmtN(filtered) })}
          </span>
        )}
      </span>
    </div>
  );
}

function Sep() {
  return <span style={{ margin: "0 8px", color: "var(--border)" }}>·</span>;
}

function Chip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      <span>{label} : <strong style={{ color: "var(--text-2)" }}>{fmtN(count)}</strong></span>
    </span>
  );
}
