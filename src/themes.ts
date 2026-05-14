export type IconSetId = "minimal" | "material" | "classic";

// ── Couleurs des types d'enregistrement ──────────────────────────────────────

export const ALL_RECORD_TYPES = [
  "WEAP","ARMO","BOOK","QUST","NPC_","DIAL","INFO","MESG",
  "MISC","ALCH","PERK","CELL","WRLD","CONT","ACTI","FURN",
  "TERM","TMLM","LCTN","RACE","GMST","KYWD","FLOR","GBFM","SPEL",
] as const;

export const DEFAULT_RECORD_COLORS: Record<string, string> = {
  WEAP:"#f97316", ARMO:"#a78bfa", BOOK:"#34d399", QUST:"#fbbf24",
  NPC_:"#60a5fa", DIAL:"#fb7185", INFO:"#fb7185", MESG:"#e879f9",
  MISC:"#94a3b8", ALCH:"#4ade80", PERK:"#818cf8", CELL:"#38bdf8",
  WRLD:"#f472b6", CONT:"#facc15", ACTI:"#a3e635", FURN:"#fb923c",
  TERM:"#06b6d4", TMLM:"#0ea5e9", LCTN:"#f43f5e", RACE:"#d946ef",
  GMST:"#a16207", KYWD:"#7c3aed", FLOR:"#16a34a", GBFM:"#0284c7",
  SPEL:"#e879f9",
};

export interface ThemePreset {
  id:            string;
  name:          string;
  isDark:        boolean;
  preview:       string;
  vars:          Record<string, string>;
  isCustom?:     boolean;
  iconSet?:      IconSetId;
  recordColors?: Partial<Record<string, string>>;
}

export const ICON_SETS: Array<{ id: IconSetId; label: string; description: string }> = [
  { id: "minimal",  label: "Minimal",          description: "Icônes linéaires épurées" },
  { id: "material", label: "Material",         description: "Icônes remplies Material Design" },
  { id: "classic",  label: "Classique",        description: "Icônes style éditeur traditionnel" },
];

// ── Typographie — familles de polices disponibles ─────────────────────────────

export const FONT_FAMILIES: Record<string, string[]> = {
  "Sans-serif": ["System UI", "Arial", "Calibri", "Candara", "Segoe UI", "Tahoma", "Trebuchet MS", "Verdana"],
  "Serif":      ["Cambria", "Constantia", "Georgia", "Palatino Linotype", "Times New Roman"],
  "Monospace":  ["Cascadia Code", "Cascadia Mono", "Consolas", "Courier New", "Fira Code", "JetBrains Mono", "Lucida Console"],
};

/** Display name → full CSS font-family string */
export const FONT_CSS: Record<string, string> = {
  "System UI":         "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  "Arial":             "Arial, sans-serif",
  "Calibri":           "Calibri, sans-serif",
  "Candara":           "Candara, sans-serif",
  "Segoe UI":          "'Segoe UI', sans-serif",
  "Tahoma":            "Tahoma, sans-serif",
  "Trebuchet MS":      "'Trebuchet MS', sans-serif",
  "Verdana":           "Verdana, sans-serif",
  "Cambria":           "Cambria, serif",
  "Constantia":        "Constantia, serif",
  "Georgia":           "Georgia, serif",
  "Palatino Linotype": "'Palatino Linotype', serif",
  "Times New Roman":   "'Times New Roman', serif",
  "Cascadia Code":     "'Cascadia Code', 'Cascadia Mono', monospace",
  "Cascadia Mono":     "'Cascadia Mono', monospace",
  "Consolas":          "Consolas, monospace",
  "Courier New":       "'Courier New', monospace",
  "Fira Code":         "'Fira Code', monospace",
  "JetBrains Mono":    "'JetBrains Mono', monospace",
  "Lucida Console":    "'Lucida Console', monospace",
};

