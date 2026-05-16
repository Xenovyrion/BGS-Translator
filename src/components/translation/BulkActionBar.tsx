import { useTranslation } from "react-i18next";
import type { EntryStatus } from "../../types";
import { IconRefresh, IconSearch, IconReplace } from "../../icons";

interface Props {
  count:                  number;
  totalVisible:           number;
  onSetStatus:            (status: EntryStatus) => void;
  onAddToPersonalDb?:     () => void;   // write selected → personal DB
  onApplyFromPersonalDb?: () => void;   // read personal DB → fill selected
  personalDbName?:        string;       // displayed in both buttons
  onClear:                () => void;
  onSelectAll?:           () => void;
  onDeeplBatch?:          () => void;
  deeplBatchLoading?:     boolean;
  /** Fuzzy: apply suggestions to current selection */
  onApplyFuzzy?:          () => void;
  /** Number of fuzzy matches available in the whole set (shows button only when > 0) */
  fuzzyMatchCount?:       number;
}

export default function BulkActionBar({
  count, totalVisible,
  onSetStatus, onAddToPersonalDb, onApplyFromPersonalDb, personalDbName,
  onClear, onSelectAll,
  onDeeplBatch, deeplBatchLoading,
  onApplyFuzzy, fuzzyMatchCount = 0,
}: Props) {
  const { t } = useTranslation();

  if (count < 2) return null;

  const allSelected = totalVisible > 0 && count === totalVisible;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 12px",
      background: "rgba(99,102,241,0.12)",
      borderBottom: "1px solid rgba(99,102,241,0.3)",
      flexShrink: 0,
    }}>
      {/* Selection counter */}
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
        {t("bulk.selected", { count })}
      </span>

      <div style={{ width: 1, height: 16, background: "rgba(99,102,241,0.4)", flexShrink: 0 }} />

      {/* Status actions */}
      <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{t("bulk.bulk_actions")}</span>
      <BulkBtn label={t("bulk.validate")} color="#22c55e" onClick={() => onSetStatus("validated")} />
      <BulkBtn label={t("bulk.pending")}  color="#f59e0b" onClick={() => onSetStatus("pending")} />
      <BulkBtn label={t("bulk.ignore")}   color="#64748b" onClick={() => onSetStatus("ignored")} />
      <BulkBtn label={t("bulk.reset")}    color="#ef4444" onClick={() => onSetStatus("untranslated")} />

      {/* Personal DB — read (apply) + write (add) */}
      {(onApplyFromPersonalDb || onAddToPersonalDb) && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(99,102,241,0.4)", flexShrink: 0 }} />
          {onApplyFromPersonalDb && (
            <BulkBtn
              label={personalDbName
                ? t("bulk.apply_personal_db_named", { name: personalDbName })
                : t("bulk.apply_personal_db")}
              color="#0ea5e9"
              onClick={onApplyFromPersonalDb}
            />
          )}
          {onAddToPersonalDb && (
            <BulkBtn
              label={personalDbName
                ? t("bulk.add_personal_db_named", { name: personalDbName })
                : t("bulk.add_personal_db")}
              color="#6366f1"
              onClick={onAddToPersonalDb}
            />
          )}
        </>
      )}

      {/* DeepL batch */}
      {onDeeplBatch && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(99,102,241,0.4)", flexShrink: 0 }} />
          <button
            onClick={deeplBatchLoading ? undefined : onDeeplBatch}
            disabled={deeplBatchLoading}
            title={t("deepl.batch_title")}
            style={{
              height: 26, padding: "0 10px",
              borderRadius: 5, boxSizing: "border-box",
              border: "1px solid #2563eb",
              cursor: deeplBatchLoading ? "default" : "pointer",
              fontSize: 11, fontWeight: 600,
              background: deeplBatchLoading ? "rgba(37,99,235,0.15)" : "#2563eb",
              color: deeplBatchLoading ? "#2563eb" : "#fff",
              display: "flex", alignItems: "center", gap: 5,
              opacity: deeplBatchLoading ? 0.7 : 1,
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            {deeplBatchLoading
              ? <><IconRefresh size={12} />{t("deepl.batch_loading")}</>
              : <><IconReplace size={12} />{t("deepl.batch_btn", { count })}</>
            }
          </button>
        </>
      )}

      {/* Fuzzy apply */}
      {onApplyFuzzy && fuzzyMatchCount > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: "rgba(99,102,241,0.4)", flexShrink: 0 }} />
          <button
            onClick={onApplyFuzzy}
            title={t("bulk.apply_fuzzy_title")}
            style={{
              height: 26, padding: "0 10px",
              borderRadius: 5, boxSizing: "border-box",
              border: "1px solid #f97316",
              cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              background: "#f97316",
              color: "#fff",
              display: "flex", alignItems: "center", gap: 5,
              flexShrink: 0,
            }}
          >
            <IconSearch size={12} /> {t("bulk.apply_fuzzy")}
          </button>
        </>
      )}

      {/* Right-side: select-all / deselect-all */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        {onSelectAll && !allSelected && (
          <button
            onClick={onSelectAll}
            style={{
              height: 26, padding: "0 10px", boxSizing: "border-box",
              borderRadius: 5, cursor: "pointer", fontSize: 11,
              background: "var(--bg-hover)",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            {t("filter.select_all_title", { count: totalVisible })}
          </button>
        )}
        <button
          onClick={onClear}
          style={{
            height: 26, padding: "0 10px", boxSizing: "border-box",
            borderRadius: 5, cursor: "pointer", fontSize: 11,
            background: "transparent",
            color: "var(--text-3)",
            border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {t("bulk.deselect_all")}
        </button>
      </div>
    </div>
  );
}

function BulkBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 26, padding: "0 10px",
        borderRadius: 5, border: "none", boxSizing: "border-box",
        cursor: "pointer", fontSize: 11, fontWeight: 600,
        background: color, color: "#fff",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
