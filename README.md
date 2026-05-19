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
<img alt="License" src="https://img.shields.io/badge/License-MPL--2.0-F4C430?style=for-the-badge" />
<img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4?style=for-the-badge" />
<!-- BADGES:END -->
</p>

<p align="center">
<!-- STACK:START -->
<img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" />
<img alt="Rust" src="https://img.shields.io/badge/Rust-stable-000000?style=for-the-badge&logo=rust&logoColor=white" />
<img alt="C++" src="https://img.shields.io/badge/C++-17-00599C?style=for-the-badge&logo=cplusplus&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img alt="React" src="https://img.shields.io/badge/React-18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/Vite-8.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
<!-- STACK:END -->
</p>

---

Cross-platform desktop application for translating Bethesda game mods (`.esp` / `.esm` / `.esl`), built with **Tauri 2**, **Rust** and **React / TypeScript**. Fully supports Starfield and is designed to be extended to other BGS titles.

---

## 1. Prerequisites

### Development tools

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable | [rustup.rs](https://rustup.rs) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| Tauri CLI | v2 | `cargo install tauri-cli` |

### Spell check (optional — Windows)

The spell check feature requires [Nuspell](https://nuspell.github.io/) via [vcpkg](https://vcpkg.io). If not installed, the app builds and runs normally — spell check commands return a graceful error.

```powershell
# Install vcpkg (if not already present)
git clone https://github.com/microsoft/vcpkg C:\vcpkg
C:\vcpkg\bootstrap-vcpkg.bat

# Install nuspell (static MD runtime — required for Tauri)
C:\vcpkg\vcpkg.exe install nuspell:x64-windows-static-md

# Set environment variables (add to your profile for persistence)
$env:VCPKG_ROOT       = "C:\vcpkg"
$env:VCPKGRS_TRIPLET  = "x64-windows-static-md"
$env:VCPKGRS_DYNAMIC  = "0"
```

> **Linux / macOS**: `sudo apt install libnuspell-dev` / `brew install nuspell` — detected automatically via `pkg-config`.

---

## 2. Project Structure

```
BGS-Translator/
├── .github/
│   └── workflows/
│       └── release.yml               # CI/CD — automated build + release (Windows, vcpkg nuspell)
├── databases/                        # Bundled translation databases (.bgt)
│   ├── BDD_Morrowind_EN-FR.bgt
│   ├── BDD_Oblivion_EN-FR.bgt
│   └── BDD_Starfield_EN-FR.bgt
├── src/                              # React/TypeScript frontend
│   ├── components/
│   │   ├── compare/
│   │   │   ├── CompareModal.tsx      # Plugin diff modal (file pickers, actions, filters)
│   │   │   ├── DiffStatsBar.tsx      # Added / removed / modified / recoverable counters
│   │   │   └── DiffTable.tsx         # Virtualised diff table with sort + resizable columns
│   │   ├── layout/
│   │   │   ├── MenuBar.tsx           # Top menu bar (File, Edit, View…)
│   │   │   ├── Sidebar.tsx           # Left sidebar (groups / database list)
│   │   │   ├── ToolBar.tsx           # Quick-action toolbar
│   │   │   └── TopBar.tsx            # Window title + controls
│   │   ├── settings/
│   │   │   └── SettingsModal.tsx     # Settings dialog (tabs: General, Database, Auto Translation, Spell Check, Shortcuts, Theme, System)
│   │   ├── shared/
│   │   │   ├── ChangelogModal.tsx         # Release notes dialog
│   │   │   ├── ConvertToBgtModal.tsx      # Floating draggable database converter (any format → .bgt/.bgtx)
│   │   │   ├── DbManagerModal.tsx         # Floating database manager (browse, filter, edit, find & replace)
│   │   │   ├── GlobalFindReplaceModal.tsx # Floating global find & replace window
│   │   │   ├── LoadingOverlay.tsx         # Centered spinner overlay shown during plugin loading
│   │   │   ├── LogPanel.tsx               # Activity / debug log panel
│   │   │   ├── NotificationBanner.tsx     # Inline success/error notification bar
│   │   │   ├── ProviderBadge.tsx          # Letter badge component for provider buttons (D/Ol/Cl/…)
│   │   │   ├── SessionPickerModal.tsx     # Session selection dialog
│   │   │   ├── UpdateBanner.tsx           # Non-intrusive update notification
│   │   │   └── UpdateModal.tsx            # Full update dialog (release notes + install)
│   │   ├── themes/
│   │   │   └── ThemeManagerModal.tsx # Theme picker + colour customiser
│   │   └── translation/
│   │       ├── BulkActionBar.tsx     # Bulk status change + fuzzy apply on selected entries
│   │       ├── EditPanel.tsx         # Right-side entry editor (incl. spell error overlay + fuzzy bandeau)
│   │       ├── FilterBar.tsx         # Status / record-type / fuzzy-only filters + search
│   │       ├── GroupPanel.tsx        # Record-type group view with per-group stats
│   │       ├── StatusBar.tsx         # Bottom bar (progress, counts, session info)
│   │       └── TranslationTable.tsx  # Main sortable translation table (virtualised)
│   ├── hooks/
│   │   ├── useLayout.ts              # Panel visibility / layout state
│   │   ├── useLogs.ts                # Log panel state
│   │   ├── usePersonalDb.ts          # Personal database (.bgtx) commands wrapper
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
│   ├── build.rs                      # Build script — nuspell detection (vcpkg / pkg-config)
│   ├── src/
│   │   ├── commands.rs               # Top-level Tauri invoke handlers
│   │   ├── lib.rs                    # Plugin registration
│   │   ├── main.rs                   # Entry point
│   │   ├── updater.rs                # Auto-update commands
│   │   ├── database/
│   │   │   ├── commands.rs           # Tauri commands for reference database operations
│   │   │   ├── format.rs             # .bgt v2 binary format (bincode + zstd, form_id per entry)
│   │   │   ├── mod.rs
│   │   │   ├── personal_commands.rs  # Tauri commands for personal database (.bgtx)
│   │   │   ├── personal_format.rs    # .bgtx binary format (magic + zstd + bincode)
│   │   │   ├── personal_store.rs     # PersonalDb dual-index store (ID + text)
│   │   │   ├── store.rs              # In-memory reference database store (3-level AHashMap index)
│   │   │   └── types.rs              # DbEntry, DbInfo, PersonalDbEntry, PersonalDbInfo, EntryUpdate…
│   │   ├── formats/
│   │   │   ├── mod.rs
│   │   │   ├── xtranslator_xml.rs    # xTranslator XML import/export
│   │   │   ├── esptranslator_xml.rs  # ESP-ESM Translator XML import/export
│   │   │   └── session_csv.rs        # CSV import/export
│   │   ├── parser/
│   │   │   ├── error.rs              # ParseError type
│   │   │   ├── group.rs              # GRUP header parsing
│   │   │   ├── mod.rs
│   │   │   ├── archive.rs            # BA2 archive reader (GNRL v1/v2, GNMIP) + entry metadata extractor
│   │   │   ├── plugin.rs             # Top-level plugin loader (dual-resolver: EN + target lang)
│   │   │   ├── record.rs             # Record header + decompression
│   │   │   ├── strings_file.rs       # .strings / .dlstrings / .ilstrings loader
│   │   │   ├── strings_writer.rs     # Strings file writer (loose files + BA2 packing)
│   │   │   ├── subrecord.rs          # Subrecord iteration
│   │   │   └── types.rs              # Translatable record/subrecord definitions
│   │   ├── compare/
│   │   │   ├── mod.rs                # Diff algorithm — two-phase (stats + full records)
│   │   │   └── commands.rs           # Tauri commands: check_plugin_diff_cmd, compute_plugin_diff_cmd
│   │   ├── fuzzy/
│   │   │   ├── mod.rs                # TextIndex + two-algorithm similarity engine (Jaro-Winkler / Levenshtein)
│   │   │   └── commands.rs           # Tauri commands: get_fuzzy_matches_cmd, get_fuzzy_match_single_cmd
│   │   ├── spellcheck/
│   │   │   ├── mod.rs                # FFI bindings + safe Spellchecker wrapper
│   │   │   ├── commands.rs           # Tauri commands (list/download/delete/check/suggest)
│   │   │   ├── wrapper.cpp           # C++17 shim exposing nuspell via C ABI
│   │   │   └── wrapper.h             # C header for the shim
│   │   └── translation/
│   │       ├── entry.rs              # TranslationEntry + StringSource
│   │       ├── mod.rs
│   │       ├── session.rs            # TranslationSession (save/load/list/delete)
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

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 18 + TypeScript 5 | Vite 8 dev server, hot-reload |
| Backend | Rust stable (Tauri 2) | `serde` / `serde_json`, `tokio` async runtime |
| C++ interop | C++17 via `cc` crate | Nuspell shim (`wrapper.cpp`) compiled at build time |
| Binary parsing | `binrw` 0.14 | Derive macros for ESP/ESM record structures |
| Compression | `flate2` (zlib) · `zstd` 0.13 | Compressed records · database compression |
| Encoding | `encoding_rs` 0.8 | Windows-1252 → UTF-8 for legacy plugins |
| Database format | `bincode` 1 + zstd | Custom `.bgt` (reference) and `.bgtx` (personal) binary formats |
| HTTP client | `reqwest` 0.12 (rustls-tls) | Dictionary downloads + AI provider API calls (Ollama, Claude, Cohere, OpenAI…) — no OpenSSL dependency |
| Fuzzy matching | `strsim` 0.11 · `rayon` 1 | Jaro-Winkler (short strings) + Levenshtein (long strings); parallel bulk scan |
| Spell check | [Nuspell](https://nuspell.github.io/) 5.x | C ABI wrapper · ICU · 47 languages |
| Virtualisation | `@tanstack/react-virtual` 3 | Windowed rendering for large entry lists |
| Styling | Tailwind CSS 3 + CSS variables | 13 built-in themes, full colour customisation |
| i18n | `i18next` 25 + `react-i18next` 16 | EN / FR, auto-detected from system locale |
| Updates | `tauri-plugin-updater` 2 | GitHub Releases, one-click install |
| Logging | `tauri-plugin-log` 2 | File + in-app log panel, runtime debug toggle |

### Build dependencies (Rust)

| Crate | Role |
|-------|------|
| `tauri-build` 2 | Code-gen for Tauri capabilities |
| `cc` 1 | Compile `wrapper.cpp` (C++17 nuspell shim) |
| `vcpkg` 0.2 | Locate nuspell/ICU on Windows |
| `pkg-config` 0.3 | Locate nuspell on Linux / macOS |

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

### Spell check — build behaviour

| Condition | Build result |
|-----------|-------------|
| `VCPKG_ROOT` set + nuspell installed (Windows) | Nuspell compiled in — all spell check commands active |
| `libnuspell-dev` present (Linux) | Same |
| `nuspell` brew formula present (macOS) | Same |
| Library not found | Build succeeds with a warning; spell check commands return a descriptive error at runtime |

---

## 5. Features

### Plugin Parser
- Opens Bethesda `.esp` / `.esm` / `.esl` plugin files (binary format, little-endian)
- **Standalone strings file import** — open a raw `.strings`, `.dlstrings`, or `.ilstrings` file directly (toolbar 📄 button or File menu); strings are displayed in the translation table exactly like a localized plugin; the language suffix is automatically stripped from the filename to derive the plugin stem (e.g. `Starfield_en.strings` → stem `Starfield`)
- Parses GRUP (group) / record / subrecord hierarchy
- **Compressed records** — automatic zlib decompression (flag `0x00040000`)
- **Localized plugins** — strings stored externally in `.strings`, `.dlstrings`, `.ilstrings` files; resolved transparently at load time via a **dual-resolver** (English source + target language)
- **Non-localized plugins** — strings read inline from subrecords
- **Legacy encoding** — Windows-1252 to UTF-8 conversion for older mods
- **BA2 archive support** — string files bundled in `.ba2` archives (Starfield style) are extracted automatically; entry hashes are read and preserved for round-trip export
- **Source tagging** — each entry is tagged `Localized` (string file) or `Inline` (embedded), determining the correct export path
- **Dual-language loading** — English is always the reference (`original`); the configured target language is loaded in parallel as `translated`; status is set to `Validated` automatically when a translation already exists
- **Loading status events** — the backend emits `plugin:status` events (`loading_strings`, `parsing_records`) so the frontend can display descriptive progress during long archive extractions
- Supported record types: `ACTI` `ALCH` `AMMO` `ARMO` `BOOK` `CELL` `CLAS` `CONT` `DIAL` `DOOR` `ENCH` `EXPL` `FACT` `FLOR` `FURN` `INFO` `INGR` `KEYM` `LCTN` `LIGH` `MESG` `MGEF` `MISC` `NOTE` `NPC_` `PERK` `PROJ` `QUST` `RACE` `SCEN` `SLGM` `SPEL` `STAT` `TERM` `WEAP` `WRLD`
- Extracted subrecords: `FULL` `DESC` `NAM1` `NNAM` `RNAM` `CNAM` `SHRT` `EPFD` `ITXT` `DNAM` `TNAM` `INAM`
- Entries streamed to the frontend in chunks for instant UI responsiveness on large files

### Translation Table
- Displays all translatable entries: Form ID, record type, subrecord, original string, translation, status
- **Virtualised rendering** — only visible rows are mounted; handles plugins with tens of thousands of entries without lag
- **Status system**: `untranslated` / `pending` / `validated` / `ignored`
- **Source indicator badge** — each row shows an **`L`** (Localized — string file) or **`I`** (Inline — embedded in plugin) badge next to the status dot; hover reveals the string ID and file kind for localized entries
- Sortable columns (Form ID, record type, subrecord, original, translated, status)
- Filter bar: filter by status and/or record type
- Full-text search across original and translated strings

### Edit Panel
- Bottom panel for editing one entry at a time
- Keyboard navigation between entries (configurable shortcuts)
- **Character count** — live character count on both the original and translated columns (thousands-separated)
- **Line numbers** — numbered gutter automatically shown for multi-line entries (books, dialogues); hidden on single-line strings to avoid noise; gutter scrolls in sync with the translation textarea
- **Copy to clipboard** — one-click copy button on each column (original and translated) with 1.5 s visual confirmation
- Original text is selectable but read-only
- Status change from the edit panel
- **Find / Replace bar** — in-panel search with match highlighting and case-sensitive toggle (`Ctrl+F` / `Ctrl+H`); match counter and keyboard navigation between occurrences
- **Text operations** — Trim whitespace, UPPERCASE, lowercase, Remove tags; all operations are selection-aware (operate on selected text only when a selection exists)
- **Tag diff warning** — badge showing tags present in the original but missing from the translation
- **Quick tag insertion** — dropdown listing all tags from the original for one-click insertion at the cursor
- **Configurable shortcuts** — all Edit Panel shortcuts (find, replace, text ops) editable in Settings → Shortcuts
- **Identical-entry propagation** — changing the translation or status of an entry automatically propagates to all entries that share the same original text and translation, eliminating repetitive work
- **Spell check overlay** — misspelled words highlighted with a wavy red underline directly in the textarea; click any underlined word to open a suggestions popup; suggestions replace the word in place
- **Fuzzy suggestion bandeau** — when a fuzzy match is available, a coloured banner appears between the toolbar and the editor showing the suggested translation, its score (%), and its origin; one-click **Accept** (→ validated) or **Dismiss**
- **Manual fuzzy trigger** — 🔍 button in the translation toolbar runs a single-entry fuzzy search on demand, with toast feedback when no sources or no match are found

### Spell Check
- Powered by [Nuspell](https://nuspell.github.io/) 5.x (C++ library via Rust FFI)
- **47 built-in languages** — from Afrikaans to Chinese (Traditional), including all major European languages; dictionaries downloaded on demand from the [LibreOffice dictionary repository](https://github.com/LibreOffice/dictionaries)
- **Dictionary manager** in Settings → Spell Check: install or remove individual dictionaries
- **Real-time mode** — spell check runs automatically while typing (debounce configurable: 300 ms – 2 s)
- **Manual check** — dedicated button in the Edit Panel for on-demand checking
- **Tokenizer** — skips XML/HTML tags (`<…>`), format placeholders (`%…%`), all-uppercase words (acronyms), and single-character tokens; apostrophes handled correctly
- Dictionaries stored in the OS app-data directory; never bundled with the app binary
- Graceful degradation: if Nuspell is not available (build without vcpkg/pkg-config), all commands return a descriptive error — the rest of the app is unaffected

### Group View
- Sidebar showing entries grouped by record type
- Per-group progress stats: total / validated / pending / untranslated / ignored

### Bulk Actions
- Select multiple entries and apply a status change in one click
- **Apply Fuzzy to selection** (`🔍 Appliquer Fuzzy`) — fills all entries in the selection that have a pending fuzzy suggestion; accepted entries are set to `validated` directly
- **Apply personal DB to selection** (`↓ [DB name]`) — fills empty translations in the selected rows from the personal database
- **Save selection to personal DB** (`+ [DB name]`) — writes all translated entries in the selection to the active personal database
- **Selection is automatically cleared** after any bulk action (validate, fuzzy apply, DB apply, DeepL batch, add to DB) — no manual deselection needed

### Personal Translation Database (`.bgtx`)
- Custom binary format (`BGTX` magic + zstd + bincode) for storing personal translation pairs across sessions
- **Dual-index lookup**: primary match by `form_id + sub_type + original` (highest precision, handles multiple entries sharing the same record and field type); text-based fallback by original string (handles mods where IDs differ)
- **Apply pipeline** (on plugin open and session load): reference `.bgt` is applied first, then personal `.bgtx` file(s); a single combined notification reports entries from each source (session restored / ref DB / personal DB)
- **Active database**: designate one `.bgtx` as the write target — it is **always** applied on every plugin open, regardless of the Automatic / Manual mode setting
- **Apply mode** (Settings → Database):
  - *Automatic* — scan the entire personal databases folder and apply all `.bgtx` files found, in alphabetical order
  - *Manual* — apply only the Active database; additional files in the folder are ignored until manually triggered
- **Manual apply — all entries**: Database menu → *Appliquer BDD personnelle (toutes les entrées)*
- **Manual apply — selection**: `↓ [DB name]` button in the bulk action bar (fills only empty translations in the selection)
- **Save entry from Edit Panel**: `+ DB` button adds the currently edited entry directly to the active personal database
- **Save selection in bulk**: `+ [DB name]` button in the bulk action bar
- Managed in **Settings → Database → BDD PERSONNELLE (.BGTX)**:
  - Configure the personal databases folder (defaults to `personal_dbs/` next to the executable)
  - Create new `.bgtx` databases (name, game, source/target language)
  - Activate / deactivate the write target
  - Delete a database (inline confirmation — no native dialog)
  - Apply mode toggle (Automatic / Manual)

### Translation Database (`.bgt`)
- Custom binary format v2 (`BGTD` magic + version byte + zstd + bincode)
- Each entry stores: **form_id**, original, translated, record type, subrecord type, editor ID
- **3-level lookup** for maximum match accuracy:
  - **Level 1** — `(form_id, sub_type, original)`: identifies the exact record *and* its specific text variant; correctly handles records where the same form_id + sub_type appears multiple times with different text (e.g. quest journal CNAM stages)
  - **Level 2** — `(record_type, sub_type, original)`: contextual match for sources without form_id (XML, CSV)
  - **Level 3** — `original`: plain-text fallback
- **Auto-apply**: match entries from the database against the open plugin and apply translations automatically — reports matched / total counts
- Bundled databases: Morrowind EN→FR, Oblivion EN→FR, Starfield EN→FR
- Read-only protection for bundled databases
- **Default database per game** — in Settings → Database, assign one `.bgt` file as the default for each game; auto-apply uses this file first and falls back to a directory scan only when no explicit default is set
- **Smart auto-detection** — when no explicit default is set, the directory scan applies a three-tier priority: exact game header match → filename heuristic (e.g. `BDD_Starfield_EN-FR.bgt`) → partial substring match; results are alphabetically sorted for determinism

### Database Manager
- Floating, draggable modal accessible from **Database → Gestionnaire de bases de données…** — stays open while working
- **Two tabs**: Personal database (`.bgtx`) and Reference database (`.bgt`)
- **Browse & filter**: full-text search across original and translated strings; pagination with configurable page size; total entry count with thousand separators
- **Edit mode** — "Passer en mode modification" button activates in-place editing (button turns solid green while active); all editing features are available for both personal and reference databases
- **In-place cell editing** — click any translated cell to edit it directly in the table; unsaved changes are tracked and highlighted
- **Validate / Discard** — confirm or cancel all pending edits with dedicated action buttons
- **Purge incomplete entries** — removes all entries with an empty translation in one click (with count feedback)
- **Add row** — inline form at the top of the table to manually insert a new entry (original, translated, record type, sub-type, editor ID)
- **Import from file** — merges any supported format (`.bgt`, `.bgtx`, `.eet`, `.xml`, `.csv`, `.tsv`) into the current database
- **Find & Replace** — sub-panel with literal or regex search (JavaScript syntax), live preview of up to 30 affected entries (before/after coloured diff), confirmation before commit
- **Theme-aware** — all colours use CSS variables and adapt automatically to the active theme
- Free drag — window can be positioned anywhere on screen without boundary clamping

### Database Converter
- Floating, draggable modal (stays open while working) — accessible from **Database → Convertisseur de bases de données…**
- **Universal source support**: `.eet` (ESP-ESM Translator), `.bgt` v2 (reference database), `.bgtx` (personal database), `.csv`, `.tsv`, `.xml` (xTranslator or ESP-ESM Translator — auto-detected)
- **Output format**: `.bgt` (reference database, shared) or `.bgtx` (personal database)
- Configurable: database name, game, **source language**, **target language** (10 languages: English, French, German, Spanish, Italian, Portuguese, Russian, Polish, Chinese, Japanese), **output folder**
- **Output folder picker** — native folder dialog (Tauri); defaults to the `databases/` directory next to the app
- **Database type** for `.bgt` output:
  - *Default (read-only)* — auto-applied at plugin open (bundled / shared database)
  - *Custom (editable)* — loaded manually; can be edited in the Database Manager
- **form_id fully preserved** through conversion — `.eet` and existing `.bgt`/`.bgtx` sources retain their form IDs, enabling Level 1 precision matching after conversion
- CSV/TSV import supports an optional 6th column (`FormId`, hex format) exported by BGS Translator itself
- Inline result feedback (entry count on success, error message on failure) without closing the modal

### Sessions
- Save the current translation state (all entries + statuses) to a named session file
- Resume any previous session from the session picker
- Sessions are stored under `{Documents}/BGS-Translator/sessions/`
- Auto-load: when opening a plugin for which a session already exists, the session is restored automatically

### Export (Generate Translated File)

#### Non-localized plugins (`.esp` / `.esm` with inline strings)
- Writes a new `.esp` / `.esm` with all **validated** entries replaced by their translations
- Unvalidated entries (pending / untranslated / ignored) are left at their original values
- Correctly handles records with multiple subrecords of the same type (e.g. multiple `CNAM` journal entries within a single `QUST`) — each subrecord is matched by its original text, not by position

#### Localized plugins (Starfield, Fallout 4 — string files)
- Exports validated `Localized` entries as `.strings` / `.dlstrings` / `.ilstrings` files for the target language
- **BA2 archive mode** (default, configurable in Settings → Misc): produces a `<stem> - Localization.ba2` GNRL archive loaded automatically by the engine
  - **Round-trip merge**: all existing files from the source BA2 (e.g. English strings) are preserved; only the target-language files are replaced or added — the output is a complete, self-contained archive
  - Hashes reused from the source archive guarantee byte-perfect engine compatibility; computed fallback (`0x1003F` multiplier) used when no source archive exists or the language is new
- **Loose file mode**: writes the three files under `<output_dir>/Strings/` for manual placement or use with mod managers
- The user picks an output folder; the correct subfolder / archive name is created automatically

#### Standalone strings file (`.strings` / `.dlstrings` / `.ilstrings`)
- When a standalone strings file is open, **Generate Translated File** writes loose files directly — never BA2
- The BA2 archive setting in Settings → Misc is ignored; this behaviour cannot be overridden
- Output: `<output_dir>/Strings/<stem>_<target_lang>.<ext>` (same as loose-file mode for localized plugins)
- Only the file type that was imported produces a non-empty output (e.g. opening a `.dlstrings` file only writes a `_<lang>.dlstrings`)

#### Common
- Default output folder: `{Documents}/BGS-Translator/Traduction` (cross-platform, auto-created)
- Output folder and export mode are configurable in Settings
- Keyboard shortcut: `Ctrl+E`

### Import / Export — Multi-format
- **Import from file**: pick any existing `.esp` / `.esm` / `.esl` as a reference and import its translations into the current session — designed for the **mod-update workflow**
- **Import from xTranslator XML** (`.xml`) or **ESP-ESM Translator XML** (`.xml`)
- **Import from CSV** (`.csv`)
- **Export to xTranslator XML**, **ESP-ESM Translator XML**, or **CSV** — accessible from the **File** menu
- **Export database** (CSV, TSV) — accessible from the **File** menu; exported CSV includes a `FormId` column (hex) for round-trip conversion
- Positional matching within each `form_id + sub_type` group preserves correct per-entry pairing even when multiple subrecords share the same type
- Protected entries: `pending` (active work) and `ignored` (explicit decision) are never overwritten
- Keyboard shortcut: `Ctrl+I`

### Interface
- 13 built-in themes: Sombre, Clair, Nord, Dracula, Catppuccin, Océan, Forêt, Tokyo Night, Solarized, Gruvbox, Monokai, Rose Pine, Solarized Clair
- Full colour customisation per zone (menus, toolbar, sidebar, table, edit panel…)
- Per-zone typography: choose font family (sans-serif, serif, monospace) and size independently for UI, table content, and monospace (IDs)
- 3 icon sets: Minimal, Material, Classic
- Record-type colour coding (customisable per type)
- Interface language: English, French (auto-detected from system locale)
- **Theme-aware CSS variable system** — all semantic colours (status dots, fuzzy scores, row highlights, provider tints) are defined as CSS custom properties that automatically adapt to any theme override; `color-mix()` generates alpha variants without per-theme duplication
- **Loading overlay** — while a plugin is loading, a centered spinner with a status card (`Extraction des archives…` / `Lecture des enregistrements…`) covers the content area; the toolbar shows a compact entry counter during the streaming phase
- **Toolbar status badges** — when a file is open, the toolbar displays a badge next to the filename: **LOCALISÉ** (indigo) for localized plugins with external string files, **STRINGS** (green) for standalone strings files opened directly
- **Provider error auto-dismiss** — translation error tooltips (API key missing, model not configured…) disappear automatically after 4 seconds

### Plugin Comparison (Diff)
- Compare any two versions of the same plugin side by side — designed for the **mod-update workflow**
- **Two-phase diff**: quick *Check* first (stats only, near-instant) then full *Compare* (complete field-level diff)
- **Four change kinds**: `added` · `removed` · `modified` · `unchanged` — colour-coded throughout the UI
- **Field-level granularity**: each record expands to reveal individual subfield changes (FULL, DESC, NAM1, etc.)
- **Translation recovery**: when comparing a plugin you already translated against its updated version, previously translated strings are automatically matched and shown as recoverable (✨)
  - **Recover single field** — one-click button per field row; applies the old translation to the current session and shows a notification
  - **Recover all** — bulk-applies all recoverable translations in the current view with a single notification showing the applied count
- **Session auto-detection**: when you select Plugin A, the app automatically looks for an existing saved session with the same plugin name and uses it as the translation source
- **Recovery mode badge**: when Plugin B matches the currently open plugin, a green badge confirms recovery mode is active
- **Sortable columns**: click any column header to sort by change type, record type, Form ID or Editor ID; click again to reverse
- **Resizable columns**: drag column dividers to adjust widths; layout persists in `localStorage`
- **Filter bar** (shown after diff is loaded):
  - Toggle chips for each change kind (added / removed / modified / unchanged)
  - "Recoverable only" checkbox to focus on translatable entries
  - Full-text search across Editor ID, Form ID and field text
- **Stats bar**: real-time counts of added / removed / modified / unchanged records + total recoverable fields
- Accessible from **Database → Comparer les plugins…** or the toolbar button
- Uses theme font and size CSS variables (`--font-ui`, `--fz-table`, `--font-mono`, etc.) for visual consistency

### Fuzzy Matching

Automatically suggests translations for untranslated entries based on similarity to already-translated strings in the current session or personal database.

**Algorithms** (implemented in Rust, run in parallel via `rayon`):

| String length | Algorithm | Use case |
|---------------|-----------|----------|
| ≤ 60 chars | Jaro-Winkler (`strsim`) | NPC names, item names, short dialogue — prefix-sensitive |
| > 60 chars | Normalized Levenshtein (`strsim`) | Long descriptions, journal entries, books |

Long strings additionally require a **bigram Jaccard pre-filter** (≥ 20% overlap) before the full Levenshtein is computed, keeping bulk scans fast on large plugins.

**Score display** — colour-coded badge on every suggestion:
- 🟢 ≥ 90% — high confidence, safe to accept in bulk
- 🟡 75–89% — good match, worth a quick review
- 🟠 < 75% — weaker match, review before accepting

**Workflows**:
- **Auto-scan** — runs automatically when a plugin is opened; all untranslated entries are scanned in the background; matched entries show a coloured badge in the translation table
- **Filter by fuzzy** — `Fuzzy (N)` chip in the filter bar isolates all entries with a pending suggestion
- **Bulk accept** — select fuzzy-tagged entries and click **🔍 Appliquer Fuzzy** in the BulkActionBar; accepted entries are set to `validated` and the suggestion is consumed
- **Manual trigger** — click the 🔍 button in the EditPanel toolbar to run a single-entry scan on demand
- **Suggestion bandeau** — coloured banner in the EditPanel showing the suggested text, its score, and the source (session / personal DB); **Accept** applies the suggestion and validates the entry; **Dismiss** removes it

**Sources** (priority order, deduplication by original text — first source wins):
1. Current session — entries with a translation and status ≠ `untranslated`
2. Personal database — entries from the active `.bgtx` file *(wiring in progress)*

**Settings** (`Settings → Auto Translation → Autres réglages`):
- Enable / disable auto-scan on plugin open
- Jaro-Winkler threshold (default 78 %)
- Levenshtein threshold (default 65 %)
- Toggle session and personal DB as sources

### AI / LLM Translation Providers

Translate entries using large language models — local or cloud — directly from the Edit Panel or via bulk actions.

**Built-in providers:**

| Provider | Backend | Model selection | API key |
|----------|---------|-----------------|---------|
| **Ollama** | Local inference server | Preset catalogue + custom install | None |
| **Claude** | Anthropic API | Haiku / Sonnet / Opus | Required |
| **Cohere** | Cohere API | Command R / Command R+ | Required |
| **ChatGPT** | OpenAI API | GPT-4o mini / GPT-4o / GPT-4.1 … | Required |
| **Custom AI** | Any OpenAI-compatible endpoint | Free text input | Optional |

**Ollama (local) — model management UI:**
- Preset catalogue with RAM cost indicators (RAM badge: light / medium / heavy) and official documentation links
- **Install** — downloads the model via `ollama pull` with progress feedback and detailed error messages
- **Load / Unload** — pre-load a model into VRAM or free memory on demand
- **Status machine** — `checking → not_installed → installed → loaded in memory`; auto-checked on model change
- **Custom models** — "+" button opens an inline form; model is pulled, loaded and saved to the provider config; reappears in the dropdown under a "My models" group
- **Manage installed models** panel — lists all models currently on disk with `Use` and `×` delete (unload + `ollama rm`) actions
- **Logging** — all Ollama operations (pull, load, unload, delete) are written to the log file via `tauri-plugin-log`

**Custom AI providers:**
- "Add a custom AI provider" button creates an OpenAI-compatible provider entry
- Configure: base URL, model name (free text), optional API key, temperature, max tokens
- Routed automatically to the OpenAI-compatible backend (`/v1/chat/completions`)

**All providers share:**
- Editable system prompt with `{source_lang}` / `{target_lang}` placeholders (reset to default available)
- Configurable temperature (0.0 – 1.0) and max output tokens
- Keyboard shortcut (F1–F4 + configurable) for instant one-click translation
- Bulk translation via the BulkActionBar (one button per enabled AI provider)
- BGS tag protection — custom `<Tag>` markup is masked before the LLM call and restored in the output; the LLM never sees raw BGS tags
- **Per-provider visual identity** — each provider button has a dedicated brand colour and letter badge (DeepL `D` blue · Ollama `Ol` green · Claude `Cl` amber · OpenAI `Gpt` teal · Cohere `Co` purple · browser launchers outlined in their brand colour); colours are theme-compatible (semi-transparent tints on idle, solid on active)

### Global Find & Replace
- Floating, draggable window (stays open while working — no backdrop blocking the table)
- Opens via **Edit → Find & Replace…** or the configurable keyboard shortcut (`Ctrl+Shift+H` by default)
- **Search scope** — Original only / Translated only / Both columns
- **Options**: Case sensitive · Whole word (default on) · Regular expression mode · Visible entries only
- **Regex mode** — use full JavaScript regex syntax; supports capture groups in the replacement (`$1`, `$2`…); invalid patterns highlighted in red
- **Visible entries only** — limits the search pool to entries currently visible in the table (respects active status filter and group selection)
- Results list with contextual snippet (highlighted match) and field badge (Original / Translated)
- Double-click a result to navigate to the entry in the table
- **Navigate** — selects the entry in the table without closing the window
- **Replace** — replaces the match in the selected result's translated field
- **Replace all (N)** — replaces in all matching translated entries, with toast confirmation

### Keyboard Shortcuts
- Configurable shortcuts for: next/previous entry, copy original, paste translation, validate entry, global find & replace
- Defaults: `↓` / `↑` to navigate, `Ctrl+Enter` to validate, `Ctrl+G` to generate, `Ctrl+I` to import, `Ctrl+Shift+H` for global find & replace
- Browser built-in shortcuts (`Ctrl+F`, right-click context menu) are suppressed — all interactions go through the application

### Log Panel
- In-app activity log for parser events, database operations, and errors
- Persistent log file: `bgstranslator.log` in the OS app-log directory (legacy `BGS Translator.log` is deleted automatically on startup)
- **Settings → Système**: buttons to open the log file in the default text editor or reveal the log folder in the file manager
- **Log retention** — configurable in Settings → Système (Never / 7 / 14 / 30 / 60 / 90 days); old log files are purged automatically on startup and whenever the setting changes; default is 30 days

### Updates
- Automatic check for new versions via GitHub Releases
- Non-intrusive notification banner with release notes
- One-click install + automatic restart

---

## 6. Architecture — Spell Check

The spell check system bridges Rust and the C++ Nuspell library through a thin C ABI shim, avoiding the complexity of direct C++ FFI in Rust:

```
Rust (Tauri commands)
  └─ FFI via extern "C"
       └─ wrapper.cpp  (C++17 — compiled by the cc crate at build time)
            └─ nuspell::Dictionary  (C++ — linked from vcpkg / pkg-config)
```

The build script (`build.rs`) probes for Nuspell at compile time:
- **Windows**: uses the `vcpkg` crate (`VCPKG_ROOT` + triplet `x64-windows-static-md`)
- **Linux / macOS**: uses `pkg-config`
- If not found, emits a warning and sets no `nuspell_available` cfg — all spell-check code compiles to stubs that return descriptive errors

ICU (International Components for Unicode), a transitive dependency of Nuspell, is linked explicitly on Windows (`icuuc`, `icuin`, `icudt`).

---

## 7. Supported Games

| Game | Plugin format | Localized strings | Status |
|------|--------------|------------------|--------|
| Starfield | `.esp` / `.esm` / `.esl` | `.strings` / `.dlstrings` / `.ilstrings` | ✅ Supported |
| Skyrim / SSE | `.esp` / `.esm` | `.strings` / `.dlstrings` / `.ilstrings` | Planned |
| Fallout 4 | `.esp` / `.esm` | `.strings` / `.dlstrings` / `.ilstrings` | Planned |
| Oblivion / Morrowind | `.esp` / `.esm` | Inline (non-localized) | Planned |

---

## 8. Default Paths

| Purpose | Path |
|---------|------|
| Export output | `{Documents}/BGS-Translator/Traduction/` |
| Sessions | `{Documents}/BGS-Translator/sessions/` |
| Reference databases (`.bgt`) | Bundled inside the app binary |
| Personal databases (`.bgtx`) | `personal_dbs/` next to the executable (configurable in Settings) |
| Spell check dictionaries | `{AppData}/com.bgstranslator/dictionaries/` |
| Log file | `{AppLog}/bgstranslator.log` (e.g. `%APPDATA%\com.bgstranslator\logs\` on Windows) |

Export and session directories are created automatically on first launch and are cross-platform (`Documents` resolves via the OS API on Windows, macOS and Linux).

---

## 9. License

This project is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**.

You may use, modify and distribute this software under the terms of the MPL-2.0. Modified source files must remain under the MPL-2.0; you may combine MPL-2.0 code with code under other licenses (including proprietary licenses) in a larger work.

See the [`LICENSE`](LICENSE) file for the full license text, or visit [mozilla.org/MPL/2.0](https://www.mozilla.org/en-US/MPL/2.0/).

---