/** Configurable font zones: each pairs a family CSS variable with a size CSS variable */
export const FONT_ZONES: Array<{
  label:         string;
  familyVar:     string;
  sizeVar:       string;
  defaultFamily: string;
  defaultSize:   string;
}> = [
  { label: "Interface (menus, boutons)",  familyVar: "--font-ui",      sizeVar: "--fz-ui",    defaultFamily: "Segoe UI",      defaultSize: "11px" },
  { label: "Tableau (texte traduit)",     familyVar: "--font-content",  sizeVar: "--fz-table", defaultFamily: "Segoe UI",      defaultSize: "12px" },
  { label: "Monospace (IDs, codes)",      familyVar: "--font-mono",     sizeVar: "--fz-mono",  defaultFamily: "Cascadia Code", defaultSize: "11px" },
];

// ── Variables editable in settings ────────────────────────────────────────────

export const EDITABLE_VARS_LABELED: Array<{ key: string; label: string; group: string; type?: "color" | "text" }> = [
  // Structural zones
  { key: "--bg-menubar",      label: "Barre de menus",           group: "Structure" },
  { key: "--menubar-text",    label: "Texte barre de menus",     group: "Structure" },
  { key: "--bg-toolbar",      label: "Barre d'outils",           group: "Structure" },
  { key: "--bg-sidebar",      label: "Panneau latéral",          group: "Structure" },
  { key: "--bg-statusbar",    label: "Barre de statut",          group: "Structure" },
  // Content zones
  { key: "--bg-filter",       label: "Barre de filtres",         group: "Zones" },
  { key: "--bg-table-header", label: "En-têtes de tableau",      group: "Zones" },
  { key: "--bg-edit-panel",   label: "Panneau d'édition",        group: "Zones" },
  // General background
  { key: "--bg-primary",      label: "Fond principal",           group: "Fond" },
  { key: "--bg-card",         label: "Fond tableau / panneaux",  group: "Fond" },
  { key: "--bg-hover",        label: "Survol / inputs",          group: "Fond" },
  { key: "--bg-row-hover",    label: "Survol ligne tableau",     group: "Fond" },
  // Semantic colors
  { key: "--accent",          label: "Couleur d'accentuation",   group: "Couleurs" },
  { key: "--text-1",          label: "Texte principal",          group: "Couleurs" },
  { key: "--text-2",          label: "Texte secondaire",         group: "Couleurs" },
  { key: "--text-3",          label: "Texte discret",            group: "Couleurs" },
  { key: "--color-tag",        label: "Variables de jeu <…>",     group: "Couleurs" },
  { key: "--success",         label: "Succès",                   group: "Couleurs" },
  { key: "--warning",         label: "Avertissement",            group: "Couleurs" },
  { key: "--danger",          label: "Danger",                   group: "Couleurs" },
  // Typography (managed via the theme manager)
  { key: "--font-ui",         label: "Police interface",         group: "Typographie", type: "text" },
  { key: "--font-mono",       label: "Police monospace (IDs)",   group: "Typographie", type: "text" },
  { key: "--font-content",    label: "Police texte traduit",     group: "Typographie", type: "text" },
  { key: "--fz-ui",           label: "Taille interface",         group: "Typographie", type: "text" },
  { key: "--fz-table",        label: "Taille tableau",           group: "Typographie", type: "text" },
  { key: "--fz-mono",         label: "Taille monospace",         group: "Typographie", type: "text" },
];

// Backward compatibility alias
export const EDITABLE_VARS = EDITABLE_VARS_LABELED.map(({ key }) => ({ key }));

// ── Theme presets ─────────────────────────────────────────────────────────────

