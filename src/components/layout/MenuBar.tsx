import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MenuItemDef {
  label?:    string;
  shortcut?: string;
  onClick?:  () => void;
  disabled?: boolean;
  separator?: true;
  checked?:  boolean;
  submenu?:  MenuItemDef[];
}

interface MenuDef {
  id:    string;
  label: string;
  items: MenuItemDef[];
}

interface Props {
  pluginLoaded:          boolean;
  loading?:              boolean;
  onOpenPlugin:          () => void;
  onOpenSession:         () => void;
  onSave?:               () => void;
  onImport?:             () => void;
  onExport?:             () => void;
  onSettings:            () => void;
  onSettingsDb:          () => void;
  onChangelog:           () => void;
  alternateRows:         boolean;
  onToggleAlternateRows: () => void;
  showColumnFilters:     boolean;
  onToggleColumnFilters: () => void;
  // Format import/export
  onImportXtXml?:     () => void;
  onImportEtXml?:     () => void;
  onImportCsv?:       () => void;
  onExportXtXml?:     () => void;
  onExportEtXml?:     () => void;
  onExportCsv?:       () => void;
  onOpenConverter?:        () => void;
  onOpenCompare?:          () => void;
  onGlobalFind?:           () => void;
  globalFindShortcut?:     string;
  onApplyPersonalDb?:      () => void;
  hasActivePersonalDb?:    boolean;
  onOpenQa?:               () => void;
  onOpenDbManager?:        () => void;
  dbManagerShortcut?:      string;   // e.g. "Ctrl+D"
  onApplyRegexRules?:      () => void;
  hasRegexRules?:          boolean;
  onOpenGlossary?:         () => void;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MenuBar({
  pluginLoaded, loading,
  onOpenPlugin, onOpenSession, onSave, onImport, onExport, onSettings, onSettingsDb, onChangelog,
  alternateRows, onToggleAlternateRows,
  showColumnFilters, onToggleColumnFilters,
  onImportXtXml, onImportEtXml, onImportCsv,
  onExportXtXml, onExportEtXml, onExportCsv,
  onOpenConverter,
  onOpenCompare,
  onGlobalFind, globalFindShortcut,
  onApplyPersonalDb, hasActivePersonalDb,
  onOpenQa,
  onOpenDbManager, dbManagerShortcut,
  onApplyRegexRules, hasRegexRules,
  onOpenGlossary,
}: Props) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const close = () => setOpenId(null);

