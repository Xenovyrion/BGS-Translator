import { useState, useEffect, useRef, useCallback } from "react";
import { save as dialogSave, open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import type { GlossaryTerm } from "../../types";
import { REGEX_GAME_LIST, gameNameToKey } from "../../types";

// ── Constants ─────────────────────────────────────────────────────────────────

const WIN_W   = 820;
const WIN_H   = 560;
const TITLE_H = 36;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  glossaryByGame: Record<string, GlossaryTerm[]>;
  currentGame?:   string;   // detected game name (e.g. "Starfield")
  langFrom:       string;   // e.g. "en"
  langTo:         string;   // e.g. "fr"
  onUpdate:       (next: Record<string, GlossaryTerm[]>) => void;
  onClose:        () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GlossaryModal({
  glossaryByGame, currentGame, langFrom: _langFrom, langTo: _langTo, onUpdate, onClose,
}: Props) {
  const { t } = useTranslation();

  // ── Position (draggable) ──────────────────────────────────────────────────
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: Math.max(0, (window.innerWidth  - WIN_W) / 2),
    y: Math.max(0, (window.innerHeight - WIN_H) / 2),
  }));
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { ox, oy, px, py } = dragRef.current;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - WIN_W, px + e.clientX - ox)),
        y: Math.max(0, Math.min(window.innerHeight - WIN_H, py + e.clientY - oy)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // ── Game selector ─────────────────────────────────────────────────────────
  const autoGameId   = currentGame ? gameNameToKey(currentGame) : "all";
  const [selGame, setSelGame] = useState<string>(
    REGEX_GAME_LIST.some(g => g.id === autoGameId) ? autoGameId : "all"
  );

  const terms: GlossaryTerm[] = glossaryByGame[selGame] ?? [];
  const updateTerms = (next: GlossaryTerm[]) =>
    onUpdate({ ...glossaryByGame, [selGame]: next });

  // ── Search ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const filtered = terms.filter(t =>
    !search ||
    t.source.toLowerCase().includes(search.toLowerCase()) ||
    t.target.toLowerCase().includes(search.toLowerCase()) ||
    (t.notes ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Editing state ─────────────────────────────────────────────────────────
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<GlossaryTerm>>({});

  const startEdit = (term: GlossaryTerm) => {
    setEditId(term.id);
    setEditDraft({ ...term });
  };
  const cancelEdit = () => { setEditId(null); setEditDraft({}); };
  const commitEdit = () => {
    if (!editId) return;
    updateTerms(terms.map(t => t.id === editId ? { ...t, ...editDraft } as GlossaryTerm : t));
    setEditId(null);
    setEditDraft({});
  };

  const addTerm = () => {
    const newTerm: GlossaryTerm = {
      id: Date.now().toString(), source: "", target: "",
      caseSensitive: false, wholeWord: true, enabled: true, notes: "",
    };
    updateTerms([...terms, newTerm]);
    startEdit(newTerm);
  };

  const deleteTerm  = (id: string) => updateTerms(terms.filter(t => t.id !== id));
  const toggleTerm  = (id: string) => updateTerms(terms.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  const patchDraft  = (p: Partial<GlossaryTerm>) => setEditDraft(prev => ({ ...prev, ...p }));

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(async () => {
    const path = await dialogSave({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: `glossaire_${selGame}.csv`,
    });
    if (!path) return;
    const header = "source,target,caseSensitive,wholeWord,notes";
    const rows   = terms.map(t =>
      [t.source, t.target, t.caseSensitive ? "1" : "0", t.wholeWord ? "1" : "0", t.notes ?? ""]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    await writeTextFile(path, [header, ...rows].join("\n"));
  }, [terms, selGame]);

  // ── CSV import ────────────────────────────────────────────────────────────
  const handleImportCsv = useCallback(async () => {
    const selected = await dialogOpen({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    const text   = await readTextFile(selected);
    const lines  = text.split(/\r?\n/).filter(l => l.trim());
    const parsed: GlossaryTerm[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length < 2 || !cols[0].trim()) continue;
      parsed.push({
        id: Date.now().toString() + i,
        source:        cols[0] ?? "",
        target:        cols[1] ?? "",
        caseSensitive: cols[2] === "1",
        wholeWord:     cols[3] !== "0",
        enabled:       true,
        notes:         cols[4] ?? "",
      });
    }
    if (parsed.length > 0) {
      // Merge: keep existing, add new (skip duplicates by source+target)
      const existing = new Set(terms.map(t => `${t.source.toLowerCase()}|||${t.target.toLowerCase()}`));
      const fresh    = parsed.filter(t => !existing.has(`${t.source.toLowerCase()}|||${t.target.toLowerCase()}`));
      updateTerms([...terms, ...fresh]);
    }
  }, [terms, updateTerms]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (editId) cancelEdit(); else onClose(); }
      if (e.key === "Enter" && editId && (e.ctrlKey || e.metaKey)) commitEdit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editId, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles helpers ────────────────────────────────────────────────────────
  const cell: React.CSSProperties = {
    padding: "5px 8px", fontSize: 12, color: "var(--text-1)",
    borderBottom: "1px solid var(--border)", verticalAlign: "middle",
  };
  const inputCell: React.CSSProperties = {
    background: "var(--bg-hover)", border: "1px solid var(--accent)",
    borderRadius: 5, padding: "4px 7px", fontSize: 12, color: "var(--text-1)",
    outline: "none", width: "100%", boxSizing: "border-box",
  };
  const selectStyle: React.CSSProperties = {
    background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 6,
    color: "var(--text-1)", fontSize: 12, padding: "5px 8px", outline: "none", cursor: "pointer",
  };
  const actionBtn = (danger = false): React.CSSProperties => ({
    background: "none", border: "none", cursor: "pointer",
    color: danger ? "var(--danger, #e05)" : "var(--text-3)",
    fontSize: 13, padding: "2px 5px", lineHeight: 1,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed",
      left: pos.x, top: pos.y,
      width: WIN_W, height: WIN_H,
      background: "var(--bg-menubar)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
      display: "flex", flexDirection: "column",
      zIndex: 600,
      overflow: "hidden",
    }}>
      {/* ── Title bar ───────────────────────────────────────────────────── */}
      <div
        onMouseDown={onTitleMouseDown}
        style={{
          height: TITLE_H, display: "flex", alignItems: "center", gap: 10,
          padding: "0 14px", cursor: "grab", flexShrink: 0,
          background: "rgba(0,0,0,0.25)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 14 }}>📖</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
          {t("glossary.title")}
        </span>

        {/* Game selector */}
        <select value={selGame} onChange={e => { setSelGame(e.target.value); cancelEdit(); setSearch(""); }}
          style={selectStyle} onClick={e => e.stopPropagation()}>
          {REGEX_GAME_LIST.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>

        <button onClick={onClose} style={{ ...actionBtn(), fontSize: 16 }}>✕</button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
        borderBottom: "1px solid var(--border)", flexShrink: 0,
        background: "rgba(0,0,0,0.1)",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("glossary.search_placeholder")}
          style={{ ...inputCell, width: 200, border: "1px solid var(--border)" }}
        />
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 2 }}>
          {filtered.length}/{terms.length}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={addTerm} style={{
          background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
          padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
        }}>
          + {t("glossary.add")}
        </button>
        <button onClick={handleImportCsv} style={{ ...selectStyle, fontSize: 11 }}>
          ↑ CSV
        </button>
        <button onClick={handleExportCsv} disabled={terms.length === 0} style={{ ...selectStyle, fontSize: 11 }}>
          ↓ CSV
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36 }} />   {/* toggle */}
            <col style={{ width: "28%" }} />{/* source */}
            <col style={{ width: "28%" }} />{/* target */}
            <col style={{ width: 60 }} />   {/* Aa */}
            <col style={{ width: 50 }} />   {/* ≈ */}
            <col />                          {/* notes */}
            <col style={{ width: 72 }} />   {/* actions */}
          </colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "var(--bg-menubar)" }}>
              {["", t("glossary.col_source"), t("glossary.col_target"), "Aa", "≈", t("glossary.col_notes"), ""].map((h, i) => (
                <th key={i} style={{
                  ...cell, fontWeight: 700, fontSize: 10, textTransform: "uppercase",
                  letterSpacing: "0.07em", color: "var(--text-3)", borderBottom: "2px solid var(--border)",
                  textAlign: i === 0 || i === 6 ? "center" : "left",
                  background: "var(--bg-menubar)",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, textAlign: "center", color: "var(--text-3)", fontStyle: "italic", padding: "24px 0" }}>
                  {search ? t("glossary.no_results") : t("glossary.empty")}
                </td>
              </tr>
            )}
            {filtered.map(term => {
              const isEditing = editId === term.id;
              const draft     = editDraft;
              return (
                <tr key={term.id} style={{
                  background: isEditing ? "rgba(var(--accent-rgb,90,120,200),0.08)" : "transparent",
                  opacity: term.enabled ? 1 : 0.45,
                }}>
                  {/* Toggle */}
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button
                      onClick={() => toggleTerm(term.id)}
                      title={term.enabled ? t("glossary.disable") : t("glossary.enable")}
                      style={{
                        width: 26, height: 15, borderRadius: 7.5, border: "none",
                        background: term.enabled ? "var(--accent)" : "var(--border)",
                        cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s",
                        display: "inline-block",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2,
                        left: term.enabled ? 13 : 2,
                        width: 11, height: 11, borderRadius: "50%",
                        background: "#fff", transition: "left 0.2s",
                      }} />
                    </button>
                  </td>

                  {/* Source */}
                  <td style={cell}>
                    {isEditing
                      ? <input value={draft.source ?? ""} onChange={e => patchDraft({ source: e.target.value })}
                          placeholder={t("glossary.source_placeholder")} style={inputCell} autoFocus />
                      : <span style={{ fontFamily: "monospace", fontSize: 12 }}>{term.source}</span>
                    }
                  </td>

                  {/* Target */}
                  <td style={cell}>
                    {isEditing
                      ? <input value={draft.target ?? ""} onChange={e => patchDraft({ target: e.target.value })}
                          placeholder={t("glossary.target_placeholder")} style={inputCell} />
                      : <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent)" }}>{term.target}</span>
                    }
                  </td>

                  {/* Case sensitive */}
                  <td style={{ ...cell, textAlign: "center" }}>
                    {isEditing
                      ? <input type="checkbox" checked={draft.caseSensitive ?? false}
                          onChange={e => patchDraft({ caseSensitive: e.target.checked })}
                          style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                      : term.caseSensitive ? <span style={{ color: "var(--accent)", fontSize: 13 }}>✓</span> : null
                    }
                  </td>

                  {/* Whole word */}
                  <td style={{ ...cell, textAlign: "center" }}>
                    {isEditing
                      ? <input type="checkbox" checked={draft.wholeWord ?? true}
                          onChange={e => patchDraft({ wholeWord: e.target.checked })}
                          style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                      : term.wholeWord ? <span style={{ color: "var(--accent)", fontSize: 13 }}>✓</span> : null
                    }
                  </td>

                  {/* Notes */}
                  <td style={cell}>
                    {isEditing
                      ? <input value={draft.notes ?? ""} onChange={e => patchDraft({ notes: e.target.value })}
                          placeholder={t("glossary.notes_placeholder")} style={inputCell} />
                      : <span style={{ fontSize: 11, color: "var(--text-3)" }}>{term.notes}</span>
                    }
                  </td>

                  {/* Actions */}
                  <td style={{ ...cell, textAlign: "center" }}>
                    {isEditing ? (
                      <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={commitEdit}  title={t("glossary.save")}   style={actionBtn()}>✓</button>
                        <button onClick={cancelEdit}  title={t("glossary.cancel")} style={actionBtn()}>✕</button>
                      </span>
                    ) : (
                      <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={() => startEdit(term)} title={t("glossary.edit")}   style={actionBtn()}>✏</button>
                        <button onClick={() => deleteTerm(term.id)} title={t("glossary.delete")} style={actionBtn(true)}>🗑</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 36, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
        borderTop: "1px solid var(--border)", flexShrink: 0, background: "rgba(0,0,0,0.15)",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", flex: 1 }}>
          {t("glossary.footer_count", { count: terms.length })}
          {editId && <span style={{ color: "var(--accent)", marginLeft: 8 }}>
            {t("glossary.footer_editing")}
          </span>}
        </span>
        {editId && (
          <button onClick={commitEdit} style={{
            background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
            padding: "4px 12px", fontSize: 12, cursor: "pointer",
          }}>
            {t("glossary.save")}
          </button>
        )}
        <button onClick={onClose} style={{
          background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 6,
          padding: "4px 12px", fontSize: 12, cursor: "pointer", color: "var(--text-1)",
        }}>
          {t("glossary.close")}
        </button>
      </div>
    </div>
  );
}

// ── CSV parser (handles quoted fields) ───────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
