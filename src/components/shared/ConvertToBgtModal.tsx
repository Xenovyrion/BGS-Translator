import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  isOpen:     boolean;
  sourceFile: string;
  onClose:    () => void;
  onConfirm:  (opts: { dbName: string; game: string; langFrom: string; langTo: string }) => void;
}

const GAME_OPTIONS = [
  "Starfield",
  "Skyrim SE",
  "Fallout 4",
  "Oblivion",
  "Morrowind",
  "Other",
];

function filenameStem(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const dot   = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export default function ConvertToBgtModal({ isOpen, sourceFile, onClose, onConfirm }: Props) {
  const { t } = useTranslation();

  const [dbName,   setDbName]   = useState<string>(() => filenameStem(sourceFile));
  const [game,     setGame]     = useState("Starfield");
  const [langFrom, setLangFrom] = useState("English");
  const [langTo,   setLangTo]   = useState("French");

  if (!isOpen) return null;

  const stem = filenameStem(sourceFile);

  const handleConfirm = () => {
    const name = dbName.trim() || stem;
    onConfirm({ dbName: name, game, langFrom, langTo });
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "24px 28px",
    minWidth: 380,
    maxWidth: 480,
    boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-3)",
    marginBottom: 4,
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-hover)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    padding: "6px 10px",
    color: "var(--text-1)",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: "pointer",
  };

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
          {t("convert_bgt.title")}
        </h2>

        <div>
          <span style={labelStyle}>{t("convert_bgt.source")}</span>
          <div style={{ ...inputStyle, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sourceFile || "—"}
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t("convert_bgt.db_name")}</label>
          <input
            style={inputStyle}
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            placeholder={stem}
          />
        </div>

        <div>
          <label style={labelStyle}>{t("convert_bgt.game")}</label>
          <select
            style={selectStyle}
            value={game}
            onChange={(e) => setGame(e.target.value)}
          >
            {GAME_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("convert_bgt.lang_from")}</label>
            <input
              style={inputStyle}
              value={langFrom}
              onChange={(e) => setLangFrom(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("convert_bgt.lang_to")}</label>
            <input
              style={inputStyle}
              value={langTo}
              onChange={(e) => setLangTo(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 18px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 5,
              color: "var(--text-2)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("convert_bgt.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "7px 18px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 5,
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t("convert_bgt.convert")}
          </button>
        </div>
      </div>
    </div>
  );
}
