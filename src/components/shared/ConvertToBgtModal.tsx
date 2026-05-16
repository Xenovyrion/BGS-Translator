import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIN_W = 530;

const GAME_OPTIONS = [
  "Starfield", "Skyrim SE", "Fallout 4",
  "Oblivion", "Morrowind", "Other",
];

const LANGUAGE_KEYS = [
  "English", "French", "German", "Spanish", "Italian",
  "Polish", "Russian", "Chinese", "Japanese", "Korean",
];

type OutputFormat = "bgt" | "bgtx";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ConvertOpts {
  sourcePath:  string;
  outputPath:  string;
  dbName:      string;
  game:        string;
  langFrom:    string;
  langTo:      string;
  readOnly:    boolean;
  format:      OutputFormat;
}

interface Props {
  defaultOutputDir: string;
  onClose:          () => void;
  /** Called on "Convert". Should resolve on success, throw on error. */
  onConvert:        (opts: ConvertOpts) => Promise<{ entryCount: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filenameStem(p: string): string {
  const base = p.replace(/\\/g, "/").split("/").pop() ?? p;
  const dot  = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function fileExt(p: string): string {
  return (p.replace(/\\/g, "/").split("/").pop()?.split(".").pop() ?? "").toLowerCase();
}

const EXT_LABEL: Record<string, string> = {
  eet: "EET", bgt: "BGT v2", bgtx: "BGTX",
  csv: "CSV", tsv: "TSV", xml: "XML",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConvertToBgtModal({ defaultOutputDir, onClose, onConvert }: Props) {
  const { t } = useTranslation();

  const [sourcePath,    setSourcePath]    = useState("");
  const [outputFormat,  setOutputFormat]  = useState<OutputFormat>("bgt");
  const [dbName,        setDbName]        = useState("");
  const [game,          setGame]          = useState("Starfield");
  const [langFrom,      setLangFrom]      = useState("English");
  const [langTo,        setLangTo]        = useState("French");
  const [outputFolder,  setOutputFolder]  = useState(defaultOutputDir);
  const [readOnly,      setReadOnly]      = useState(true);
  const [converting,    setConverting]    = useState(false);
  const [lastResult,    setLastResult]    = useState<{ ok: true; count: number } | { ok: false; error: string } | null>(null);

  // ── Draggable ──────────────────────────────────────────────────────────────

  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth  - WIN_W) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - 560)   / 3)),
  }));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - WIN_W, dragRef.current.origX + e.clientX - dragRef.current.startX)),
        y: Math.max(0, Math.min(window.innerHeight - 60,   dragRef.current.origY + e.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // ── Sync props ─────────────────────────────────────────────────────────────

  useEffect(() => { if (defaultOutputDir) setOutputFolder(defaultOutputDir); }, [defaultOutputDir]);

  // Auto-fill name from source file
  useEffect(() => { if (sourcePath) setDbName(filenameStem(sourcePath)); }, [sourcePath]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleBrowseSource = async () => {
    const sel = await open({
      filters: [{ name: t("db_converter.source_filter_name"), extensions: ["eet", "bgt", "bgtx", "csv", "tsv", "xml"] }],
      title: t("db_converter.pick_source_title"),
      multiple: false,
    });
    if (sel && typeof sel === "string") { setSourcePath(sel); setLastResult(null); }
  };

  const handleBrowseOutput = async () => {
    const sel = await open({ directory: true, title: t("db_converter.pick_output_title") });
    if (sel && typeof sel === "string") setOutputFolder(sel);
  };

  const handleConvert = useCallback(async () => {
    if (!sourcePath || converting) return;
    const name   = dbName.trim() || filenameStem(sourcePath);
    const folder = outputFolder.replace(/\\/g, "/").replace(/\/$/, "");
    const ext    = outputFormat === "bgtx" ? ".bgtx" : ".bgt";
    const outputPath = (folder ? folder + "/" : "") + name + ext;

    setConverting(true);
    setLastResult(null);
    try {
      const { entryCount } = await onConvert({
        sourcePath, outputPath, dbName: name,
        game, langFrom, langTo, readOnly, format: outputFormat,
      });
      setLastResult({ ok: true, count: entryCount });
    } catch (e) {
      setLastResult({ ok: false, error: String(e) });
    } finally {
      setConverting(false);
    }
  }, [sourcePath, converting, dbName, outputFolder, outputFormat, game, langFrom, langTo, readOnly, onConvert]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const canConvert  = !!sourcePath && !converting;
  const srcExt      = fileExt(sourcePath);
  const srcFmtLabel = EXT_LABEL[srcExt] ?? srcExt.toUpperCase();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", left: pos.x, top: pos.y,
        width: WIN_W, zIndex: 1100,
        display: "flex", flexDirection: "column",
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* ── Title bar (draggable) ── */}
      <div
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest("button")) return;
          dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
        }}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px 8px",
          background: "var(--bg-card)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0, cursor: "grab",
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.4, pointerEvents: "none" }}>⠿</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", flex: 1, pointerEvents: "none" }}>
          {t("db_converter.title")}
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
        >✕</button>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, userSelect: "text" }}>

        {/* Source file */}
        <Field label={t("db_converter.source_label")}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              ...inputStyle, flex: 1,
              display: "flex", alignItems: "center", gap: 6,
              overflow: "hidden",
            }}>
              {sourcePath ? (
                <>
                  {srcExt && (
                    <span style={{
                      fontSize: 10, padding: "1px 5px", borderRadius: 3,
                      background: "rgba(99,102,241,0.2)", color: "var(--accent)",
                      fontWeight: 700, flexShrink: 0,
                    }}>{srcFmtLabel}</span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-1)" }}>
                    {sourcePath.replace(/\\/g, "/").split("/").pop()}
                  </span>
                </>
              ) : (
                <span style={{ color: "var(--text-3)", opacity: 0.5 }}>{t("db_converter.source_placeholder")}</span>
              )}
            </div>
            <BrowseBtn onClick={handleBrowseSource} label={t("db_converter.browse")} />
          </div>
        </Field>

        {/* Output format */}
        <Field label={t("db_converter.format_label")}>
          <div style={{ display: "flex", gap: 10 }}>
            {(["bgt", "bgtx"] as OutputFormat[]).map(fmt => (
              <label
                key={fmt}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8, flex: 1,
                  background: outputFormat === fmt ? "rgba(99,102,241,0.12)" : "var(--bg-hover)",
                  border: `1px solid ${outputFormat === fmt ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 6, padding: "8px 12px", cursor: "pointer",
                }}
              >
                <input
                  type="radio" name="db-fmt"
                  checked={outputFormat === fmt}
                  onChange={() => setOutputFormat(fmt)}
                  style={{ margin: "3px 0 0", accentColor: "var(--accent)", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
                    .{fmt} — {t(`db_converter.format_${fmt}_name`)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                    {t(`db_converter.format_${fmt}_hint`)}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </Field>

        {/* DB name */}
        <Field label={t("db_converter.name_label")}>
          <input
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const }}
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            placeholder={sourcePath ? filenameStem(sourcePath) : t("db_converter.name_placeholder")}
          />
        </Field>

        {/* Game + Languages */}
        <div style={{ display: "flex", gap: 10 }}>
          <Field label={t("db_converter.game_label")} style={{ flex: 1 }}>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const, cursor: "pointer" }} value={game} onChange={e => setGame(e.target.value)}>
              {GAME_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label={t("db_converter.lang_from_label")} style={{ flex: 1 }}>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const, cursor: "pointer" }} value={langFrom} onChange={e => setLangFrom(e.target.value)}>
              {LANGUAGE_KEYS.map(l => <option key={l} value={l}>{t(`convert_bgt.lang.${l.toLowerCase()}`)}</option>)}
            </select>
          </Field>
          <Field label={t("db_converter.lang_to_label")} style={{ flex: 1 }}>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const, cursor: "pointer" }} value={langTo} onChange={e => setLangTo(e.target.value)}>
              {LANGUAGE_KEYS.map(l => <option key={l} value={l}>{t(`convert_bgt.lang.${l.toLowerCase()}`)}</option>)}
            </select>
          </Field>
        </div>

        {/* Output folder */}
        <Field label={t("db_converter.output_label")}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={outputFolder}
              onChange={e => setOutputFolder(e.target.value)}
              placeholder={t("db_converter.output_placeholder")}
            />
            <BrowseBtn onClick={handleBrowseOutput} label={t("db_converter.browse")} />
          </div>
        </Field>

        {/* Read-only toggle (only for .bgt) */}
        {outputFormat === "bgt" && (
          <Field label={t("db_converter.readonly_label")}>
            <div style={{ display: "flex", gap: 10 }}>
              {([true, false] as boolean[]).map(ro => (
                <label
                  key={String(ro)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flex: 1,
                    padding: "7px 10px",
                    background: readOnly === ro ? "rgba(99,102,241,0.1)" : "var(--bg-hover)",
                    border: `1px solid ${readOnly === ro ? "var(--accent)" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 5, cursor: "pointer", fontSize: 12, color: "var(--text-2)",
                  }}
                >
                  <input
                    type="radio" name="db-ro"
                    checked={readOnly === ro}
                    onChange={() => setReadOnly(ro)}
                    style={{ margin: 0, accentColor: "var(--accent)" }}
                  />
                  {ro ? t("convert_bgt.db_type_default") : t("convert_bgt.db_type_custom")}
                </label>
              ))}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--text-3)" }}>
              {readOnly ? t("convert_bgt.db_type_default_hint") : t("convert_bgt.db_type_custom_hint")}
            </p>
          </Field>
        )}

        {/* Result feedback */}
        {lastResult && (
          <div style={{
            fontSize: 11,
            color: lastResult.ok ? "var(--success, #22c55e)" : "var(--danger, #ef4444)",
            background: lastResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${lastResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            borderRadius: 5, padding: "6px 10px",
          }}>
            {lastResult.ok
              ? `✓ ${t("db_converter.success", { count: lastResult.count })}`
              : `⚠ ${lastResult.error}`}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "10px 18px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
        background: "var(--bg-card)",
      }}>
        <button
          onClick={onClose}
          style={{
            padding: "6px 16px",
            background: "transparent", border: "1px solid var(--border)",
            borderRadius: 5, color: "var(--text-2)", fontSize: 12, cursor: "pointer",
          }}
        >
          {t("common.close")}
        </button>
        <button
          onClick={handleConvert}
          disabled={!canConvert}
          style={{
            padding: "6px 20px",
            background: canConvert ? "var(--accent)" : "var(--bg-hover)",
            border: "none", borderRadius: 5,
            color: canConvert ? "#fff" : "var(--text-3)",
            fontSize: 12, fontWeight: 600,
            cursor: canConvert ? "pointer" : "default",
            opacity: converting ? 0.7 : 1,
          }}
        >
          {converting ? t("db_converter.converting") : t("db_converter.convert")}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginBottom: 5 }}>{label}</span>
      {children}
    </div>
  );
}

function BrowseBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0 12px",
        background: "var(--bg-hover)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 4, color: "var(--text-2)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >{label}</button>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-hover)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4, padding: "6px 10px",
  color: "var(--text-1)", fontSize: 12, outline: "none",
};
