import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";

interface Props {
  isOpen:           boolean;
  sourceFile:       string;
  defaultOutputDir: string;
  onClose:          () => void;
  onConfirm: (opts: {
    dbName:       string;
    game:         string;
    langFrom:     string;
    langTo:       string;
    outputFolder: string;
    readOnly:     boolean;
  }) => void;
}

const GAME_OPTIONS = [
  "Starfield",
  "Skyrim SE",
  "Fallout 4",
  "Oblivion",
  "Morrowind",
  "Other",
];

const LANGUAGE_KEYS = [
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Polish",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
];

function filenameStem(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const dot   = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export default function ConvertToBgtModal({ isOpen, sourceFile, defaultOutputDir, onClose, onConfirm }: Props) {
  const { t } = useTranslation();

  const [dbName,        setDbName]        = useState<string>(() => filenameStem(sourceFile));
  const [game,          setGame]          = useState("Starfield");
  const [langFrom,      setLangFrom]      = useState("English");
  const [langTo,        setLangTo]        = useState("French");
  const [outputFolder,  setOutputFolder]  = useState<string>(defaultOutputDir);
  const [readOnly,      setReadOnly]      = useState<boolean>(true);

  // Sync defaultOutputDir → outputFolder whenever the modal opens (prop changes)
  useEffect(() => {
    if (isOpen && defaultOutputDir) {
      setOutputFolder(defaultOutputDir);
    }
  }, [isOpen, defaultOutputDir]);

  // Sync dbName when a new source file is selected
  useEffect(() => {
    if (isOpen && sourceFile) {
      setDbName(filenameStem(sourceFile));
    }
  }, [isOpen, sourceFile]);

  if (!isOpen) return null;

  const stem = filenameStem(sourceFile);

  const handleConfirm = () => {
    const name = dbName.trim() || stem;
    onConfirm({ dbName: name, game, langFrom, langTo, outputFolder, readOnly });
  };

  const handleBrowse = async () => {
    const selected = await open({ directory: true, title: t("convert_bgt.browse_title") });
    if (selected && typeof selected === "string") {
      setOutputFolder(selected);
    }
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
    minWidth: 420,
    maxWidth: 540,
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

  const radioGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: 12,
    marginTop: 2,
  };

  const radioLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-2)",
    cursor: "pointer",
    flex: 1,
    background: "var(--bg-hover)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    padding: "8px 12px",
  };

  const radioLabelActiveStyle: React.CSSProperties = {
    ...radioLabelStyle,
    border: "1px solid var(--accent)",
    color: "var(--text-1)",
  };

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
          {t("convert_bgt.title")}
        </h2>

        {/* Source file */}
        <div>
          <span style={labelStyle}>{t("convert_bgt.source")}</span>
          <div style={{ ...inputStyle, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sourceFile || "—"}
          </div>
        </div>

        {/* Database name */}
        <div>
          <label style={labelStyle}>{t("convert_bgt.db_name")}</label>
          <input
            style={inputStyle}
            value={dbName}
            onChange={(e) => setDbName(e.target.value)}
            placeholder={stem}
          />
        </div>

        {/* Game */}
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

        {/* Languages */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("convert_bgt.lang_from")}</label>
            <select
              style={selectStyle}
              value={langFrom}
              onChange={(e) => setLangFrom(e.target.value)}
            >
              {LANGUAGE_KEYS.map((lang) => (
                <option key={lang} value={lang}>{t(`convert_bgt.lang.${lang.toLowerCase()}`)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t("convert_bgt.lang_to")}</label>
            <select
              style={selectStyle}
              value={langTo}
              onChange={(e) => setLangTo(e.target.value)}
            >
              {LANGUAGE_KEYS.map((lang) => (
                <option key={lang} value={lang}>{t(`convert_bgt.lang.${lang.toLowerCase()}`)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Output folder */}
        <div>
          <label style={labelStyle}>{t("convert_bgt.output_folder")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={outputFolder}
              onChange={(e) => setOutputFolder(e.target.value)}
              placeholder={defaultOutputDir || t("convert_bgt.output_folder_placeholder")}
            />
            <button
              onClick={handleBrowse}
              style={{
                padding: "6px 12px",
                background: "var(--bg-hover)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 4,
                color: "var(--text-2)",
                fontSize: 11,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("convert_bgt.browse")}
            </button>
          </div>
        </div>

        {/* BDD type toggle */}
        <div>
          <label style={labelStyle}>{t("convert_bgt.db_type")}</label>
          <div style={radioGroupStyle}>
            <label style={readOnly ? radioLabelActiveStyle : radioLabelStyle}>
              <input
                type="radio"
                name="bgt-type"
                checked={readOnly}
                onChange={() => setReadOnly(true)}
                style={{ margin: 0 }}
              />
              {t("convert_bgt.db_type_default")}
            </label>
            <label style={!readOnly ? radioLabelActiveStyle : radioLabelStyle}>
              <input
                type="radio"
                name="bgt-type"
                checked={!readOnly}
                onChange={() => setReadOnly(false)}
                style={{ margin: 0 }}
              />
              {t("convert_bgt.db_type_custom")}
            </label>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-3)" }}>
            {readOnly ? t("convert_bgt.db_type_default_hint") : t("convert_bgt.db_type_custom_hint")}
          </p>
        </div>

        {/* Actions */}
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
