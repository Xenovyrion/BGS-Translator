import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MenuItemDef {
  label?:     string;
  shortcut?:  string;
  onClick?:   () => void;
  disabled?:  boolean;
  separator?: true;
  checked?:   boolean;
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
  onExport?:             () => void;
  onSettings:            () => void;
  onSettingsDb:          () => void;
  onChangelog:           () => void;
  alternateRows:         boolean;
  onToggleAlternateRows: () => void;
  showColumnFilters:     boolean;
  onToggleColumnFilters: () => void;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MenuBar({
  pluginLoaded, loading,
  onOpenPlugin, onOpenSession, onSave, onExport, onSettings, onSettingsDb, onChangelog,
  alternateRows, onToggleAlternateRows,
  showColumnFilters, onToggleColumnFilters,
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
        { label: t("menu.file_open"),         shortcut: "Ctrl+O", onClick: () => { close(); onOpenPlugin(); } },
        { label: t("menu.file_open_session"),                      onClick: () => { close(); onOpenSession(); } },
        { separator: true },
        { label: t("menu.file_save"),         shortcut: "Ctrl+S", onClick: onSave   ? () => { close(); onSave();   } : undefined, disabled: !pluginLoaded || loading },
        { label: t("menu.file_export"),       shortcut: "Ctrl+E", onClick: onExport ? () => { close(); onExport(); } : undefined, disabled: !pluginLoaded || loading },
        { separator: true },
        { label: t("menu.file_quit"), onClick: close },
      ],
    },
    {
      id: "edition", label: t("menu.edit"),
      items: [
        { label: t("menu.edit_select_all"),   shortcut: "Ctrl+A", disabled: true },
        { label: t("menu.edit_deselect_all"), disabled: true },
      ],
    },
    {
      id: "database", label: t("menu.database"),
      items: [
        { label: t("menu.db_manage"), onClick: () => { close(); onSettingsDb(); } },
        { separator: true },
        { label: t("menu.db_apply"), disabled: true },
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
