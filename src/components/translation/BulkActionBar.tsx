import { useTranslation } from "react-i18next";
import type { EntryStatus } from "../../types";

interface Props {
  count:       number;
  onSetStatus: (status: EntryStatus) => void;
  onAddToDb?:  () => void;
  onClear:     () => void;
}

export default function BulkActionBar({ count, onSetStatus, onAddToDb, onClear }: Props) {
  const { t } = useTranslation();

  if (count < 2) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 12px",
      background: "rgba(99,102,241,0.12)",
      borderBottom: "1px solid rgba(99,102,241,0.3)",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginRight: 4 }}>
        {t("bulk.selected", { count })}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t("bulk.bulk_actions")}</span>
      <BulkBtn label={t("bulk.validate")} color="#22c55e" onClick={() => onSetStatus("validated")} />
      <BulkBtn label={t("bulk.pending")}  color="#f59e0b" onClick={() => onSetStatus("pending")} />
      <BulkBtn label={t("bulk.ignore")}   color="#64748b" onClick={() => onSetStatus("ignored")} />
      <BulkBtn label={t("bulk.reset")}    color="#ef4444" onClick={() => onSetStatus("untranslated")} />
      {onAddToDb && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(99,102,241,0.4)", margin: "0 2px" }} />
          <BulkBtn label={t("bulk.add_db")} color="#6366f1" onClick={onAddToDb} />
        </>
      )}
      <button
        onClick={onClear}
        style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
      >
        {t("bulk.deselect_all")}
      </button>
    </div>
  );
}

function BulkBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px", borderRadius: 5, border: "none",
        cursor: "pointer", fontSize: 11, fontWeight: 600,
        background: color, color: "#fff",
      }}
    >
      {label}
    </button>
  );
}
