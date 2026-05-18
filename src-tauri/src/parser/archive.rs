//! Minimal BA2 / BSA archive reader.
//!
//! Only goal: extract `.strings` / `.dlstrings` / `.ilstrings` files for a
//! given plugin stem + language, so the translator can load localized strings
//! when they are packed inside an archive rather than sitting loose in
//! `Data/Strings/`.
//!
//! Supported formats
//! -----------------
//! - **BA2 GNRL** — Fallout 4 (v1) and Starfield (v2/v3+)
//! - **BSA v104** — Oblivion, Fallout 3, Fallout New Vegas
//! - **BSA v105** — Skyrim LE / Skyrim SE
//!
//! DX10 / GNMF (texture/mesh) archives are detected and silently skipped.

use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};
use binrw::BinReaderExt;
use flate2::read::ZlibDecoder;

use crate::parser::error::ParseError;

// ─── Public types ─────────────────────────────────────────────────────────────

/// Raw bytes for the three string file types, ready to be fed into
/// `strings_file::parse_strings_from_bytes`.
pub struct ExtractedStrings {
    pub strings:   Option<Vec<u8>>,
    pub dlstrings: Option<Vec<u8>>,
    pub ilstrings: Option<Vec<u8>>,
}

impl ExtractedStrings {
    fn empty() -> Self {
        Self { strings: None, dlstrings: None, ilstrings: None }
    }

    pub fn is_empty(&self) -> bool {
        self.strings.is_none() && self.dlstrings.is_none() && self.ilstrings.is_none()
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Scan for BA2/BSA archives adjacent to the plugin file and extract strings.
///
/// Looks for archives whose stem equals `plugin_stem` or starts with
/// `"plugin_stem - "` (split-archive convention used by Bethesda, e.g.
/// `Starfield - Interface.ba2`).
///
/// Returns the first archive that yields at least one non-empty string table.
pub fn extract_strings_from_archives(
    data_dir:    &Path,
    plugin_stem: &str,
    lang:        &str,
) -> Option<ExtractedStrings> {
    let candidates = find_candidate_archives(data_dir, plugin_stem);
    log::debug!("[archive] {} candidate(s) for '{}' / lang '{}'",
        candidates.len(), plugin_stem, lang);

    for path in &candidates {
        match try_extract(path, plugin_stem, lang) {
            Ok(result) if !result.is_empty() => {
                log::info!("[archive] Strings found in '{}'", path.display());
                return Some(result);
            }
            Ok(_)  => {}
            Err(e) => log::warn!("[archive] Error reading '{}': {}", path.display(), e),
        }
    }
    None
}

/// Read the BA2 entry metadata (hashes, ext) for all files that match a given
/// `lang` (e.g. "fr") in the archive at `archive_path`.
///
/// Returns a list of `Ba2EntryMeta` with their names, so the caller can
/// identify and reuse correct hash values when writing a new BA2.
/// Returns `None` if the archive cannot be read or is not a BA2 GNRL.
pub fn read_ba2_entry_metadata(archive_path: &Path, lang: &str) -> Option<Vec<Ba2EntryMeta>> {
    let file = File::open(archive_path).ok()?;
    let mut r = BufReader::new(file);

    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).ok()?;
    if &magic != b"BTDX" { return None; }

    let version: u32      = r.read_le().ok()?;
    let mut arch_type      = [0u8; 4];
    r.read_exact(&mut arch_type).ok()?;
    let file_count: u32   = r.read_le().ok()?;
    let names_offset: u64 = r.read_le().ok()?;
    if version >= 2 { let _extra: u64 = r.read_le().ok()?; }

    if &arch_type != b"GNRL" { return None; }

    let mut entries = Vec::with_capacity(file_count as usize);
    for _ in 0..file_count {
        let dir_hash: u32  = r.read_le().ok()?;
        let mut ext         = [0u8; 4];
        r.read_exact(&mut ext).ok()?;
        let file_hash: u32 = r.read_le().ok()?;
        let flags: u8      = r.read_le().ok()?;
        let unknown: u8    = r.read_le().ok()?;
        let _comp:  u16    = r.read_le().ok()?;
        let _off:   u64    = r.read_le().ok()?;
        let _packed: u32   = r.read_le().ok()?;
        let _unp:   u32    = r.read_le().ok()?;
        let _sent:  u32    = r.read_le().ok()?;
        entries.push(Ba2EntryMeta { dir_hash, ext, file_hash, flags, unknown, name: String::new() });
    }

    r.seek(SeekFrom::Start(names_offset)).ok()?;
    for entry in entries.iter_mut() {
        let name_len: u16 = r.read_le().ok()?;
        let mut name_bytes = vec![0u8; name_len as usize];
        r.read_exact(&mut name_bytes).ok()?;
        entry.name = String::from_utf8_lossy(&name_bytes).into_owned();
    }

    // Keep only entries that belong to the requested language
    let lang_lower = lang.to_lowercase();
    let filtered = entries.into_iter()
        .filter(|e| e.name.to_lowercase().contains(&lang_lower))
        .collect::<Vec<_>>();

    if filtered.is_empty() { None } else { Some(filtered) }
}

// ─── Archive discovery ────────────────────────────────────────────────────────

fn find_candidate_archives(data_dir: &Path, plugin_stem: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let Ok(read_dir) = std::fs::read_dir(data_dir) else { return candidates };

    let stem_lower = plugin_stem.to_lowercase();

    for entry in read_dir.filter_map(|e| e.ok()) {
        let path = entry.path();
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue };
        if !matches!(ext.to_lowercase().as_str(), "ba2" | "bsa") { continue }

        let Some(fname) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let fname_lower = fname.to_lowercase();

        // Match: exact stem  OR  "stem - Subtitle"  OR  "stem-Subtitle"
        if fname_lower == stem_lower
            || fname_lower.starts_with(&format!("{} - ", stem_lower))
            || fname_lower.starts_with(&format!("{}-", stem_lower))
        {
            candidates.push(path);
        }
    }

