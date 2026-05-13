<p align="center">
  <img src="src-tauri/icons/icon.ico" width="128" alt="BGS Translator" />
</p>

<h1 align="center">BGS Translator</h1>

<p align="center">
  <em>Mod Translation Tool for Bethesda Games</em>
</p>

<p align="center">
<!-- BADGES:START -->
<img alt="Release" src="https://img.shields.io/github/v/release/LordLuffy/BGS-Translator?style=for-the-badge" />
<img alt="License" src="https://img.shields.io/badge/License-GPL--3.0-F4C430?style=for-the-badge" />
<img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows11&logoColor=white" />
<!-- BADGES:END -->
</p>

<p align="center">
<!-- STACK:START -->
<img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.10.1-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" />
<img alt="Rust" src="https://img.shields.io/badge/Rust-stable-000000?style=for-the-badge&logo=rust" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img alt="React" src="https://img.shields.io/badge/React-18.3.1-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
<!-- STACK:END -->
</p>

---

Desktop application for translating Bethesda game mods (`.esp`/`.esm`), built with **Tauri 2**, **Rust** and **React/TypeScript**. Supports Starfield, and is designed to support other BGS titles.

---

## 1. Prerequisites

### Development tools

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable | `rustup.rs` |
| Node.js | 24+ | `nodejs.org` |
| Tauri CLI | v2 | `cargo install tauri-cli` |

---

## 2. Project Structure

```
BGS-Translator/
├── .github/
│   └── workflows/
│       └── release.yml               # CI/CD — automated build + release
├── databases/                        # Bundled translation databases (.bgt)
│   ├── BDD_Morrowind_EN-FR.bgt
│   ├── BDD_Oblivion_EN-FR.bgt
│   └── BDD_Starfield_EN-FR.bgt
├── src/                              # React/TypeScript frontend
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MenuBar.tsx           # Top menu bar (File, Edit, View…)
│   │   │   ├── Sidebar.tsx           # Left sidebar (groups / database list)
│   │   │   ├── ToolBar.tsx           # Quick-action toolbar
│   │   │   └── TopBar.tsx            # Window title + controls
│   │   ├── settings/
│   │   │   ├── SettingsModal.tsx     # Settings dialog
│   │   │   └── SettingsPanel.tsx     # Settings content (theme, shortcuts, i18n…)
│   │   ├── shared/
│   │   │   ├── ChangelogModal.tsx    # Release notes dialog
│   │   │   ├── LogPanel.tsx          # Activity / debug log panel
│   │   │   ├── UpdateBanner.tsx      # Non-intrusive update notification
│   │   │   └── UpdateModal.tsx       # Full update dialog (release notes + install)
│   │   ├── themes/
│   │   │   └── ThemeManagerModal.tsx # Theme picker + colour customiser
│   │   └── translation/
│   │       ├── BulkActionBar.tsx     # Bulk status change on selected entries
│   │       ├── EditPanel.tsx         # Right-side entry editor
│   │       ├── FilterBar.tsx         # Status / record-type filters + search
│   │       ├── GroupPanel.tsx        # Record-type group view with per-group stats
│   │       ├── StatusBar.tsx         # Bottom bar (progress, counts, session info)
│   │       └── TranslationTable.tsx  # Main sortable translation table
│   ├── hooks/
│   │   ├── useLayout.ts              # Panel visibility / layout state
│   │   ├── useLogs.ts                # Log panel state
│   │   ├── usePlugin.ts              # Plugin loading + translation session
│   │   └── useSettings.ts            # Persistent settings (localStorage)
│   ├── i18n/
│   │   ├── index.ts                  # i18next configuration
│   │   └── locales/
│   │       ├── en.json
│   │       └── fr.json
│   ├── themes.ts                     # 13 theme definitions + typography config
│   └── types.ts                      # Shared TypeScript types
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── commands.rs               # Top-level Tauri invoke handlers
│   │   ├── lib.rs                    # Plugin registration
│   │   ├── main.rs                   # Entry point
│   │   ├── updater.rs                # Auto-update commands
│   │   ├── database/
│   │   │   ├── commands.rs           # Tauri commands for database operations
│   │   │   ├── format.rs             # .bgt binary format (bincode + zstd)
│   │   │   ├── mod.rs
│   │   │   ├── store.rs              # In-memory database store
│   │   │   └── types.rs              # DbEntry, DbInfo, ApplyResult
│   │   ├── parser/
│   │   │   ├── error.rs              # ParseError type
│   │   │   ├── group.rs              # GRUP header parsing
│   │   │   ├── mod.rs
│   │   │   ├── plugin.rs             # Top-level plugin loader
│   │   │   ├── record.rs             # Record header + decompression
│   │   │   ├── strings_file.rs       # .strings / .dlstrings / .ilstrings loader
│   │   │   ├── subrecord.rs          # Subrecord iteration
│   │   │   └── types.rs              # Translatable record/subrecord definitions
│   │   └── translation/
│   │       ├── entry.rs              # TranslationEntry + StringSource
│   │       ├── mod.rs
│   │       ├── session.rs            # TranslationSession (loaded plugin state)
│   │       └── writer.rs             # Rewrite .esp/.esm with translated strings
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │   └── icon.ico
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Backend | Rust (Tauri 2) |
| Binary parsing | `binrw` — structured derive macros for ESP/ESM records |
| Compression | `flate2` (zlib — compressed records) · `zstd` (database) |
| Encoding | `encoding_rs` — Windows-1252 / UTF-8 for legacy plugins |
| Database format | `bincode` + zstd — custom `.bgt` binary format |
| Styling | Tailwind CSS (utility classes) + CSS variables (themes) |
| i18n | `i18next` + `react-i18next` |
| Updates | `tauri-plugin-updater` + GitHub Releases |

---

## 4. Build

### Development

```bash
# Install Node dependencies
npm install

