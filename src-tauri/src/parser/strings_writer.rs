//! Writer for Bethesda `.strings` / `.dlstrings` / `.ilstrings` files.
//!
//! File format (same structure as the reader in `strings_file.rs`):
//!
//! ```text
//! Header (8 bytes)
//!   u32  count      — number of entries
//!   u32  data_size  — byte length of the data block
//!
//! Directory  (count × 8 bytes)
//!   u32  string_id
//!   u32  offset     — byte offset from START of data block
//!
//! Data block
//!   .strings:              null-terminated string
//!   .dlstrings/.ilstrings: u32 length (incl. null) + null-terminated string
//! ```

use std::{
    collections::HashMap,
    io::{BufWriter, Write},
    path::Path,
};

use crate::parser::archive::{Ba2EntryMeta, Ba2RawEntry};
use crate::parser::strings_file::StringFileKind;
use crate::translation::entry::{EntryStatus, StringSource, TranslationEntry};

/// One string table (string_id → translated text).
pub type StringTable = HashMap<u32, String>;

/// The three tables that make up a complete localized strings export.
pub struct StringsTables {
    pub strings:   StringTable,
    pub dlstrings: StringTable,
    pub ilstrings: StringTable,
}

// ── Table builder ─────────────────────────────────────────────────────────────

/// Build three string tables from validated localized entries.
///
/// Only `Validated` entries with a non-empty `translated` field and a
/// `Localized` source are included.  If an entry appears more than once
/// (same string_id) the last validated translation wins — in practice
/// each string_id is unique within a plugin.
pub fn build_strings_tables(entries: &[TranslationEntry]) -> StringsTables {
    let mut strings   = HashMap::new();
    let mut dlstrings = HashMap::new();
    let mut ilstrings = HashMap::new();

    for entry in entries {
        if entry.status != EntryStatus::Validated { continue; }
        if entry.translated.is_empty() { continue; }

        if let StringSource::Localized { string_id, kind } = &entry.source {
            match kind {
                StringFileKind::Strings   => { strings.insert(*string_id, entry.translated.clone()); }
                StringFileKind::DlStrings => { dlstrings.insert(*string_id, entry.translated.clone()); }
                StringFileKind::IlStrings => { ilstrings.insert(*string_id, entry.translated.clone()); }
            }
        }
    }

    StringsTables { strings, dlstrings, ilstrings }
}

// ── File writer ───────────────────────────────────────────────────────────────

/// Serialize a `StringTable` to disk in the Bethesda strings format.
///
/// `ext` controls the encoding of the data block:
/// - `"strings"`   → raw null-terminated strings
/// - `"dlstrings"` / `"ilstrings"` → u32 length prefix (incl. null) + null-terminated string
///
/// Returns `Ok(())` immediately if the table is empty (no file written).
pub fn write_strings_file(path: &Path, table: &StringTable, ext: &str) -> Result<(), String> {
    if table.is_empty() {
        return Ok(());
    }

    // Ensure the parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!("Cannot create directory '{}': {e}", parent.display())
        })?;
    }

    let use_length_prefix = ext != "strings"; // dlstrings / ilstrings use u32 prefix

    // Sort by string_id for deterministic, diff-friendly output
    let mut sorted: Vec<(u32, &String)> = table.iter().map(|(&k, v)| (k, v)).collect();
    sorted.sort_by_key(|(id, _)| *id);

    let count = sorted.len() as u32;

    // ── Build data block ─────────────────────────────────────────────────────
    // We build the data block first so we know each entry's offset.
    let mut data_block: Vec<u8> = Vec::new();
    let mut offsets: Vec<u32>  = Vec::with_capacity(sorted.len());

    for (_, text) in &sorted {
        offsets.push(data_block.len() as u32);

        // Encode text as Windows-1252 if it isn't valid ASCII/UTF-8 compatible?
        // BGS tools write UTF-8 in modern games (Fallout 4+, Starfield).
        // We write UTF-8 bytes unconditionally — matches game expectation.
        let bytes = text.as_bytes();

        if use_length_prefix {
            // Length field includes the null terminator byte
            let len = (bytes.len() as u32).saturating_add(1);
            data_block.extend_from_slice(&len.to_le_bytes());
        }
        data_block.extend_from_slice(bytes);
        data_block.push(0u8); // null terminator
    }

    let data_size = data_block.len() as u32;

    // ── Write to disk (atomic: write to temp, then rename) ───────────────────
    let out_dir = path.parent().unwrap_or(Path::new("."));
    let tmp = tempfile::NamedTempFile::new_in(out_dir)
        .map_err(|e| format!("Cannot create temp file for '{}': {e}", path.display()))?;
    let mut w = BufWriter::new(&tmp);

    // Header
    w.write_all(&count.to_le_bytes())     .map_err(|e| e.to_string())?;
    w.write_all(&data_size.to_le_bytes()) .map_err(|e| e.to_string())?;

    // Directory
    for ((string_id, _), offset) in sorted.iter().zip(offsets.iter()) {
        w.write_all(&string_id.to_le_bytes()) .map_err(|e| e.to_string())?;
        w.write_all(&offset.to_le_bytes())    .map_err(|e| e.to_string())?;
    }

    // Data block
    w.write_all(&data_block).map_err(|e| e.to_string())?;
    drop(w); // flush BufWriter before persisting

    tmp.persist(path)
        .map_err(|e| format!("Cannot persist '{}': {}", path.display(), e.error))?;

    tracing::info!("[strings_writer] {} entries → {}", count, path.display());
    Ok(())
}

