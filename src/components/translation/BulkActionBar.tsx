import { useTranslation } from "react-i18next";
import type { EntryStatus } from "../../types";
import { getProviderStyle } from "../../types";
import { IconRefresh, IconSearch, IconExternalLink } from "../../icons";
import { ProviderLetterBadge } from "../shared/ProviderBadge";

export interface TranslationBatch {
  id:         string;
  name:       string;
  loading:    boolean;
  isLauncher?: boolean;
  onBatch:    () => void;
}

interface Props {
  count:                  number;
  totalVisible:           number;
  onSetStatus:            (status: EntryStatus) => void;
  onAddToPersonalDb?:     () => void;
  onApplyFromPersonalDb?: () => void;
  personalDbName?:        string;
  onClear:                () => void;
  onSelectAll?:           () => void;
  translationBatches?:    TranslationBatch[];
  onApplyFuzzy?:          () => void;
  fuzzyMatchCount?:       number;
}

export default function BulkActionBar({
  count, totalVisible,
  onSetStatus, onAddToPersonalDb, onApplyFromPersonalDb, personalDbName,
  onClear, onSelectAll,
  translationBatches,
  onApplyFuzzy, fuzzyMatchCount = 0,
}: Props) {
  const { t } = useTranslation();

  if (count < 2) return null;

  const allSelected   = totalVisible > 0 && count === totalVisible;
  const activeBatches = translationBatches?.filter(() => true) ?? [];
  const hasBatches    = activeBatches.length > 0;

  const Sep = () => (
    <div style={{ width: 1, height: 20, background: "var(--accent-alt-border)", flexShrink: 0, marginLeft: 4, marginRight: 4 }} />
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 10px",
      background: "var(--accent-alt-dim)",
      borderBottom: "1px solid var(--accent-alt-border)",
      flexShrink: 0,
    }}>
      {/* Selection counter */}
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", flexShrink: 0, marginRight: 2 }}>
        {t("bulk.selected", { count })}
      </span>

      <Sep />

      {/* Status actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("bulk.bulk_actions")}</span>
        <BulkBtn label={t("bulk.validate")} color="var(--status-validated)"    onClick={() => onSetStatus("validated")} />
        <BulkBtn label={t("bulk.pending")}  color="var(--status-pending)"      onClick={() => onSetStatus("pending")} />
        <BulkBtn label={t("bulk.ignore")}   color="var(--status-ignored)"      onClick={() => onSetStatus("ignored")} />
        <BulkBtn label={t("bulk.reset")}    color="var(--status-untranslated)" onClick={() => onSetStatus("untranslated")} />
      </div>

      {/* Personal DB */}
      {(onApplyFromPersonalDb || onAddToPersonalDb) && (
        <>
          <Sep />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {onApplyFromPersonalDb && (
              <BulkBtn
                label={personalDbName
                  ? t("bulk.apply_personal_db_named", { name: personalDbName })
                  : t("bulk.apply_personal_db")}
                color="var(--info)"
                onClick={onApplyFromPersonalDb}
              />
            )}
            {onAddToPersonalDb && (
              <BulkBtn
                label={personalDbName
                  ? t("bulk.add_personal_db_named", { name: personalDbName })
                  : t("bulk.add_personal_db")}
                color="var(--accent-alt)"
                onClick={onAddToPersonalDb}
              />
            )}
          </div>
        </>
      )}

      {/* Translation batch buttons */}
      {hasBatches && (
        <>
          <Sep />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {activeBatches.map(batch => {
              const ps = getProviderStyle(batch.id);
              return (
                <button
                  key={batch.id}
                  onClick={batch.loading ? undefined : batch.onBatch}
                  disabled={batch.loading}
                  title={batch.isLauncher
                    ? t("providers.browser_batch_title", { name: batch.name, count })
                    : t("providers.batch_title",         { name: batch.name, count })}
                  style={{
                    height: 26, padding: "0 10px",
                    borderRadius: 5, boxSizing: "border-box",
                    border: `1px solid ${ps.border}`,
                    cursor: batch.loading ? "default" : "pointer",
                    fontSize: 11, fontWeight: 600,
                    background: batch.loading ? ps.bgIdle : batch.isLauncher ? ps.bgIdle : ps.bgActive,
                    color:      batch.loading ? ps.color  : batch.isLauncher ? ps.color  : "#fff",
                    display: "flex", alignItems: "center", gap: 5,
                    opacity: batch.loading ? 0.7 : 1,
                    transition: "all 0.15s",
                    flexShrink: 0, whiteSpace: "nowrap",
                    maxWidth: 200, overflow: "hidden",
                  }}
                >
                  {batch.loading
                    ? <><IconRefresh size={12} />{t("providers.batch_loading")}</>
                    : batch.isLauncher
                      ? <><IconExternalLink size={12} />{batch.name} ({count})</>
                      : <><ProviderLetterBadge letter={ps.letter} color="#fff" bgColor="rgba(255,255,255,0.25)" />{batch.name} ({count})</>
                  }
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Fuzzy apply */}
      {onApplyFuzzy && fuzzyMatchCount > 0 && (
        <>
          <Sep />
          <button
            onClick={onApplyFuzzy}
            title={t("bulk.apply_fuzzy_title")}
            style={{
              height: 26, padding: "0 10px",
              borderRadius: 5, boxSizing: "border-box",
              border: "1px solid var(--fuzzy-low)",
              cursor: "pointer",
              fontSize: 11, fontWeight: 600,
              background: "var(--fuzzy-low)",
              color: "#fff",
              display: "flex", alignItems: "center", gap: 5,
              flexShrink: 0,
            }}
          >
            <IconSearch size={12} /> {t("bulk.apply_fuzzy")}
          </button>
        </>
      )}

      {/* Right-side */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        {onSelectAll && !allSelected && (
          <button
            onClick={onSelectAll}
            style={{
              height: 26, padding: "0 10px", boxSizing: "border-box",
              borderRadius: 5, cursor: "pointer", fontSize: 11,
              background: "var(--bg-hover)", color: "var(--text-2)",
              border: "1px solid var(--border)", flexShrink: 0,
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
            background: "transparent", color: "var(--text-3)",
            border: "1px solid var(--border)", flexShrink: 0,
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