# Start in dev mode (hot-reload)
npm run tauri dev
```

The window opens at `http://localhost:1420`. Edit files under `src/` for instant hot-reload.

### Production build

```bash
npm install
npm run tauri build
```

The installer and executable are output to `src-tauri/target/release/bundle/`.

---

## 5. Features

### Plugin Parser
- Opens Bethesda `.esp`/`.esm` plugin files (binary format, little-endian)
- Parses GRUP (group) / record / subrecord hierarchy
- **Compressed records** — automatic zlib decompression (flag `0x00040000`)
- **Localized plugins** — strings stored externally in `.strings`, `.dlstrings`, `.ilstrings` files; resolved transparently at load time
- **Non-localized plugins** — strings read inline from subrecords
- **Legacy encoding** — Windows-1252 to UTF-8 conversion for older mods
- Supported record types: `ACTI` `ALCH` `AMMO` `ARMO` `BOOK` `CELL` `CLAS` `CONT` `DIAL` `DOOR` `ENCH` `EXPL` `FACT` `FLOR` `FURN` `INFO` `INGR` `KEYM` `LCTN` `LIGH` `MESG` `MGEF` `MISC` `NOTE` `NPC_` `PERK` `PROJ` `QUST` `RACE` `SCEN` `SLGM` `SPEL` `STAT` `TERM` `WEAP` `WRLD`
- Extracted subrecords: `FULL` `DESC` `NAM1` `NNAM` `RNAM` `CNAM` `SHRT` `EPFD` `ITXT` `DNAM` `TNAM` `INAM`

### Translation Table
- Displays all translatable entries: Form ID, record type, subrecord, original string, translation, status
- **Status system**: `untranslated` / `pending` / `validated` / `ignored`
- Sortable columns (Form ID, record type, subrecord, original, translated, status)
- Filter bar: filter by status and/or record type
- Full-text search across original and translated strings

### Edit Panel
- Side panel for editing one entry at a time
- Keyboard navigation between entries (configurable shortcuts)
- One-click copy of original text
- Status change from the edit panel

### Group View
- Sidebar showing entries grouped by record type
- Per-group progress stats: total / validated / pending / untranslated / ignored

### Bulk Actions
- Select multiple entries and apply a status change in one click

### Translation Database (`.bgt`)
- Custom binary format (bincode + zstd) for storing translation pairs
- Each entry stores: original, translated, record type, subrecord type, editor ID
- **Auto-apply**: match entries from the database against the open plugin and apply translations automatically — reports matched / total counts
- Bundled databases: Morrowind EN→FR, Oblivion EN→FR, Starfield EN→FR
- Read-only protection for bundled databases

### Interface
- 13 built-in themes: Sombre, Clair, Nord, Dracula, Catppuccin, Océan, Forêt, Tokyo Night, Solarized, Gruvbox, Monokai, Rose Pine, Solarized Clair
- Full colour customisation per zone (menus, toolbar, sidebar, table, edit panel…)
- Per-zone typography: choose font family (sans-serif, serif, monospace) and size independently for UI, table content, and monospace (IDs)
- 3 icon sets: Minimal, Material, Classic
- Record-type colour coding (customisable per type)
- Interface language: English, French (auto-detected from system locale)

### Keyboard Shortcuts
- Configurable shortcuts for: next/previous entry, copy original, paste translation, validate entry
- Defaults: `↓`/`↑` to navigate, `Ctrl+Enter` to validate

### Log Panel
- In-app activity log for parser events, database operations, and errors

### Updates
- Automatic check for new versions via GitHub Releases
- Non-intrusive notification banner with release notes
- One-click install + automatic restart

---

## 6. Supported Games

| Game | Plugin format | Localized strings | Status |
|------|--------------|------------------|--------|
| Starfield | `.esp` / `.esm` / `.esl` | `.strings` / `.dlstrings` / `.ilstrings` | Supported |
| Skyrim / SSE | `.esp` / `.esm` | `.strings` / `.dlstrings` / `.ilstrings` | Planned |
| Fallout 4 | `.esp` / `.esm` | `.strings` / `.dlstrings` / `.ilstrings` | Planned |
| Oblivion / Morrowind | `.esp` / `.esm` | Inline (non-localized) | Planned |

---