export const THEME_PRESETS: ThemePreset[] = [
  // ── Dark (default) ────────────────────────────────────────────────────────
  {
    id: "dark", name: "Sombre", isDark: true, preview: "#3b82f6",
    vars: {
      "--bg-menubar":      "#060a14",
      "--menubar-text":    "#5a7090",
      "--bg-toolbar":      "#0b1425",
      "--bg-sidebar":      "#0c1020",
      "--bg-statusbar":    "#060a14",
      "--bg-filter":       "#0e1828",
      "--bg-table-header": "#060b18",
      "--bg-edit-panel":   "#111c32",
      "--bg-primary":      "#08080f",
      "--bg-card":         "#0d1117",
      "--bg-hover":        "#111827",
      "--bg-row-hover":    "#10141f",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#3b82f6",
      "--accent-hover": "#2563eb",
      "--accent-dim":   "rgba(59,130,246,0.12)",
      "--text-1": "#f1f5f9", "--text-2": "#94a3b8", "--text-3": "#64748b",
      "--color-tag": "#c084fc",
      "--success": "#22c55e", "--warning": "#f59e0b", "--danger": "#ef4444", "--info": "#60a5fa",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Clair ─────────────────────────────────────────────────────────────────
  {
    id: "light", name: "Clair", isDark: false, preview: "#2563eb",
    vars: {
      "--bg-menubar":      "#1e293b",
      "--menubar-text":    "#94a3b8",
      "--bg-toolbar":      "#f0f4f8",
      "--bg-sidebar":      "#e8edf5",
      "--bg-statusbar":    "#1e293b",
      "--bg-filter":       "#e4ecf8",
      "--bg-table-header": "#dce5f0",
      "--bg-edit-panel":   "#f0f4ff",
      "--bg-primary":      "#f1f5f9",
      "--bg-card":         "#ffffff",
      "--bg-hover":        "#e2e8f0",
      "--bg-row-hover":    "#f0f4f8",
      "--border":            "rgba(0,0,0,0.08)",
      "--border-light":      "rgba(0,0,0,0.14)",
      "--accent":       "#2563eb",
      "--accent-hover": "#1d4ed8",
      "--accent-dim":   "rgba(37,99,235,0.10)",
      "--text-1": "#0f172a", "--text-2": "#475569", "--text-3": "#94a3b8",
      "--color-tag": "#9333ea",
      "--success": "#16a34a", "--warning": "#d97706", "--danger": "#dc2626", "--info": "#2563eb",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Nord ──────────────────────────────────────────────────────────────────
  {
    id: "nord", name: "Nord", isDark: true, preview: "#88c0d0",
    vars: {
      "--bg-menubar":      "#191e28",
      "--menubar-text":    "#607090",
      "--bg-toolbar":      "#1e2736",
      "--bg-sidebar":      "#232d3c",
      "--bg-statusbar":    "#191e28",
      "--bg-filter":       "#283344",
      "--bg-table-header": "#1a2030",
      "--bg-edit-panel":   "#313d50",
      "--bg-primary":      "#242933",
      "--bg-card":         "#2e3440",
      "--bg-hover":        "#3b4252",
      "--bg-row-hover":    "#323b4a",
      "--border":            "rgba(255,255,255,0.08)",
      "--border-light":      "rgba(255,255,255,0.14)",
      "--accent":       "#88c0d0",
      "--accent-hover": "#81a1c1",
      "--accent-dim":   "rgba(136,192,208,0.15)",
      "--text-1": "#eceff4", "--text-2": "#d8dee9", "--text-3": "#7c8fa6",
      "--color-tag": "#b48ead",
      "--success": "#a3be8c", "--warning": "#ebcb8b", "--danger": "#bf616a", "--info": "#88c0d0",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Dracula ───────────────────────────────────────────────────────────────
  {
    id: "dracula", name: "Dracula", isDark: true, preview: "#bd93f9",
    vars: {
      "--bg-menubar":      "#141520",
      "--menubar-text":    "#605878",
      "--bg-toolbar":      "#1c1e2e",
      "--bg-sidebar":      "#202238",
      "--bg-statusbar":    "#141520",
      "--bg-filter":       "#2a2c40",
      "--bg-table-header": "#171826",
      "--bg-edit-panel":   "#303248",
      "--bg-primary":      "#1e1f29",
      "--bg-card":         "#282a36",
      "--bg-hover":        "#383a4a",
      "--bg-row-hover":    "#303240",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#bd93f9",
      "--accent-hover": "#a779f7",
      "--accent-dim":   "rgba(189,147,249,0.14)",
      "--text-1": "#f8f8f2", "--text-2": "#9da5c4", "--text-3": "#6272a4",
      "--color-tag": "#ff79c6",
      "--success": "#50fa7b", "--warning": "#ffb86c", "--danger": "#ff5555", "--info": "#8be9fd",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Catppuccin ────────────────────────────────────────────────────────────
  {
    id: "catppuccin", name: "Catppuccin", isDark: true, preview: "#cba6f7",
    vars: {
      "--bg-menubar":      "#131320",
      "--menubar-text":    "#5a5a80",
      "--bg-toolbar":      "#181826",
      "--bg-sidebar":      "#1c1c2c",
      "--bg-statusbar":    "#131320",
      "--bg-filter":       "#1e1e32",
      "--bg-table-header": "#111120",
      "--bg-edit-panel":   "#24243c",
      "--bg-primary":      "#1e1e2e",
      "--bg-card":         "#181825",
      "--bg-hover":        "#313244",
      "--bg-row-hover":    "#222233",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#cba6f7",
      "--accent-hover": "#b4a1e3",
      "--accent-dim":   "rgba(203,166,247,0.12)",
      "--text-1": "#cdd6f4", "--text-2": "#a6adc8", "--text-3": "#7f849c",
      "--color-tag": "#f5c2e7",
      "--success": "#a6e3a1", "--warning": "#fab387", "--danger": "#f38ba8", "--info": "#89dceb",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Ocean ─────────────────────────────────────────────────────────────────
  {
    id: "ocean", name: "Océan", isDark: true, preview: "#06b6d4",
    vars: {
      "--bg-menubar":      "#070e18",
      "--menubar-text":    "#406080",
      "--bg-toolbar":      "#0e1e30",
      "--bg-sidebar":      "#101f30",
      "--bg-statusbar":    "#070e18",
      "--bg-filter":       "#112440",
      "--bg-table-header": "#081428",
      "--bg-edit-panel":   "#152e50",
      "--bg-primary":      "#0c1821",
      "--bg-card":         "#13243a",
      "--bg-hover":        "#1a3050",
      "--bg-row-hover":    "#162c46",
      "--border":            "rgba(255,255,255,0.08)",
      "--border-light":      "rgba(255,255,255,0.14)",
      "--accent":       "#06b6d4",
      "--accent-hover": "#0891b2",
      "--accent-dim":   "rgba(6,182,212,0.14)",
      "--text-1": "#e0f2fe", "--text-2": "#7dd3fc", "--text-3": "#2d6fa0",
      "--color-tag": "#e879f9",
      "--success": "#34d399", "--warning": "#fbbf24", "--danger": "#f87171", "--info": "#38bdf8",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Forest ────────────────────────────────────────────────────────────────
  {
    id: "forest", name: "Forêt", isDark: true, preview: "#4ade80",
    vars: {
      "--bg-menubar":      "#080e08",
      "--menubar-text":    "#406040",
      "--bg-toolbar":      "#0f1f0f",
      "--bg-sidebar":      "#111f11",
      "--bg-statusbar":    "#080e08",
      "--bg-filter":       "#152815",
      "--bg-table-header": "#091409",
      "--bg-edit-panel":   "#1a2e1a",
      "--bg-primary":      "#0d1f0d",
      "--bg-card":         "#122012",
      "--bg-hover":        "#1a341a",
      "--bg-row-hover":    "#162a16",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#4ade80",
      "--accent-hover": "#22c55e",
      "--accent-dim":   "rgba(74,222,128,0.14)",
      "--text-1": "#dcfce7", "--text-2": "#86efac", "--text-3": "#4b7255",
      "--color-tag": "#a78bfa",
      "--success": "#86efac", "--warning": "#fde047", "--danger": "#f87171", "--info": "#34d399",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Tokyo Night ───────────────────────────────────────────────────────────
  {
    id: "tokyo-night", name: "Tokyo Night", isDark: true, preview: "#7aa2f7",
    vars: {
      "--bg-menubar":      "#0e0f18",
      "--menubar-text":    "#505070",
      "--bg-toolbar":      "#141626",
      "--bg-sidebar":      "#16182a",
      "--bg-statusbar":    "#0e0f18",
      "--bg-filter":       "#1a1d32",
      "--bg-table-header": "#0f1020",
      "--bg-edit-panel":   "#20223a",
      "--bg-primary":      "#1a1b26",
      "--bg-card":         "#16161e",
      "--bg-hover":        "#24283b",
      "--bg-row-hover":    "#1c1e2c",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#7aa2f7",
      "--accent-hover": "#5d87e8",
      "--accent-dim":   "rgba(122,162,247,0.14)",
      "--text-1": "#c0caf5", "--text-2": "#9aa5ce", "--text-3": "#565f89",
      "--color-tag": "#bb9af7",
      "--success": "#9ece6a", "--warning": "#e0af68", "--danger": "#f7768e", "--info": "#7dcfff",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Solarized ─────────────────────────────────────────────────────────────
  {
    id: "solarized", name: "Solarized", isDark: true, preview: "#268bd2",
    vars: {
      "--bg-menubar":      "#001820",
      "--menubar-text":    "#486878",
      "--bg-toolbar":      "#052e3e",
      "--bg-sidebar":      "#063340",
      "--bg-statusbar":    "#001820",
      "--bg-filter":       "#093a4a",
      "--bg-table-header": "#001e2c",
      "--bg-edit-panel":   "#0e4458",
      "--bg-primary":      "#002b36",
      "--bg-card":         "#073642",
      "--bg-hover":        "#0e4856",
      "--bg-row-hover":    "#0b3f4e",
      "--border":            "rgba(255,255,255,0.08)",
      "--border-light":      "rgba(255,255,255,0.14)",
      "--accent":       "#268bd2",
      "--accent-hover": "#1a6fa8",
      "--accent-dim":   "rgba(38,139,210,0.14)",
      "--text-1": "#fdf6e3", "--text-2": "#93a1a1", "--text-3": "#586e75",
      "--color-tag": "#d33682",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--info": "#2aa198",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Gruvbox ───────────────────────────────────────────────────────────────
  {
    id: "gruvbox", name: "Gruvbox", isDark: true, preview: "#fabd2f",
    vars: {
      "--bg-menubar":      "#131516",
      "--menubar-text":    "#706050",
      "--bg-toolbar":      "#1c1e1e",
      "--bg-sidebar":      "#222422",
      "--bg-statusbar":    "#131516",
      "--bg-filter":       "#242824",
      "--bg-table-header": "#161818",
      "--bg-edit-panel":   "#2e3030",
      "--bg-primary":      "#1d2021",
      "--bg-card":         "#282828",
      "--bg-hover":        "#3c3836",
      "--bg-row-hover":    "#2e2c2a",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#fabd2f",
      "--accent-hover": "#e8a020",
      "--accent-dim":   "rgba(250,189,47,0.14)",
      "--text-1": "#ebdbb2", "--text-2": "#d5c4a1", "--text-3": "#928374",
      "--color-tag": "#d3869b",
      "--success": "#b8bb26", "--warning": "#fe8019", "--danger": "#fb4934", "--info": "#83a598",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Monokai ───────────────────────────────────────────────────────────────
  {
    id: "monokai", name: "Monokai", isDark: true, preview: "#a6e22e",
    vars: {
      "--bg-menubar":      "#111111",
      "--menubar-text":    "#706060",
      "--bg-toolbar":      "#1a1a18",
      "--bg-sidebar":      "#1e1e1c",
      "--bg-statusbar":    "#111111",
      "--bg-filter":       "#252520",
      "--bg-table-header": "#151512",
      "--bg-edit-panel":   "#2e2d28",
      "--bg-primary":      "#1c1c1c",
      "--bg-card":         "#272822",
      "--bg-hover":        "#383830",
      "--bg-row-hover":    "#2c2c26",
      "--border":            "rgba(255,255,255,0.08)",
      "--border-light":      "rgba(255,255,255,0.14)",
      "--accent":       "#a6e22e",
      "--accent-hover": "#8ec219",
      "--accent-dim":   "rgba(166,226,46,0.14)",
      "--text-1": "#f8f8f2", "--text-2": "#cfcfc2", "--text-3": "#75715e",
      "--color-tag": "#ae81ff",
      "--success": "#a6e22e", "--warning": "#e6db74", "--danger": "#f92672", "--info": "#66d9e8",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Rose Pine ─────────────────────────────────────────────────────────────
  {
    id: "rose-pine", name: "Rose Pine", isDark: true, preview: "#c4a7e7",
    vars: {
      "--bg-menubar":      "#100e1a",
      "--menubar-text":    "#605870",
      "--bg-toolbar":      "#171428",
      "--bg-sidebar":      "#1a172a",
      "--bg-statusbar":    "#100e1a",
      "--bg-filter":       "#211e34",
      "--bg-table-header": "#131028",
      "--bg-edit-panel":   "#272440",
      "--bg-primary":      "#191724",
      "--bg-card":         "#1f1d2e",
      "--bg-hover":        "#26233a",
      "--bg-row-hover":    "#232034",
      "--border":            "rgba(255,255,255,0.07)",
      "--border-light":      "rgba(255,255,255,0.12)",
      "--accent":       "#c4a7e7",
      "--accent-hover": "#b08fd4",
      "--accent-dim":   "rgba(196,167,231,0.14)",
      "--text-1": "#e0def4", "--text-2": "#908caa", "--text-3": "#6e6a86",
      "--color-tag": "#eb6f92",
      "--success": "#31748f", "--warning": "#f6c177", "--danger": "#eb6f92", "--info": "#9ccfd8",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },

  // ── Solarized Clair ───────────────────────────────────────────────────────
  {
    id: "solarized-light", name: "Solarized Clair", isDark: false, preview: "#268bd2",
    vars: {
      "--bg-menubar":      "#073642",
      "--menubar-text":    "#839496",
      "--bg-toolbar":      "#e5dfc8",
      "--bg-sidebar":      "#e0dac3",
      "--bg-statusbar":    "#073642",
      "--bg-filter":       "#ddd8c0",
      "--bg-table-header": "#e8e2cc",
      "--bg-edit-panel":   "#f5f0de",
      "--bg-primary":      "#fdf6e3",
      "--bg-card":         "#eee8d5",
      "--bg-hover":        "#ddd8c5",
      "--bg-row-hover":    "#e6e0cc",
      "--border":            "rgba(0,0,0,0.08)",
      "--border-light":      "rgba(0,0,0,0.14)",
      "--accent":       "#268bd2",
      "--accent-hover": "#1a6fa8",
      "--accent-dim":   "rgba(38,139,210,0.10)",
      "--text-1": "#073642", "--text-2": "#586e75", "--text-3": "#93a1a1",
      "--color-tag": "#d33682",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--info": "#2aa198",
      "--font-ui":      "'Segoe UI', sans-serif",
      "--font-mono":    "'Cascadia Code', 'Cascadia Mono', monospace",
      "--font-content": "'Segoe UI', sans-serif",
      "--fz-ui":    "11px",
      "--fz-table": "12px",
      "--fz-mono":  "11px",
    },
  },
];

// ── Apply a theme ─────────────────────────────────────────────────────────────

export function applyTheme(presetId: string, customVars: Record<string, string> = {}) {
  const preset = THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0];
  const merged = { ...preset.vars, ...customVars };
  const root   = document.documentElement;
  Object.entries(merged).forEach(([key, val]) => root.style.setProperty(key, val));
}