  const menus: MenuDef[] = [
    {
      id: "fichier", label: t("menu.file"),
      items: [
        { label: t("menu.file_open"),        shortcut: "Ctrl+O", onClick: () => { close(); onOpenPlugin(); } },
        { label: t("menu.file_open_session"),                     onClick: () => { close(); onOpenSession(); } },
        { separator: true },
        { label: t("menu.file_save"), shortcut: "Ctrl+S", onClick: onSave ? () => { close(); onSave!(); } : undefined, disabled: !pluginLoaded || loading },
        { separator: true },
        {
          label: t("menu.file_import_section"),
          disabled: !pluginLoaded || loading,
          submenu: [
            { label: t("menu.file_import_plugin"), shortcut: "Ctrl+I", onClick: onImport ? () => { close(); onImport!(); } : undefined, disabled: !pluginLoaded || loading },
            { separator: true },
            { label: t("menu.file_import_xml_xt"),  onClick: onImportXtXml ? () => { close(); onImportXtXml!(); } : undefined, disabled: !pluginLoaded || loading },
            { label: t("menu.file_import_xml_et"),  onClick: onImportEtXml ? () => { close(); onImportEtXml!(); } : undefined, disabled: !pluginLoaded || loading },
            { label: t("menu.file_import_csv"),     onClick: onImportCsv   ? () => { close(); onImportCsv!();   } : undefined, disabled: !pluginLoaded || loading },
          ],
        },
        {
          label: t("menu.file_export_section"),
          disabled: !pluginLoaded || loading,
          submenu: [
            { label: t("menu.file_generate"), shortcut: "Ctrl+E", onClick: onExport ? () => { close(); onExport!(); } : undefined, disabled: !pluginLoaded || loading },
            { separator: true },
            { label: t("menu.file_export_xt_xml"), onClick: onExportXtXml ? () => { close(); onExportXtXml!(); } : undefined, disabled: !pluginLoaded || loading },
            { label: t("menu.file_export_et_xml"), onClick: onExportEtXml ? () => { close(); onExportEtXml!(); } : undefined, disabled: !pluginLoaded || loading },
            { label: t("menu.file_export_csv"),    onClick: onExportCsv   ? () => { close(); onExportCsv!();   } : undefined, disabled: !pluginLoaded || loading },
          ],
        },
        { separator: true },
        { label: t("menu.file_quit"), onClick: close },
      ],
    },
    {
      id: "edition", label: t("menu.edit"),
      items: [
        { label: t("menu.edit_global_find"), shortcut: globalFindShortcut, onClick: onGlobalFind ? () => { close(); onGlobalFind!(); } : undefined, disabled: !pluginLoaded || loading },
        { separator: true },
        { label: t("menu.edit_select_all"),   shortcut: "Ctrl+A", disabled: true },
        { label: t("menu.edit_deselect_all"), disabled: true },
      ],
    },
    {
      id: "database", label: t("menu.database"),
      items: [
        { label: t("menu.db_manage"), onClick: () => { close(); onSettingsDb(); } },
        { label: t("menu.tools_db_manager"), shortcut: dbManagerShortcut, onClick: onOpenDbManager ? () => { close(); onOpenDbManager!(); } : undefined },
        { separator: true },
        { label: t("menu.db_apply_personal"), disabled: !pluginLoaded || loading || !hasActivePersonalDb, onClick: onApplyPersonalDb ? () => { close(); onApplyPersonalDb!(); } : undefined },
        { separator: true },
        { label: t("menu.db_converter"), onClick: onOpenConverter ? () => { close(); onOpenConverter!(); } : undefined },
      ],
    },
    {
      id: "affichage", label: t("menu.view"),
      items: [
        { label: t("menu.view_col_filters"), checked: showColumnFilters, onClick: () => { close(); onToggleColumnFilters(); } },
        { separator: true },
        { label: t("menu.view_alt_rows"),    checked: alternateRows,     onClick: () => { close(); onToggleAlternateRows(); } },
      ],
    },
    {
      id: "filtres", label: t("menu.filters"),
      items: [
        { label: t("menu.filters_all"),     disabled: true },
        { label: t("menu.filters_untrans"), disabled: true },
        { label: t("menu.filters_trans"),   disabled: true },
      ],
    },
    {
      id: "outils", label: t("menu.tools"),
      items: [
        { label: t("menu.tools_compare"),   onClick: onOpenCompare ? () => { close(); onOpenCompare!(); } : undefined },
        { label: t("menu.tools_qa"), shortcut: "Ctrl+Q", disabled: !pluginLoaded || loading, onClick: onOpenQa ? () => { close(); onOpenQa!(); } : undefined },
        { separator: true },
        { label: t("menu.tools_apply_regex"), disabled: !pluginLoaded || loading || !hasRegexRules, onClick: onApplyRegexRules ? () => { close(); onApplyRegexRules!(); } : undefined },
        { label: t("menu.tools_glossary"),   onClick: onOpenGlossary ? () => { close(); onOpenGlossary!(); } : undefined },
        { separator: true },
        { label: t("menu.tools_settings"), shortcut: "Ctrl+,", onClick: () => { close(); onSettings(); } },
      ],
    },
    {
      id: "aide", label: t("menu.help"),
      items: [
        { label: t("menu.help_changelog"), onClick: () => { close(); onChangelog(); } },
        { separator: true },
        { label: t("menu.help_about"), disabled: true },
      ],
    },
  ];

  return (
    <nav
      ref={barRef}
      style={{
        display: "flex", alignItems: "stretch",
        background: "var(--bg-menubar)",
        borderBottom: "2px solid rgba(0,0,0,0.35)",
        height: 24,
        flexShrink: 0,
        userSelect: "none",
        position: "relative",
        zIndex: 200,
      }}
    >
      {menus.map((menu) => (
        <MenuEntry
          key={menu.id}
          menu={menu}
          isOpen={openId === menu.id}
          onOpen={() => setOpenId(menu.id)}
          onHover={() => { if (openId && openId !== menu.id) setOpenId(menu.id); }}
        />
      ))}
    </nav>
  );
}

// ── Menu entry + dropdown ─────────────────────────────────────────────────────

