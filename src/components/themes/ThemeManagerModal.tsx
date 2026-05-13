import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  THEME_PRESETS, EDITABLE_VARS_LABELED, FONT_FAMILIES, FONT_CSS, FONT_ZONES, ICON_SETS,
  DEFAULT_RECORD_COLORS, ALL_RECORD_TYPES,
} from "../../themes";
import type { ThemePreset, IconSetId } from "../../themes";
import type { AppSettings } from "../../hooks/useSettings";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Finds the display name from a CSS font-family string */
function guessDisplayName(cssVal: string): string {
  for (const [display, css] of Object.entries(FONT_CSS)) {
    if (css === cssVal) return display;
  }
  const first = (cssVal ?? "").split(",")[0].trim().replace(/['"]/g, "");
  return (Object.keys(FONT_CSS).find(k => k.toLowerCase() === first.toLowerCase()) ?? first) || "System UI";
}

function footBtn(
  variant: "primary" | "ghost" | "danger" | "warning" | "success",
  disabled = false,
): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)",   color: "#fff",            border: "none" },
    success: { background: "rgba(34,197,94,0.15)", color: "#22c55e",    border: "1px solid rgba(34,197,94,0.35)" },
    danger:  { background: "rgba(239,68,68,0.1)",  color: "#ef4444",    border: "1px solid rgba(239,68,68,0.35)" },
    warning: { background: "rgba(245,158,11,0.1)", color: "#f59e0b",    border: "1px solid rgba(245,158,11,0.35)" },
    ghost:   { background: "var(--bg-hover)", color: "var(--text-2)",   border: "1px solid var(--border)" },
  };
  return {
    padding: "7px 14px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12, fontWeight: 500, opacity: disabled ? 0.45 : 1,
    ...map[variant],
  };
}