    // Exact-name match first; then alphabetical (consistent ordering)
    candidates.sort_by(|a, b| {
        let an = a.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let bn = b.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        match (an == stem_lower, bn == stem_lower) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _             => an.cmp(&bn),
        }
    });
    candidates
}

// ─── Format dispatch ──────────────────────────────────────────────────────────

fn try_extract(path: &Path, plugin_stem: &str, lang: &str) -> Result<ExtractedStrings, ParseError> {
    let file = File::open(path)?;
    let mut r = BufReader::new(file);

    let mut magic = [0u8; 4];
    r.read_exact(&mut magic)?;

    match &magic {
        b"BTDX" => extract_from_ba2(r, plugin_stem, lang),
        b"BSA\0" => extract_from_bsa(r, plugin_stem, lang),
        _        => Ok(ExtractedStrings::empty()),
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BA2 — Fallout 4 / Starfield
// ═══════════════════════════════════════════════════════════════════════════════
//
// ┌─ Base header (consumed magic + 5 fields = 24 bytes from file start) ───────
//   magic          [u8;4]  "BTDX"  (consumed before this function is called)
//   version        u32     1=FO4   2/3=Starfield
//   type           [u8;4]  "GNRL" | "DX10" | "GNMF"
//   file_count     u32
//   names_offset   u64     absolute offset of the names table
//
// ┌─ Version-specific extra header bytes ──────────────────────────────────────
//   v1 (FO4):  none       → entries start at file offset 24
//   v2+ (SF):  u64 extra  (8 extra bytes, value observed = 1)
//              → entries start at file offset 32
//
// ┌─ GNRL file entry layout ────────────────────────────────────────────────────
//   Both v1 and v2  — 36 bytes per entry (format is IDENTICAL):
//     dir_hash       u32
//     ext            [u8;4]   "dlst" | "ilst" | "stri" etc.
//     file_hash      u32
//     flags          u8
//     unknown        u8       (0x01 observed in Starfield v2)
//     comp_type      u16      0=none  1=zlib  (other bits = flags in v2)
//     data_offset    u64
//     packed_size    u32      0 = uncompressed (comp_type irrelevant)
//     unpacked_size  u32
//     sentinel       u32      0xBAADF00D
//
// NOTE: file data follows entries directly; the names table is at the END of the
// archive (at names_offset), NOT immediately after the entries.
//
// ┌─ Names table (at names_offset) ────────────────────────────────────────────
//   For each file: u16 name_len  +  name_len bytes  (not null-terminated)
//   Paths use backslash separator, e.g. "Strings\Starfield_fr.dlstrings"

/// Full metadata for one GNRL entry (public for the BA2 writer).
#[derive(Debug, Clone)]
pub struct Ba2EntryMeta {
    pub dir_hash:     u32,
    pub ext:          [u8; 4],
    pub file_hash:    u32,
    pub flags:        u8,
    pub unknown:      u8,
    pub name:         String,
}

#[allow(dead_code)]
struct Ba2Entry {
    dir_hash:      u32,
    ext:           [u8; 4],
    file_hash:     u32,
    flags:         u8,
    unknown:       u8,
    comp_type:     u16,
    data_offset:   u64,
    packed_size:   u32,
    unpacked_size: u32,
    name:          String,
}

fn extract_from_ba2<R: Read + Seek>(
    mut r: R,
    plugin_stem: &str,
    lang: &str,
) -> Result<ExtractedStrings, ParseError> {
    // ── Header ────────────────────────────────────────────────────────────────
    let version:      u32 = r.read_le()?;
    let mut arch_type = [0u8; 4];
    r.read_exact(&mut arch_type)?;
    let file_count:   u32 = r.read_le()?;
    let names_offset: u64 = r.read_le()?;

    // Starfield v2+ adds 8 extra bytes (empirically: u64 = 1) to the header.
    // Verified on Starfield - Localization.ba2: entries start at offset 32 (not 24).
    if version >= 2 {
        let _extra: u64 = r.read_le()?;  // 8 extra header bytes for Starfield v2+
    }
    // Position is now at the start of file entries for both v1 and v2.

    log::debug!("[ba2] version={} type={} files={} names_at=0x{:x}",
        version,
        std::str::from_utf8(&arch_type).unwrap_or("????"),
        file_count, names_offset);

    // We only care about general (non-texture) archives
    if &arch_type != b"GNRL" {
        return Ok(ExtractedStrings::empty());
    }

    // ── File entries (36 bytes each — identical for v1 and v2) ───────────────
    let mut entries: Vec<Ba2Entry> = Vec::with_capacity(file_count as usize);

    for _ in 0..file_count {
        let dir_hash:      u32 = r.read_le()?;
        let mut ext             = [0u8; 4];
        r.read_exact(&mut ext)?;
        let file_hash:     u32 = r.read_le()?;
        let flags:         u8  = r.read_le()?;
        let unknown:       u8  = r.read_le()?;
        let comp_type:     u16 = r.read_le()?;
        let data_offset:   u64 = r.read_le()?;
        let packed_size:   u32 = r.read_le()?;
        let unpacked_size: u32 = r.read_le()?;
        let _sentinel:     u32 = r.read_le()?;  // 0xBAADF00D

        entries.push(Ba2Entry {
            dir_hash, ext, file_hash, flags, unknown,
            comp_type, data_offset, packed_size, unpacked_size,
            name: String::new(),
        });
    }

    // ── Names table ───────────────────────────────────────────────────────────
    r.seek(SeekFrom::Start(names_offset))?;
    for entry in entries.iter_mut() {
        let name_len: u16 = r.read_le()?;
        let mut name_bytes = vec![0u8; name_len as usize];
        r.read_exact(&mut name_bytes)?;
        entry.name = String::from_utf8_lossy(&name_bytes).into_owned();
    }

    // ── Match ─────────────────────────────────────────────────────────────────
    let base      = format!("{}_{}", plugin_stem, lang);
    let s_target  = format!("strings\\{}.strings",   base).to_lowercase();
    let dl_target = format!("strings\\{}.dlstrings", base).to_lowercase();
    let il_target = format!("strings\\{}.ilstrings", base).to_lowercase();

    let mut result = ExtractedStrings::empty();
    for entry in &entries {
        let norm = entry.name.to_lowercase().replace('/', "\\");
        if norm == s_target {
            log::info!("[ba2] Extracting '{}'", entry.name);
            result.strings = Some(read_ba2_entry(&mut r, entry)?);
        } else if norm == dl_target {
            log::info!("[ba2] Extracting '{}'", entry.name);
            result.dlstrings = Some(read_ba2_entry(&mut r, entry)?);
        } else if norm == il_target {
            log::info!("[ba2] Extracting '{}'", entry.name);
            result.ilstrings = Some(read_ba2_entry(&mut r, entry)?);
        }
    }
    Ok(result)
}

fn read_ba2_entry<R: Read + Seek>(r: &mut R, e: &Ba2Entry) -> Result<Vec<u8>, ParseError> {
    // Sanity-check: data_offset must be a plausible u64 (Windows sees large u64 as
    // negative i64 and returns ERROR_NEGATIVE_SEEK = os error 131)
    if e.data_offset > (i64::MAX as u64) {
        return Err(ParseError::InvalidMagic(
            format!("BA2 entry has implausible data_offset=0x{:x} — corrupt or wrong format", e.data_offset)
        ));
    }

    r.seek(SeekFrom::Start(e.data_offset))?;

    let compressed = e.packed_size != 0 && e.comp_type != 0;
    if !compressed {
        let mut data = vec![0u8; e.unpacked_size as usize];
        r.read_exact(&mut data)?;
        Ok(data)
    } else {
        let mut raw = vec![0u8; e.packed_size as usize];
        r.read_exact(&mut raw)?;
        match e.comp_type {
            1 => zlib_decompress(&raw, e.unpacked_size as usize),
            _ => {
                // LZ4 (comp_type=2) is used by some Starfield archives.
                // Strings files are not expected to use LZ4 in practice.
                log::warn!("[ba2] Unsupported compression type {} for '{}' — skipping",
                    e.comp_type, e.name);
                Err(ParseError::InvalidMagic(format!("Unsupported BA2 compression: {}", e.comp_type)))
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BSA — Oblivion (v104) / Skyrim LE·SE (v105)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Header (36 bytes, after magic):
//   version              u32   104 | 105
//   folder_offset        u32   always 36
//   archive_flags        u32   bit0=has_dir_names  bit2=default_compressed
//                              bit8=embed_file_name (Skyrim SE)
//   folder_count         u32
//   file_count           u32
//   total_folder_name_len u32
//   total_file_name_len  u32
//   file_flags           u32
//
// Folder records
//   v104: hash(8) + count(4) + offset(4)         = 16 bytes
//   v105: hash(8) + count(4) + pad(4) + offset(8) = 24 bytes
//
// Folder blocks (sequential, immediately after all folder records):
//   [if has_dir_names] Pascal string: u8 len + len bytes (null-terminated within)
//   file_count × 16-byte file records:
//     hash(8) + size_flags(4) + data_offset(4)
//       size_flags: bit30=toggle_compress  remaining_bits=size
//
// File name block (total_file_name_len bytes):
//   null-terminated strings, one per file, in folder→file order
//
// File data at data_offset:
//   [if embed_file_name] u8 len + len bytes (Skyrim SE only)
//   [if compressed] u32 uncompressed_size + zlib data
//   [else] raw bytes

fn extract_from_bsa<R: Read + Seek>(
    mut r: R,
    plugin_stem: &str,
    lang: &str,
) -> Result<ExtractedStrings, ParseError> {
    // Magic "BSA\0" already consumed
    let version:                 u32 = r.read_le()?;
    let _folder_offset:          u32 = r.read_le()?;
    let archive_flags:           u32 = r.read_le()?;
    let folder_count:            u32 = r.read_le()?;
    let file_count:              u32 = r.read_le()?;
    let _total_folder_name_len:  u32 = r.read_le()?;
    let total_file_name_len:     u32 = r.read_le()?;
    let _file_flags:             u32 = r.read_le()?;

    let has_dir_names      = archive_flags & 0x01 != 0;
    let default_compressed = archive_flags & 0x04 != 0;
    // Bit 8 (0x100) = "Embed File Name in data block" — Skyrim SE
    let embed_file_name    = archive_flags & 0x100 != 0;

    log::debug!("[bsa] v{} folders={} files={} dir_names={} compressed={} embed_name={}",
        version, folder_count, file_count,
        has_dir_names, default_compressed, embed_file_name);

    // ── Folder records ────────────────────────────────────────────────────────
    // We only need the per-folder file count; skip the rest.
    let mut per_folder: Vec<u32> = Vec::with_capacity(folder_count as usize);
    for _ in 0..folder_count {
        let _hash: u64 = r.read_le()?;
        let count: u32 = r.read_le()?;
        if version >= 105 {
            let _pad: u32 = r.read_le()?;
            let _off: u64 = r.read_le()?;
        } else {
            let _off: u32 = r.read_le()?;
        }
        per_folder.push(count);
    }

    // ── Folder blocks (sequential) ────────────────────────────────────────────
    struct BsaFile {
        data_offset:   u32,
        size:          u32,
        is_compressed: bool,
        folder_lower:  String,
    }

    let mut all_files: Vec<BsaFile> = Vec::with_capacity(file_count as usize);

    for &count in &per_folder {
        // Optional folder name (Pascal string: u8 length + bytes, null-terminated)
        let mut folder_lower = String::new();
        if has_dir_names {
            let name_len: u8 = r.read_le()?;
            let mut name_bytes = vec![0u8; name_len as usize];
            r.read_exact(&mut name_bytes)?;
            let raw = String::from_utf8_lossy(&name_bytes);
            folder_lower = raw.trim_end_matches('\0').to_lowercase();
        }

        for _ in 0..count {
            let _hash:      u64 = r.read_le()?;
            let size_flags: u32 = r.read_le()?;
            let offset:     u32 = r.read_le()?;

            // Bit 30 toggles compression relative to the archive default
            let toggle        = (size_flags >> 30) & 1 != 0;
            let size          = size_flags & !(0b11 << 30);
            let is_compressed = default_compressed ^ toggle;

            all_files.push(BsaFile {
                data_offset:   offset,
                size,
                is_compressed,
                folder_lower:  folder_lower.clone(),
            });
        }
    }

    // ── File name block ───────────────────────────────────────────────────────
    let mut name_block = vec![0u8; total_file_name_len as usize];
    r.read_exact(&mut name_block)?;

    let mut file_names: Vec<String> = Vec::with_capacity(all_files.len());
    let mut start = 0usize;
    for (i, &b) in name_block.iter().enumerate() {
        if b == 0 {
            let name = String::from_utf8_lossy(&name_block[start..i]).to_lowercase();
            file_names.push(name);
            start = i + 1;
            if file_names.len() >= all_files.len() { break; }
        }
    }
    // Handle last entry if not followed by a null byte
    if file_names.len() < all_files.len() && start < name_block.len() {
        let name = String::from_utf8_lossy(&name_block[start..]).to_lowercase();
        file_names.push(name);
    }

    // ── Match ─────────────────────────────────────────────────────────────────
    let base      = format!("{}_{}", plugin_stem, lang).to_lowercase();
    let s_target  = format!("{}.strings",   base);
    let dl_target = format!("{}.dlstrings", base);
    let il_target = format!("{}.ilstrings", base);

    let mut result = ExtractedStrings::empty();

    for (file, name) in all_files.iter().zip(file_names.iter()) {
        // Strings folder check (case-insensitive)
        if !file.folder_lower.contains("strings") { continue; }

        if *name == s_target {
            log::info!("[bsa] Extracting '{}/{}'", file.folder_lower, name);
            result.strings = Some(
                read_bsa_file(&mut r, file.data_offset, file.size, file.is_compressed, embed_file_name)?
            );
        } else if *name == dl_target {
            log::info!("[bsa] Extracting '{}/{}'", file.folder_lower, name);
            result.dlstrings = Some(
                read_bsa_file(&mut r, file.data_offset, file.size, file.is_compressed, embed_file_name)?
            );
        } else if *name == il_target {
            log::info!("[bsa] Extracting '{}/{}'", file.folder_lower, name);
            result.ilstrings = Some(
                read_bsa_file(&mut r, file.data_offset, file.size, file.is_compressed, embed_file_name)?
            );
        }
    }

    Ok(result)
}

fn read_bsa_file<R: Read + Seek>(
    r:               &mut R,
    offset:          u32,
    size:            u32,
    is_compressed:   bool,
    embed_file_name: bool,
) -> Result<Vec<u8>, ParseError> {
    r.seek(SeekFrom::Start(offset as u64))?;
    let mut remaining = size;

    // Skip embedded file name header (Skyrim SE "Retain File Name In Data" flag)
    if embed_file_name {
        let name_len: u8 = r.read_le()?;
        let mut skip = vec![0u8; name_len as usize];
        r.read_exact(&mut skip)?;
        remaining = remaining.saturating_sub(1 + name_len as u32);
    }

    if !is_compressed {
        let mut data = vec![0u8; remaining as usize];
        r.read_exact(&mut data)?;
        Ok(data)
    } else {
        // Compressed layout: u32 uncompressed_size + zlib-deflate data
        let uncompressed_size: u32 = r.read_le()?;
        let compressed_len = remaining as usize - 4;
        let mut compressed = vec![0u8; compressed_len];
        r.read_exact(&mut compressed)?;
        zlib_decompress(&compressed, uncompressed_size as usize)
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

fn zlib_decompress(data: &[u8], expected: usize) -> Result<Vec<u8>, ParseError> {
    let mut dec = ZlibDecoder::new(data);
    let mut out = Vec::with_capacity(expected);
    dec.read_to_end(&mut out)?;
    Ok(out)
}