// ── High-level export ─────────────────────────────────────────────────────────

/// Result of a strings export (number of entries per file type).
pub struct StringsWriteResult {
    pub strings:   usize,
    pub dlstrings: usize,
    pub ilstrings: usize,
    /// `true` when output was packed into a BA2 archive.
    pub is_ba2:    bool,
}

/// Write all three string files for a localized plugin.
///
/// Files are placed at:
/// ```text
/// <output_dir>/Strings/<plugin_stem>_<lang>.strings
/// <output_dir>/Strings/<plugin_stem>_<lang>.dlstrings
/// <output_dir>/Strings/<plugin_stem>_<lang>.ilstrings
/// ```
/// Files for empty tables are skipped (not created on disk).
///
/// Returns the number of entries written per table type.
pub fn write_strings_files(
    output_dir:  &Path,
    plugin_stem: &str,
    lang:        &str,
    entries:     &[TranslationEntry],
) -> Result<StringsWriteResult, String> {
    let tables = build_strings_tables(entries);

    let strings_dir = output_dir.join("Strings");
    let base        = format!("{}_{}", plugin_stem, lang);

    // Write only non-empty tables
    write_strings_file(&strings_dir.join(format!("{base}.strings")),   &tables.strings,   "strings"  )?;
    write_strings_file(&strings_dir.join(format!("{base}.dlstrings")), &tables.dlstrings, "dlstrings")?;
    write_strings_file(&strings_dir.join(format!("{base}.ilstrings")), &tables.ilstrings, "ilstrings")?;

    Ok(StringsWriteResult {
        strings:   tables.strings.len(),
        dlstrings: tables.dlstrings.len(),
        ilstrings: tables.ilstrings.len(),
        is_ba2:    false,
    })
}

// ── BA2 writer ────────────────────────────────────────────────────────────────