const COLOR_GROUPS = ["Structure", "Zones", "Fond", "Couleurs"] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  settings: AppSettings;
  onUpdate: (u: Partial<AppSettings>) => void;
  onClose:  () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ThemeManagerModal({ settings, onUpdate, onClose }: Props) {
  const { t } = useTranslation();
  const allThemes  = [...THEME_PRESETS, ...(settings.customThemes ?? [])];
  const [selId, setSelId]   = useState<string>(settings.themeId);
  const [draft, setDraft]   = useState<ThemePreset | null>(null);

  const current  = draft ?? allThemes.find(th => th.id === selId) ?? THEME_PRESETS[0];
  const isCustom = !!(current.isCustom);
  const isDirty  = draft !== null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  /* Select a theme from the list */
  const selectTheme = useCallback((id: string) => {
    if (isDirty && !confirm(t("theme_manager.confirm_discard"))) return;
    setSelId(id);
    setDraft(null);
  }, [isDirty, t]);

  /* Update a CSS variable in the draft */
  const updateVar = useCallback((key: string, val: string) => {
    setDraft(prev => {
      const base = prev ?? current;
      return { ...base, vars: { ...base.vars, [key]: val } };
    });
  }, [current]);

  /* Update the icon set */
  const updateIconSet = useCallback((iconSet: IconSetId) => {
    setDraft(prev => ({ ...(prev ?? current), iconSet }));
  }, [current]);

  /* Update the color for a record type */
  const updateRecordColor = useCallback((type: string, color: string) => {
    setDraft(prev => {
      const base = prev ?? current;
      return { ...base, recordColors: { ...(base.recordColors ?? {}), [type]: color } };
    });
  }, [current]);

  /* Update the theme name */
  const updateName = useCallback((name: string) => {
    setDraft(prev => ({ ...(prev ?? current), name }));
  }, [current]);

  /* Save the draft into settings */
  const saveEdit = useCallback(() => {
    if (!draft) return;
    const customs = settings.customThemes ?? [];
    const idx     = customs.findIndex(c => c.id === draft.id);
    const next    = idx >= 0
      ? customs.map((c, i) => i === idx ? draft : c)
      : [...customs, draft];
    onUpdate({ customThemes: next });
    setDraft(null);
  }, [draft, settings.customThemes, onUpdate]);

  /* Duplicate a theme (clone of the provided theme) */
  const duplicateTheme = useCallback((base: ThemePreset) => {
    if (isDirty && !confirm(t("theme_manager.confirm_discard"))) return;
    const id       = `custom_${Date.now()}`;
    const newTheme: ThemePreset = { ...base, id, name: t("theme_manager.copy_name", { name: base.name }), isCustom: true };
    onUpdate({ customThemes: [...(settings.customThemes ?? []), newTheme] });
    setSelId(id);
    setDraft(newTheme);
  }, [isDirty, settings.customThemes, onUpdate, t]);

  /* Delete the currently selected custom theme */
  const deleteTheme = useCallback(() => {
    if (!isCustom || !confirm(t("theme_manager.confirm_delete", { name: current.name }))) return;
    const customs = (settings.customThemes ?? []).filter(c => c.id !== selId);
    onUpdate({
      customThemes: customs,
      ...(settings.themeId === selId ? { themeId: THEME_PRESETS[0].id, customThemeVars: {} } : {}),
    });
    setSelId(settings.themeId === selId ? THEME_PRESETS[0].id : settings.themeId);
    setDraft(null);
  }, [isCustom, current.name, settings.customThemes, settings.themeId, selId, onUpdate, t]);

  /* Apply the selected theme */
  const applyTheme = useCallback(() => {
    if (isDirty) saveEdit();
    onUpdate({ themeId: selId, customThemeVars: {} });
  }, [isDirty, saveEdit, selId, onUpdate]);

  /* Export JSON */
  const exportTheme = useCallback(async () => {
    const theme = draft ?? current;
    try {
      const path = await saveDialog({
        filters: [{ name: "Thème BGS Translator", extensions: ["bgtheme"] }],
        defaultPath: `${theme.name.replace(/[^a-zA-Z0-9 _-]/g, "_")}.bgtheme`,
      });
      if (path) {
        const payload = { ...theme, isCustom: true };
        await writeTextFile(path, JSON.stringify(payload, null, 2));
      }
    } catch (e) { alert(t("theme_manager.error_export", { error: String(e) })); }
  }, [draft, current, t]);

  /* Import JSON */
  const importTheme = useCallback(async () => {
    try {
      const path = await openDialog({
        filters: [{ name: "Thème BGS Translator", extensions: ["bgtheme", "json"] }],
        multiple: false,
      });
      if (!path || typeof path !== "string") return;
      const imported: ThemePreset = JSON.parse(await readTextFile(path));
      const id    = `custom_${Date.now()}`;
      const theme: ThemePreset = { ...imported, id, isCustom: true };
      onUpdate({ customThemes: [...(settings.customThemes ?? []), theme] });
      setSelId(id);
      setDraft(null);
    } catch (e) { alert(t("theme_manager.error_import", { error: String(e) })); }
  }, [settings.customThemes, onUpdate, t]);

  const isActive = settings.themeId === selId && !isDirty;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        zIndex: 1100,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-primary)", borderRadius: 12,
          width: 980, height: 730,
          display: "flex", flexDirection: "column",
          border: "1px solid var(--border)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", padding: "13px 20px",
          background: "var(--bg-card)", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", flex: 1 }}>
            {t("theme_manager.title")}
          </span>
          {isDirty && (
            <span style={{ fontSize: 11, color: "#f59e0b", marginRight: 16, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 8 }}>●</span> {t("theme_manager.unsaved")}
            </span>
          )}
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 22, padding: 0, lineHeight: 1 }}
          >×</button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <ThemeListPanel
            builtins={THEME_PRESETS}
            customs={settings.customThemes ?? []}
            selectedId={selId}
            activeId={settings.themeId}
            onSelect={selectTheme}
            onDuplicate={duplicateTheme}
          />
          <ThemeEditorPanel
            theme={current}
            isEditable={isCustom}
            onVarChange={updateVar}
            onNameChange={updateName}
            onIconSetChange={updateIconSet}
            onRecordColorChange={updateRecordColor}
          />
          <ThemePreviewPanel theme={current} />
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 20px",
          background: "var(--bg-card)", borderTop: "1px solid var(--border)",
          gap: 8, flexShrink: 0,
        }}>
          <button onClick={importTheme} style={footBtn("ghost")}>{t("theme_manager.import")}</button>

          <div style={{ flex: 1 }} />

          {isDirty && <>
            <button onClick={saveEdit} style={footBtn("primary")}>{t("theme_manager.save")}</button>
            <button onClick={() => setDraft(null)} style={footBtn("ghost")}>{t("theme_manager.cancel")}</button>
          </>}

          <button onClick={exportTheme} style={footBtn("ghost")}>{t("theme_manager.export")}</button>

          {isCustom && !isDirty && (
            <button onClick={deleteTheme} style={footBtn("danger")}>{t("theme_manager.delete")}</button>
          )}

          <button onClick={applyTheme} style={footBtn(isActive ? "success" : "primary")}>
            {isActive ? t("theme_manager.active_theme") : t("theme_manager.apply")}
          </button>
          <button onClick={onClose} style={footBtn("ghost")}>{t("theme_manager.close")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Theme list (left panel) ───────────────────────────────────────────────────

function ThemeListPanel({
  builtins, customs, selectedId, activeId, onSelect, onDuplicate,
}: {
  builtins:    ThemePreset[];
  customs:     ThemePreset[];
  selectedId:  string;
  activeId:    string;
  onSelect:    (id: string) => void;
  onDuplicate: (theme: ThemePreset) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{
      width: 210, flexShrink: 0, borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Built-in themes */}
        <SectionHeader label={t("theme_manager.builtin_section")} />
        {builtins.map(th => (
          <ThemeRow
            key={th.id} theme={th}
            selected={selectedId === th.id} active={activeId === th.id}
            onSelect={() => onSelect(th.id)}
            onDuplicate={() => onDuplicate(th)}
          />
        ))}

        {/* Custom themes */}
        <SectionHeader label={t("theme_manager.custom_section")} topBorder />
        {customs.length > 0
          ? customs.map(th => (
            <ThemeRow
              key={th.id} theme={th}
              selected={selectedId === th.id} active={activeId === th.id}
              onSelect={() => onSelect(th.id)}
              onDuplicate={() => onDuplicate(th)}
            />
          ))
          : (
            <div style={{ padding: "10px 12px", fontSize: 10, color: "var(--text-3)", lineHeight: 1.5, textAlign: "center" }}>
              {t("theme_manager.no_custom")}<br />
              <span style={{ opacity: 0.7 }}>{t("theme_manager.no_custom_hint")}</span>
            </div>
          )
        }
      </div>
    </div>
  );
}

function SectionHeader({ label, topBorder }: { label: string; topBorder?: boolean }) {
  return (
    <div style={{
      padding: "7px 12px 4px",
      fontSize: 9, fontWeight: 700, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: "0.08em",
      ...(topBorder ? { borderTop: "1px solid var(--border)", marginTop: 4 } : {}),
    }}>
      {label}
    </div>
  );
}

function ThemeRow({ theme, selected, active, onSelect, onDuplicate }: {
  theme:       ThemePreset;
  selected:    boolean;
  active:      boolean;
  onSelect:    () => void;
  onDuplicate: () => void;
}) {
  const { t } = useTranslation();
  const [hovering, setHovering] = useState(false);
  const themeName = t(`theme.name.${theme.id}`, { defaultValue: theme.name });

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: "flex", alignItems: "center",
        background: selected ? "rgba(255,255,255,0.06)" : "transparent",
        borderLeft: `3px solid ${selected ? theme.preview : "transparent"}`,
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Main select button */}
      <button
        onClick={onSelect}
        style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          padding: "6px 8px 6px 9px",
          background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", minWidth: 0,
        }}
      >
        <div style={{ width: 14, height: 14, borderRadius: 3, background: theme.preview, flexShrink: 0, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)" }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? "var(--text-1)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {themeName}
        </span>
        {active && <span title={t("theme_manager.active_badge")} style={{ fontSize: 8, color: theme.preview, flexShrink: 0 }}>●</span>}
        {theme.isCustom && <span title={t("theme_manager.custom_badge")} style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>✎</span>}
      </button>

      {/* Duplicate button — visible on hover or when selected */}
      <button
        onClick={e => { e.stopPropagation(); onDuplicate(); }}
        title={t("theme_manager.duplicate_title")}
        style={{
          padding: "4px 7px", marginRight: 4,
          background: "transparent", border: "none",
          cursor: "pointer", color: "var(--text-3)",
          fontSize: 13, lineHeight: 1, borderRadius: 4,
          opacity: hovering || selected ? 1 : 0,
          transition: "opacity 0.12s",
          flexShrink: 0,
        }}
      >⧉</button>
    </div>
  );
}

