import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

interface Props {
  version: string;
  notes?:  string;
  onDismiss: () => void;
}

export default function UpdateBanner({ version, notes, onDismiss }: Props) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await invoke("install_update");
    } catch (e) {
      setError(String(e));
      setInstalling(false);
    }
  };

  return (
    <div style={{
      margin: "6px 10px 2px",
      borderRadius: 10,
      border: "1px solid rgba(59,130,246,0.35)",
      background: "rgba(59,130,246,0.08)",
      padding: "10px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
            {t("update.available")}
          </div>
          <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>v{version}</div>
        </div>
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 14, padding: "2px 4px" }}>
          ✕
        </button>
      </div>

      {notes && (
        <div style={{ fontSize: 10, color: "var(--text-2)", maxHeight: 52, overflowY: "auto", whiteSpace: "pre-wrap", borderTop: "1px solid rgba(59,130,246,0.18)", paddingTop: 6 }}>
          {notes}
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: "var(--danger)" }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={onDismiss} disabled={installing}>{t("update.later")}</button>
        <button className="btn-primary" onClick={handleInstall} disabled={installing}>
          {installing ? t("update.installing") : t("update.install")}
        </button>
      </div>
    </div>
  );
}