/// Write translated strings into a BA2 GNRL archive, **merging** with the
/// content of the source archive so all existing files are preserved.
///
/// Strategy:
/// 1. Read ALL entries from `source_ba2` (if present), excluding any file whose
///    name ends with `_<lang>.<ext>` (those will be replaced).
/// 2. Build the new translated string files for `<lang>`.
/// 3. Write a single BA2 containing existing entries + new entries.
///
/// If `source_ba2` is absent or unreadable, only the new translated files are
/// written (same behaviour as before, but with a warning in the log).
///
/// Hash strategy for NEW files (highest priority first):
/// 1. Source archive has an existing entry for this lang → reuse its hashes.
/// 2. Computed via the `ba2_path_hash` function (`0x1003F` Bethesda prime).
///
/// Output format: **BA2 v2 GNRL** (Starfield native).
pub fn write_strings_ba2(
    output_path: &Path,
    plugin_stem: &str,
    lang:        &str,
    entries:     &[TranslationEntry],
    source_ba2:  Option<&Path>,
) -> Result<StringsWriteResult, String> {
    let tables = build_strings_tables(entries);

    // ── Build new translated file items ──────────────────────────────────────
    let mut new_items: Vec<Ba2FileItem> = Vec::new();
    for (table, ext_str) in [
        (&tables.strings,   "strings"),
        (&tables.dlstrings, "dlstrings"),
        (&tables.ilstrings, "ilstrings"),
    ] {
        if table.is_empty() { continue; }
        let mut buf: Vec<u8> = Vec::new();
        serialise_string_table_into(table, ext_str, &mut buf)?;
        let name = format!("strings\\{}_{}.{}", plugin_stem, lang, ext_str).to_lowercase();
        new_items.push(Ba2FileItem { name, ext_str: ext_str.to_string(), data: buf });
    }

    if new_items.is_empty() {
        return Ok(StringsWriteResult { strings: 0, dlstrings: 0, ilstrings: 0, is_ba2: true });
    }

    // ── Read existing entries from source BA2 (excluding the target language) ─
    let existing: Vec<Ba2RawEntry> = source_ba2.map_or_else(
        || {
            tracing::warn!("[ba2_writer] No source BA2 provided — output will contain only new strings");
            Vec::new()
        },
        |p| {
            if p.exists() {
                let v = crate::parser::archive::read_ba2_all_entries_with_data(p, Some(lang));
                if v.is_empty() {
                    tracing::warn!("[ba2_writer] Source BA2 '{}' yielded no existing entries \
                                (unreadable or already empty)", p.display());
                }
                v
            } else {
                tracing::warn!("[ba2_writer] Source BA2 '{}' not found — output will contain only new strings",
                    p.display());
                Vec::new()
            }
        },
    );

    // Resolve hashes for new items: check source archive for existing lang entries first
    let source_meta_lang: Option<Vec<Ba2EntryMeta>> = source_ba2.and_then(|p| {
        crate::parser::archive::read_ba2_entry_metadata(p, lang)
    });
    if source_meta_lang.is_some() {
        tracing::info!("[ba2_writer] Reusing hashes from source archive for lang '{}'", lang);
    } else {
        tracing::info!("[ba2_writer] No existing hashes for lang '{}' — computing", lang);
    }

    // ── Layout (v2 GNRL) ──────────────────────────────────────────────────────
    const MAGIC:       &[u8] = b"BTDX";
    const VERSION:     u32   = 2;
    const ARCH_TYPE:   &[u8] = b"GNRL";
    const HEADER_SIZE: u64   = 32;  // magic(4)+ver(4)+type(4)+count(4)+names_off(8)+extra(8)
    const ENTRY_SIZE:  u64   = 36;

    let total_count   = (existing.len() + new_items.len()) as u32;
    let entries_size  = total_count as u64 * ENTRY_SIZE;
    let data_start    = HEADER_SIZE + entries_size;

    // Compute data offsets: existing entries first, then new entries
    let mut cur_offset = data_start;
    let mut existing_offsets: Vec<u64> = Vec::with_capacity(existing.len());
    for e in &existing {
        existing_offsets.push(cur_offset);
        let sz = if e.packed_size > 0 { e.packed_size } else { e.unpacked_size };
        cur_offset += sz as u64;
    }
    let mut new_offsets: Vec<u64> = Vec::with_capacity(new_items.len());
    for item in &new_items {
        new_offsets.push(cur_offset);
        cur_offset += item.data.len() as u64;
    }
    let names_offset = cur_offset;

    // ── Write (atomic: write to temp, then rename) ────────────────────────────
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create dir: {e}"))?;
    }
    let out_dir = output_path.parent().unwrap_or(std::path::Path::new("."));
    let tmp = tempfile::NamedTempFile::new_in(out_dir)
        .map_err(|e| format!("Cannot create temp file for '{}': {e}", output_path.display()))?;
    let mut w = BufWriter::new(&tmp);

    // Header (32 bytes for v2)
    w.write_all(MAGIC)                          .map_err(|e| e.to_string())?;
    w.write_all(&VERSION.to_le_bytes())         .map_err(|e| e.to_string())?;
    w.write_all(ARCH_TYPE)                      .map_err(|e| e.to_string())?;
    w.write_all(&total_count.to_le_bytes())     .map_err(|e| e.to_string())?;
    w.write_all(&names_offset.to_le_bytes())    .map_err(|e| e.to_string())?;
    w.write_all(&1u64.to_le_bytes())            .map_err(|e| e.to_string())?; // v2 extra

    // ── Entry table: existing entries (preserved as-is) ───────────────────────
    for (e, &off) in existing.iter().zip(existing_offsets.iter()) {
        let m        = &e.meta;
        let pck_size = e.packed_size;
        let unp_size = e.unpacked_size;
        w.write_all(&m.dir_hash.to_le_bytes())     .map_err(|e| e.to_string())?;
        w.write_all(&m.ext)                         .map_err(|e| e.to_string())?;
        w.write_all(&m.file_hash.to_le_bytes())    .map_err(|e| e.to_string())?;
        w.write_all(&[m.flags])                     .map_err(|e| e.to_string())?;
        w.write_all(&[m.unknown])                   .map_err(|e| e.to_string())?;
        w.write_all(&e.comp_type.to_le_bytes())    .map_err(|e| e.to_string())?;
        w.write_all(&off.to_le_bytes())             .map_err(|e| e.to_string())?;
        w.write_all(&pck_size.to_le_bytes())       .map_err(|e| e.to_string())?;
        w.write_all(&unp_size.to_le_bytes())       .map_err(|e| e.to_string())?;
        w.write_all(&0xBAADF00Du32.to_le_bytes())  .map_err(|e| e.to_string())?;
    }

    // ── Entry table: new translated entries (always uncompressed) ─────────────
    for (item, &off) in new_items.iter().zip(new_offsets.iter()) {
        let (dir_hash, ext_bytes, file_hash, flags, unknown) =
            resolve_entry_meta(item, source_meta_lang.as_deref());
        let unp_size = item.data.len() as u32;
        w.write_all(&dir_hash.to_le_bytes())        .map_err(|e| e.to_string())?;
        w.write_all(&ext_bytes)                      .map_err(|e| e.to_string())?;
        w.write_all(&file_hash.to_le_bytes())       .map_err(|e| e.to_string())?;
        w.write_all(&[flags])                        .map_err(|e| e.to_string())?;
        w.write_all(&[unknown])                      .map_err(|e| e.to_string())?;
        w.write_all(&0u16.to_le_bytes())             .map_err(|e| e.to_string())?; // comp=none
        w.write_all(&off.to_le_bytes())              .map_err(|e| e.to_string())?;
        w.write_all(&0u32.to_le_bytes())             .map_err(|e| e.to_string())?; // packed_size=0
        w.write_all(&unp_size.to_le_bytes())        .map_err(|e| e.to_string())?;
        w.write_all(&0xBAADF00Du32.to_le_bytes())   .map_err(|e| e.to_string())?;
    }

    // ── File data: existing (raw, may be compressed) ──────────────────────────
    for e in &existing {
        w.write_all(&e.raw_data).map_err(|e| e.to_string())?;
    }

    // ── File data: new entries (uncompressed) ─────────────────────────────────
    for item in &new_items {
        w.write_all(&item.data).map_err(|e| e.to_string())?;
    }

    // ── Names table (u16 len + raw bytes, no null terminator) ─────────────────
    for e in &existing {
        let bytes = e.meta.name.as_bytes();
        w.write_all(&(bytes.len() as u16).to_le_bytes()).map_err(|e| e.to_string())?;
        w.write_all(bytes)                               .map_err(|e| e.to_string())?;
    }
    for item in &new_items {
        let bytes = item.name.as_bytes();
        w.write_all(&(bytes.len() as u16).to_le_bytes()).map_err(|e| e.to_string())?;
        w.write_all(bytes)                               .map_err(|e| e.to_string())?;
    }

    drop(w); // flush BufWriter before persisting
    tmp.persist(output_path)
        .map_err(|e| format!("Cannot persist '{}': {}", output_path.display(), e.error))?;

    tracing::info!("[ba2_writer] Wrote {} files ({} existing + {} new) to {}",
        total_count, existing.len(), new_items.len(), output_path.display());

    Ok(StringsWriteResult {
        strings:   tables.strings.len(),
        dlstrings: tables.dlstrings.len(),
        ilstrings: tables.ilstrings.len(),
        is_ba2:    true,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

struct Ba2FileItem {
    name:    String,   // full normalised path, e.g. "strings\starfield_fr.dlstrings"
    ext_str: String,   // "strings" | "dlstrings" | "ilstrings"
    data:    Vec<u8>,
}

/// Resolve (dir_hash, ext[4], file_hash, flags, unknown) for one file item.
/// Tries to find a matching entry in source archive metadata first; falls back
/// to computed hashes.
fn resolve_entry_meta(
    item:        &Ba2FileItem,
    source_meta: Option<&[Ba2EntryMeta]>,
) -> (u32, [u8; 4], u32, u8, u8) {
    // Try exact match from source archive
    if let Some(meta) = source_meta {
        let norm = item.name.to_lowercase().replace('/', "\\");
        if let Some(m) = meta.iter().find(|m| m.name.to_lowercase().replace('/', "\\") == norm) {
            tracing::debug!("[ba2_writer] Using source hash for '{}'", item.name);
            return (m.dir_hash, m.ext, m.file_hash, m.flags, m.unknown);
        }
    }

    // Compute hashes from the file path
    // Path: "strings\<stem>_<lang>.<ext>"
    // → dir  = "strings"
    // → name = "<stem>_<lang>"  (filename without extension)
    // → ext  = first 4 bytes of extension
    let (dir_part, name_part, ext_4) = split_ba2_path(&item.name, &item.ext_str);
    let dir_hash  = ba2_path_hash(&dir_part);
    let file_hash = ba2_path_hash(&name_part);
    tracing::debug!("[ba2_writer] Computed hash for '{}': dir={:08X} file={:08X}",
        item.name, dir_hash, file_hash);
    (dir_hash, ext_4, file_hash, 0, 0)
}

/// Split a BA2 path into (directory, filename_no_ext, ext_bytes[4]).
fn split_ba2_path(name: &str, ext_str: &str) -> (String, String, [u8; 4]) {
    let norm = name.to_lowercase().replace('/', "\\");
    let dir  = norm.rsplit_once('\\').map(|(d, _)| d).unwrap_or("").to_string();

    // Filename without extension: strip the dot+ext from the end
    let stem = if let Some(dot) = norm.rfind('.') {
        norm[..dot].rsplit('\\').next().unwrap_or("").to_string()
    } else {
        norm.rsplit('\\').next().unwrap_or("").to_string()
    };

    // ext[4]: first 4 chars of extension (no dot)
    let ext_bytes = ext_str.as_bytes();
    let mut ext4  = [0u8; 4];
    let copy_len  = ext_bytes.len().min(4);
    ext4[..copy_len].copy_from_slice(&ext_bytes[..copy_len]);

    (dir, stem, ext4)
}

/// Bethesda BA2 GNRL path hash (multiplication-based, prime = 0x1003F).
///
/// Input is normalised to lowercase before hashing.
/// This matches the algorithm used by Archive2 / bsarch for FO4 and Starfield.
fn ba2_path_hash(s: &str) -> u32 {
    let s = s.to_lowercase();
    let mut h: u32 = 0;
    for c in s.bytes() {
        h = h.wrapping_mul(0x1003F).wrapping_add(c as u32);
    }
    h
}

/// Serialise a `StringTable` directly into a `Vec<u8>` without touching the disk.
/// Used internally by the BA2 writer to get the raw file bytes.
fn serialise_string_table_into(
    table:   &StringTable,
    ext:     &str,
    out:     &mut Vec<u8>,
) -> Result<(), String> {
    let use_length_prefix = ext != "strings";

    let mut sorted: Vec<(u32, &String)> = table.iter().map(|(&k, v)| (k, v)).collect();
    sorted.sort_by_key(|(id, _)| *id);

    let count     = sorted.len() as u32;
    let mut data_block: Vec<u8> = Vec::new();
    let mut offsets: Vec<u32>  = Vec::with_capacity(sorted.len());

    for (_, text) in &sorted {
        offsets.push(data_block.len() as u32);
        let bytes = text.as_bytes();
        if use_length_prefix {
            let len = (bytes.len() as u32).saturating_add(1);
            data_block.extend_from_slice(&len.to_le_bytes());
        }
        data_block.extend_from_slice(bytes);
        data_block.push(0u8);
    }

    let data_size = data_block.len() as u32;

    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&data_size.to_le_bytes());
    for ((string_id, _), offset) in sorted.iter().zip(offsets.iter()) {
        out.extend_from_slice(&string_id.to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
    }
    out.extend_from_slice(&data_block);
    Ok(())
}