// ── Theme editor (center panel) ───────────────────────────────────────────────

function ThemeEditorPanel({ theme, isEditable, onVarChange, onNameChange, onIconSetChange, onRecordColorChange }: {
  theme:                  ThemePreset;
  isEditable:             boolean;
  onVarChange:            (key: string, val: string) => void;
  onNameChange:           (name: string) => void;
  onIconSetChange:        (iconSet: IconSetId) => void;
  onRecordColorChange:    (type: string, color: string) => void;
}) {
  const { t } = useTranslation();
  const themeName = t(`theme.name.${theme.id}`, { defaultValue: theme.name });
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(["Structure", "Zones"])
  );
  const toggleGroup = (g: string) =>
    setOpenGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const v = (key: string) => theme.vars[key] ?? "#000000";
  const activeIconSet: IconSetId = theme.iconSet ?? "minimal";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--border)" }}>

      {/* Name + status */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          {isEditable ? (
            <input
              type="text"
              value={theme.name}
              onChange={e => onNameChange(e.target.value)}
              style={{
                width: "100%", padding: "5px 9px",
                background: "var(--bg-hover)", color: "var(--text-1)",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 13, fontWeight: 600, outline: "none", boxSizing: "border-box",
              }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{themeName}</span>
          )}
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>
            {isEditable ? t("theme_manager.editable_badge") : t("theme_manager.readonly_badge")}
          </div>
        </div>
      </div>

      {/* Color, typography, and icon sections */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>

        {/* Info banner for built-in themes */}
        {!isEditable && (
          <div style={{ padding: "8px 12px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, fontSize: 11, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
            {t("theme_manager.readonly_info_line1")}<br />
            {t("theme_manager.readonly_info_line2")}
          </div>
        )}

        {/* Color groups */}
        {COLOR_GROUPS.map(group => {
          const vars = EDITABLE_VARS_LABELED.filter(x => x.group === group && x.type !== "text");
          const open = openGroups.has(group);
          return (
            <CollapsibleSection
              key={group}
              label={t(`theme_manager.group.${group.toLowerCase()}`)}
              open={open}
              onToggle={() => toggleGroup(group)}
            >
              <div style={{ padding: "8px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                {vars.map(({ key }) => {
                  const val = v(key);
                  const varKey = key.replace(/^--/, "").replace(/-/g, "_");
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 5, background: val, border: "1px solid var(--border)", overflow: "hidden" }}>
                          <input
                            type="color"
                            value={val.startsWith("#") ? val : "#000000"}
                            onChange={e => isEditable && onVarChange(key, e.target.value)}
                            disabled={!isEditable}
                            style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: isEditable ? "pointer" : "not-allowed" }}
                          />
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: "var(--text-1)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t(`theme.vars.${varKey}`)}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "monospace" }}>{val}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          );
        })}

        {/* Typography */}
        <CollapsibleSection
          label={t("theme_manager.section_fonts")}
          open={openGroups.has("Polices")}
          onToggle={() => toggleGroup("Polices")}
        >
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
            {FONT_ZONES.map(zone => (
              <FontZoneRow
                key={zone.familyVar}
                zone={zone}
                vars={theme.vars}
                isEditable={isEditable}
                onVarChange={onVarChange}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* Icon set */}
        <CollapsibleSection
          label={t("theme_manager.section_icon_set")}
          open={openGroups.has("Icônes")}
          onToggle={() => toggleGroup("Icônes")}
        >
          <div style={{ padding: "10px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ICON_SETS.map(set => {
                const isSelected = activeIconSet === set.id;
                return (
                  <button
                    key={set.id}
                    onClick={() => isEditable && onIconSetChange(set.id)}
                    disabled={!isEditable}
                    title={t(`theme.icon_set.${set.id}_desc`)}
                    style={{
                      flex: 1, minWidth: 80,
                      padding: "10px 8px",
                      borderRadius: 7, cursor: isEditable ? "pointer" : "not-allowed",
                      background: isSelected ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      opacity: !isEditable ? 0.55 : 1,
                      transition: "all 0.12s",
                    }}
                  >
                    <IconSetPreview setId={set.id} accent={isSelected ? "var(--accent)" : "var(--text-3)"} />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500, color: isSelected ? "var(--accent)" : "var(--text-1)" }}>
                        {t(`theme.icon_set.${set.id}_label`)}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3 }}>
                        {t(`theme.icon_set.${set.id}_desc`)}
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>{t("theme_manager.icon_set_active")}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        {/* Record type colors */}
        <CollapsibleSection
          label={t("theme_manager.section_record_colors")}
          open={openGroups.has("Groupes")}
          onToggle={() => toggleGroup("Groupes")}
        >
          <div style={{ padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8, lineHeight: 1.5 }}>
              {t("theme_manager.record_colors_hint")}
              {!isEditable && <span style={{ color: "var(--warning)", marginLeft: 6 }}>{t("theme_manager.record_colors_clone_hint")}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              {ALL_RECORD_TYPES.map(type => {
                const custom  = theme.recordColors?.[type];
                const defCol  = DEFAULT_RECORD_COLORS[type] ?? "#64748b";
                const current = custom ?? defCol;
                const isDiff  = !!custom && custom.toLowerCase() !== defCol.toLowerCase();
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {/* Swatch + color input */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: current, border: "1px solid var(--border)", overflow: "hidden", cursor: isEditable ? "pointer" : "not-allowed" }}>
                        <input
                          type="color"
                          value={current.startsWith("#") ? current : "#000000"}
                          onChange={e => isEditable && onRecordColorChange(type, e.target.value)}
                          disabled={!isEditable}
                          style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: isEditable ? "pointer" : "not-allowed" }}
                        />
                      </div>
                    </div>
                    {/* Label */}
                    <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: current, minWidth: 34 }}>{type}</span>
                    {/* Hex */}
                    <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "monospace", flex: 1 }}>{current}</span>
                    {/* Reset if modified */}
                    {isDiff && (
                      <button
                        onClick={() => isEditable && onRecordColorChange(type, defCol)}
                        title={t("theme_manager.record_color_reset_title")}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 11, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                      >↺</button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Reset all button */}
            <button
              onClick={() => {
                if (!isEditable) return;
                ALL_RECORD_TYPES.forEach(tp => onRecordColorChange(tp, DEFAULT_RECORD_COLORS[tp] ?? "#64748b"));
              }}
              disabled={!isEditable}
              style={{
                marginTop: 10, padding: "5px 12px", borderRadius: 6, fontSize: 11,
                background: "transparent", border: "1px solid var(--border)",
                cursor: isEditable ? "pointer" : "not-allowed", color: "var(--text-3)",
                opacity: isEditable ? 1 : 0.5,
              }}
            >{t("theme_manager.record_colors_reset_all")}</button>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}

/** Mini icon set preview for the selector */
function IconSetPreview({ setId, accent }: { setId: IconSetId; accent: string }) {
  const style: React.CSSProperties = { display: "flex", gap: 5, alignItems: "center" };
  if (setId === "minimal") {
    return (
      <div style={style}>
        {/* Folder */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        {/* Save */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        {/* Settings */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </div>
    );
  }
  if (setId === "material") {
    return (
      <div style={style}>
        {/* Folder filled */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill={accent}>
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
        {/* Save filled */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill={accent}>
          <path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
        </svg>
        {/* Settings filled */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill={accent}>
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </div>
    );
  }
  // classic
  return (
    <div style={style}>
      {/* Classic folder */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5">
        <rect x="2" y="7" width="20" height="14" rx="1" fill={accent} fillOpacity="0.15"/>
        <rect x="2" y="7" width="20" height="14" rx="1"/>
        <path d="M2 7l2-3h6l2 3" fill={accent} fillOpacity="0.3"/>
        <path d="M2 7l2-3h6l2 3"/>
      </svg>
      {/* Classic floppy */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="1" fill={accent} fillOpacity="0.15"/>
        <rect x="3" y="3" width="18" height="18" rx="1"/>
        <rect x="7" y="3" width="10" height="7" rx="0.5" fill={accent} fillOpacity="0.3"/>
        <rect x="7" y="3" width="10" height="7" rx="0.5"/>
        <rect x="8" y="14" width="8" height="6" rx="0.5" fill={accent} fillOpacity="0.2"/>
        <rect x="8" y="14" width="8" height="6" rx="0.5"/>
      </svg>
      {/* Classic gear */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.5">
        <circle cx="12" cy="12" r="3.5" fill={accent} fillOpacity="0.2"/>
        <circle cx="12" cy="12" r="3.5"/>
        <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

function CollapsibleSection({ label, open, onToggle, children }: {
  label:    string;
  open:     boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 8, border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "7px 12px",
          background: "var(--bg-card)", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: "var(--text-2)", fontSize: 11, fontWeight: 600,
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 9, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {open && children}
    </div>
  );
}

// ── Font zone row ─────────────────────────────────────────────────────────────

function FontZoneRow({ zone, vars, isEditable, onVarChange }: {
  zone:        typeof FONT_ZONES[number];
  vars:        Record<string, string>;
  isEditable:  boolean;
  onVarChange: (key: string, val: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos,  setPickerPos]  = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const familyVal   = vars[zone.familyVar] ?? zone.defaultFamily;
  const sizeVal     = (vars[zone.sizeVar]  ?? zone.defaultSize).replace("px", "");
  const displayName = guessDisplayName(familyVal);

  // Derive zone key from familyVar: "--font-ui" → "ui", "--font-content" → "content", etc.
  const zoneKey = zone.familyVar.replace("--font-", "");

  const openPicker = () => {
    if (!btnRef.current || !isEditable) return;
    const rect = btnRef.current.getBoundingClientRect();
    // 440px wide popover — try to keep it on-screen
    const left = Math.min(Math.max(8, rect.left - 380), window.innerWidth - 448);
    const top  = rect.bottom + 6;
    setPickerPos({ top, left });
    setPickerOpen(true);
  };

  const handleApply = (family: string, size: string) => {
    onVarChange(zone.familyVar, FONT_CSS[family] ?? `'${family}', sans-serif`);
    onVarChange(zone.sizeVar,   `${size}px`);
    setPickerOpen(false);
    setPickerPos(null);
  };

  const handleReset = () => {
    onVarChange(zone.familyVar, FONT_CSS[zone.defaultFamily] ?? zone.defaultFamily);
    onVarChange(zone.sizeVar,   zone.defaultSize);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {t(`theme.font_zone.${zoneKey}`)}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {/* Current value display */}
        <div style={{
          flex: 1, padding: "5px 10px",
          background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 6,
          fontSize: 11, color: "var(--text-1)",
          fontFamily: familyVal,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayName}, {sizeVal}pt &nbsp;—&nbsp;
          <span style={{ fontFamily: familyVal, fontSize: `${sizeVal}px` }}>AaBbYyZz</span>
        </div>

        {/* Open picker button */}
        <button
          ref={btnRef}
          onClick={openPicker}
          disabled={!isEditable}
          style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 11,
            background: "var(--bg-card)", border: "1px solid var(--border)",
            cursor: isEditable ? "pointer" : "not-allowed", color: "var(--text-2)",
            flexShrink: 0, opacity: isEditable ? 1 : 0.5,
            fontWeight: 500,
          }}
        >…</button>

        {/* Reset */}
        <button
          onClick={() => isEditable && handleReset()}
          disabled={!isEditable}
          title={t("theme_manager.font_reset_title")}
          style={{
            padding: "5px 8px", borderRadius: 6, fontSize: 11,
            background: "transparent", border: "1px solid var(--border)",
            cursor: isEditable ? "pointer" : "not-allowed", color: "var(--danger)",
            flexShrink: 0, opacity: isEditable ? 1 : 0.5,
          }}
        >×</button>
      </div>

      {/* Popover via portal → escapes overflow:hidden */}
      {pickerOpen && pickerPos && createPortal(
        <FontPickerPopover
          position={pickerPos}
          currentFamily={displayName}
          currentSize={sizeVal}
          onApply={handleApply}
          onClose={() => { setPickerOpen(false); setPickerPos(null); }}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Font picker popover (via portal) ─────────────────────────────────────────

function FontPickerPopover({ position, currentFamily, currentSize, onApply, onClose }: {
  position:      { top: number; left: number };
  currentFamily: string;
  currentSize:   string;
  onApply:       (family: string, size: string) => void;
  onClose:       () => void;
}) {
  const { t } = useTranslation();
  const [family, setFamily] = useState(currentFamily || "Segoe UI");
  const [size,   setSize]   = useState(currentSize    || "12");
  const popoverRef = useRef<HTMLDivElement>(null);
  const SIZES = ["8","9","10","11","12","13","14","16","18","20","22","24","28","32","36"];

  const previewCss = FONT_CSS[family] ?? `'${family}', sans-serif`;

  /* Close on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Short delay to avoid capturing the click that opened the popover
    const timer = setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", h); };
  }, [onClose]);

  /* Close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 9999,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: 16,
        boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
        width: 440,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--text-1)", marginBottom: 12, fontSize: 13 }}>{t("theme_manager.font_title")}</div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {/* Family */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{t("theme_manager.font_family")}</div>
          <div style={{ height: 170, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-primary)" }}>
            {Object.entries(FONT_FAMILIES).map(([group, fonts]) => (
              <div key={group}>
                <div style={{ padding: "3px 10px", fontSize: 9, fontWeight: 700, color: "var(--text-3)", background: "var(--bg-hover)", textTransform: "uppercase", letterSpacing: "0.06em", position: "sticky", top: 0 }}>
                  {group}
                </div>
                {fonts.map(f => (
                  <button
                    key={f}
                    onClick={() => setFamily(f)}
                    style={{
                      display: "block", width: "100%", padding: "5px 12px",
                      textAlign: "left", border: "none", cursor: "pointer",
                      background: family === f ? "var(--accent)" : "transparent",
                      color:      family === f ? "#fff" : "var(--text-2)",
                      fontSize: 12,
                      fontFamily: FONT_CSS[f] ?? f,
                    }}
                  >{f}</button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Size */}
        <div style={{ width: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{t("theme_manager.font_size")}</div>
          <div style={{ height: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-primary)", marginBottom: 6 }}>
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  display: "block", width: "100%", padding: "4px 12px",
                  textAlign: "left", border: "none", cursor: "pointer",
                  background: size === s ? "var(--accent)" : "transparent",
                  color:      size === s ? "#fff" : "var(--text-2)",
                  fontSize: 11,
                }}
              >{s}pt</button>
            ))}
          </div>
          <input
            type="number"
            value={size}
            onChange={e => setSize(e.target.value)}
            min={6} max={72}
            style={{
              width: "100%", padding: "4px 7px", borderRadius: 5,
              background: "var(--bg-hover)", color: "var(--text-1)",
              border: "1px solid var(--border)", fontSize: 11, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Preview */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{t("theme_manager.font_preview")}</div>
        <div style={{
          padding: "12px 16px", background: "var(--bg-hover)",
          border: "1px solid var(--border)", borderRadius: 6,
          fontFamily: previewCss, fontSize: `${size}px`,
          color: "var(--text-1)", textAlign: "center", lineHeight: 1.6,
          minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          AaBbYyZz — 1234567890
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 6, background: "var(--bg-hover)", color: "var(--text-2)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 12 }}>
          {t("common.cancel")}
        </button>
        <button
          onClick={() => onApply(family, size)}
          style={{ padding: "6px 16px", borderRadius: 6, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ── Theme thumbnail preview (right panel) ─────────────────────────────────────

function ThemePreviewPanel({ theme }: { theme: ThemePreset }) {
  const { t } = useTranslation();
  const themeName = t(`theme.name.${theme.id}`, { defaultValue: theme.name });
  const c = (key: string, fallback = "#222") => theme.vars[key] ?? fallback;
  /** Resolves the color for a record type (theme override → default) */
  const rc = (type: string) => theme.recordColors?.[type] ?? DEFAULT_RECORD_COLORS[type] ?? "#64748b";

  const border   = c("--border",     "rgba(255,255,255,0.07)");
  const accent   = c("--accent",     "#3b82f6");
  const text1    = c("--text-1",     "#f1f5f9");
  const text2    = c("--text-2",     "#94a3b8");
  const text3    = c("--text-3",     "#64748b");

  return (
    <div style={{ width: 248, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "8px 14px 4px", fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        {t("theme_manager.preview_title")}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>

        {/* Mini-app */}
        <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${border}`, background: c("--bg-primary") }}>

          {/* Menubar */}
          <div style={{ height: 16, background: c("--bg-menubar"), display: "flex", alignItems: "center", gap: 5, padding: "0 8px" }}>
            {[
              t("theme_manager.preview.menu_file"),
              t("theme_manager.preview.menu_edit"),
              t("theme_manager.preview.menu_view"),
            ].map((lbl, i) => (
              <span key={lbl} style={{ fontSize: 7.5, color: i === 2 ? "#fff" : c("--menubar-text"), background: i === 2 ? accent : "transparent", padding: i === 2 ? "0 5px" : "0", borderRadius: 3, fontWeight: i === 2 ? 700 : 400 }}>
                {lbl}
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ height: 20, background: c("--bg-toolbar"), display: "flex", alignItems: "center", gap: 3, padding: "0 6px", borderBottom: `1px solid rgba(0,0,0,0.25)` }}>
            <ToolDot color={accent} />
            <ToolDot />
            <ToolDot />
            <div style={{ width: 1, height: 10, background: border, margin: "0 2px" }} />
            <span style={{ fontSize: 7, color: text3, fontFamily: "monospace" }}>MyPlugin.esm</span>
          </div>

          {/* Filter bar */}
          <div style={{ height: 17, background: c("--bg-filter", c("--bg-card")), display: "flex", alignItems: "center", gap: 3, padding: "0 6px", borderBottom: `1px solid ${border}` }}>
            {[
              { l: t("theme_manager.preview.filter_all"),      a: true  },
              { l: t("theme_manager.preview.filter_untrans"),  a: false },
              { l: t("theme_manager.preview.filter_validated"),a: false },
            ].map(({l,a}) => (
              <span key={l} style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: a ? accent : c("--bg-hover"), color: a ? "#fff" : text2 }}>{l}</span>
            ))}
          </div>

          {/* Content row: sidebar + table */}
          <div style={{ display: "flex", height: 88 }}>
            {/* Sidebar */}
            <div style={{ width: 34, background: c("--bg-sidebar"), borderRight: `1px solid rgba(0,0,0,0.3)`, display: "flex", flexDirection: "column", gap: 1, paddingTop: 3 }}>
              <div style={{ padding: "3px 5px", borderBottom: `1px solid ${border}`, marginBottom: 2 }}>
                <div style={{ fontSize: 7, fontWeight: 700, color: text2, marginBottom: 2 }}>{t("theme_manager.preview.sidebar_progress")}</div>
                <div style={{ height: 4, borderRadius: 2, background: accent }} />
              </div>
              {[
                { l: t("theme_manager.preview.filter_all"), col: accent },
                { l: "WEAP", col: rc("WEAP") },
                { l: "NPC_", col: rc("NPC_") },
              ].map(({l,col},i) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:3, padding:"2px 5px", borderLeft:`2px solid ${i===0?col:"transparent"}`, background:i===0?"rgba(255,255,255,0.05)":"transparent" }}>
                  <span style={{ fontSize: 7, color: col, fontWeight: 700, fontFamily: "monospace" }}>{l}</span>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", background: c("--bg-table-header", c("--bg-card")), padding: "2px 4px", borderBottom: `1px solid ${border}` }}>
                {[
                  "TYPE", "ID",
                  t("theme_manager.preview.col_original"),
                  t("theme_manager.preview.col_translation"),
                ].map((h,i) => (
                  <div key={h} style={{ flex: i < 2 ? "0 0 24px" : 1, fontSize: 5.5, fontWeight: 700, color: text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                ))}
              </div>
              {/* Rows */}
              {[
                { type:"WEAP", id:"001A2F", orig:"Iron Sword",    trans:"Épée en fer",   st:"#22c55e", alt:false },
                { type:"NPC_", id:"003B88", orig:"Merchant",       trans:"",              st:"#ef4444", alt:true  },
                { type:"QUST", id:"00A12C", orig:"Main quest…",    trans:"Quête princ…",  st:"#f59e0b", alt:false },
                { type:"INFO", id:"00B410", orig:"Hello there!",   trans:"",              st:"#ef4444", alt:true  },
              ].map((row, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${border}`, borderLeft:`2px solid ${row.st}`, background: row.alt ? "rgba(255,255,255,0.012)" : "transparent", padding:"1.5px 4px" }}>
                  <div style={{ flex:"0 0 24px", fontSize:6, fontWeight:700, color: rc(row.type), fontFamily:"monospace" }}>{row.type}</div>
                  <div style={{ flex:"0 0 24px", fontSize:6, color:text3, fontFamily:"monospace" }}>{row.id}</div>
                  <div style={{ flex:1, fontSize:7, color:text2, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{row.orig}</div>
                  <div style={{ flex:1, fontSize:7, color:row.trans?text1:text3, fontStyle:row.trans?"normal":"italic", overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{row.trans||"—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Edit panel */}
          <div style={{ background: c("--bg-edit-panel", c("--bg-card")), borderTop: `2px solid rgba(0,0,0,0.3)`, padding: "4px 7px" }}>
            <div style={{ display:"flex", gap:4, marginBottom:3, alignItems:"center" }}>
              <span style={{ fontSize:7, color:text3, fontFamily:"monospace" }}>[WEAP] 001A2F</span>
              <div style={{ flex:1 }} />
              {[
                { l: t("theme_manager.preview.status_validated"), a: true,  c: "#22c55e" },
                { l: t("theme_manager.preview.status_pending"),   a: false, c: "" },
                { l: t("theme_manager.preview.status_ignored"),   a: false, c: "" },
              ].map(({l,a,c:sc},i) => (
                <span key={i} style={{ fontSize:6.5, padding:"0 4px", borderRadius:2, background:a?sc:c("--bg-primary"), color:a?"#fff":text3 }}>{l}</span>
              ))}
            </div>
            <div style={{ display:"flex", gap:4, height:20 }}>
              <div style={{ flex:1, background:c("--bg-card"), borderRadius:3, padding:"2px 4px", fontSize:7, color:text2, border:`1px solid ${border}` }}>Iron Sword</div>
              <div style={{ flex:1, background:c("--bg-hover"), borderRadius:3, padding:"2px 4px", fontSize:7, color:text1, border:`1px solid ${border}` }}>Épée en fer</div>
            </div>
          </div>

          {/* Statusbar */}
          <div style={{ height: 13, background: c("--bg-statusbar"), display:"flex", alignItems:"center", padding:"0 8px", gap:6 }}>
            <span style={{ fontSize:6.5, fontWeight:700, color:text3, textTransform:"uppercase", letterSpacing:"0.04em" }}>BGS Translator</span>
            <span style={{ width:1, height:8, background:border }} />
            <span style={{ fontSize:6.5, color:text3 }}>Total <strong style={{color:text2}}>142</strong></span>
            <span style={{ fontSize:6.5, color:"#22c55e" }}>✓ 98</span>
          </div>
        </div>

        {/* Accent palette */}
        <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--bg-card)", borderRadius: 6, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-1)", marginBottom: 6 }}>{themeName}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
            {["--accent","--bg-primary","--bg-card","--bg-menubar","--bg-sidebar","--bg-filter","--bg-edit-panel"].map(k => (
              <div key={k} title={k.replace("--","")} style={{ width: 16, height: 16, borderRadius: 3, background: c(k), border: "1px solid rgba(0,0,0,0.25)", cursor: "help" }} />
            ))}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>{theme.isCustom ? t("theme_manager.custom_badge_preview") : t("theme_manager.builtin_badge_preview")}</span>
            {theme.iconSet && theme.iconSet !== "minimal" && (
              <span style={{ opacity: 0.7 }}>{t("theme_manager.icons_badge", { iconSet: theme.iconSet })}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolDot({ color }: { color?: string }) {
  const clr = color ?? "var(--bg-hover)";
  return <div style={{ width: 13, height: 13, borderRadius: 3, background: clr, flexShrink: 0 }} />;
}