function MenuEntry({
  menu, isOpen, onOpen, onHover,
}: {
  menu: MenuDef;
  isOpen: boolean;
  onOpen: () => void;
  onHover: () => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={onOpen}
        style={{
          height: "100%", padding: "0 10px",
          background: isOpen ? "var(--accent)" : "transparent",
          color: isOpen ? "#fff" : "var(--menubar-text, #8899aa)",
          border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: 400,
          whiteSpace: "nowrap",
          display: "flex", alignItems: "center",
          transition: "background 0.1s, color 0.1s",
        }}
        onMouseEnter={(e) => { onHover(); if (!isOpen) { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "var(--text-1)"; } }}
        onMouseLeave={(e) => { if (!isOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--menubar-text, #8899aa)"; } }}
      >
        {menu.label}
      </button>

      {isOpen && (
        <div style={{
          position: "absolute", top: "100%", left: 0,
          background: "var(--bg-menubar)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderTop: "none",
          borderRadius: "0 4px 4px 4px",
          minWidth: 210,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          padding: "3px 0",
          zIndex: 999,
        }}>
          {menu.items.map((item, i) => {
            if (item.separator) {
              return <div key={i} style={{ height: 1, background: "var(--border)", margin: "3px 6px" }} />;
            }
            if (item.submenu) {
              return (
                <SubmenuItem
                  key={i}
                  item={item}
                  isHovered={hoveredIdx === i}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            }
            const hovered = hoveredIdx === i;
            return (
              <button
                key={i}
                onClick={item.disabled ? undefined : item.onClick}
                disabled={item.disabled}
                onMouseEnter={() => !item.disabled && setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  display: "flex", alignItems: "center",
                  width: "100%", padding: "5px 18px 5px 28px",
                  background: hovered ? "var(--accent)" : "none",
                  border: "none", cursor: item.disabled ? "default" : "pointer",
                  color: item.disabled ? "var(--menubar-text, #8899aa)" : hovered ? "#fff" : "var(--text-2)",
                  fontSize: 12, textAlign: "left", gap: 8,
                  position: "relative",
                }}
              >
                {item.checked !== undefined && (
                  <span style={{ position: "absolute", left: 8, fontSize: 11, lineHeight: 1 }}>
                    {item.checked ? "✓" : ""}
                  </span>
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.shortcut && (
                  <span style={{ fontSize: 10, opacity: 0.55, flexShrink: 0 }}>{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Submenu item with flyout ──────────────────────────────────────────────────

function SubmenuItem({
  item, isHovered, onMouseEnter, onMouseLeave,
}: {
  item: MenuItemDef;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [subHoveredIdx, setSubHoveredIdx] = useState<number | null>(null);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        disabled={item.disabled}
        style={{
          display: "flex", alignItems: "center",
          width: "100%", padding: "5px 18px 5px 28px",
          background: isHovered ? "var(--accent)" : "none",
          border: "none", cursor: item.disabled ? "default" : "pointer",
          color: item.disabled ? "var(--menubar-text, #8899aa)" : isHovered ? "#fff" : "var(--text-2)",
          fontSize: 12, textAlign: "left", gap: 8,
        }}
      >
        <span style={{ flex: 1 }}>{item.label}</span>
        <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }}>▶</span>
      </button>

      {isHovered && !item.disabled && item.submenu && (
        <div style={{
          position: "absolute", top: 0, left: "100%",
          background: "var(--bg-menubar)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "0 4px 4px 4px",
          minWidth: 230,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          padding: "3px 0",
          zIndex: 1000,
        }}>
          {item.submenu.map((sub, j) => {
            if (sub.separator) {
              return <div key={j} style={{ height: 1, background: "var(--border)", margin: "3px 6px" }} />;
            }
            const subHovered = subHoveredIdx === j;
            return (
              <button
                key={j}
                onClick={sub.disabled ? undefined : sub.onClick}
                disabled={sub.disabled}
                onMouseEnter={() => !sub.disabled && setSubHoveredIdx(j)}
                onMouseLeave={() => setSubHoveredIdx(null)}
                style={{
                  display: "flex", alignItems: "center",
                  width: "100%", padding: "5px 18px 5px 28px",
                  background: subHovered ? "var(--accent)" : "none",
                  border: "none", cursor: sub.disabled ? "default" : "pointer",
                  color: sub.disabled ? "var(--menubar-text, #8899aa)" : subHovered ? "#fff" : "var(--text-2)",
                  fontSize: 12, textAlign: "left", gap: 8,
                  position: "relative",
                }}
              >
                <span style={{ flex: 1 }}>{sub.label}</span>
                {sub.shortcut && (
                  <span style={{ fontSize: 10, opacity: 0.55, flexShrink: 0 }}>{sub.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
