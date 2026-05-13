use std::io::Write;
use serde::{Deserialize, Serialize};
use crate::database::{store::TranslationDb, types::DbEntry};

// ── Binary read helpers ───────────────────────────────────────────────────────

fn read_u16_le(data: &[u8], pos: &mut usize) -> Result<u16, String> {
    if *pos + 2 > data.len() { return Err("Unexpected end of file (u16)".into()); }
    let v = u16::from_le_bytes(data[*pos..*pos+2].try_into().unwrap());
    *pos += 2;
    Ok(v)
}

fn read_u32_le(data: &[u8], pos: &mut usize) -> Result<u32, String> {
    if *pos + 4 > data.len() { return Err("Unexpected end of file (u32)".into()); }
    let v = u32::from_le_bytes(data[*pos..*pos+4].try_into().unwrap());
    *pos += 4;
    Ok(v)
}

fn read_lp_string(data: &[u8], pos: &mut usize) -> Result<String, String> {
    let len = read_u32_le(data, pos)? as usize;
    if *pos + len > data.len() { return Err("Unexpected end of file (string)".into()); }
    let s = String::from_utf8_lossy(&data[*pos..*pos+len]).into_owned();
    *pos += len;
    Ok(s)
}

fn skip_bytes(data: &[u8], pos: &mut usize, n: usize) -> Result<(), String> {
    if *pos + n > data.len() { return Err(format!("Unexpected end of file (skip {})", n)); }
    *pos += n;
    Ok(())
}

/// Scans for the next valid entry boundary:
/// u32 LE == 4 followed by 4 bytes all uppercase ASCII or '_' (Bethesda record type).
fn scan_for_entry(data: &[u8], start: usize) -> Option<usize> {
    let mut p = start;
    while p + 8 <= data.len() {
        // Quick check: first byte must be 4, the next 3 must be 0
        if data[p] == 4 && data[p+1] == 0 && data[p+2] == 0 && data[p+3] == 0 {
            let tag = &data[p+4..p+8];
            if tag.iter().all(|&b| b.is_ascii_uppercase() || b == b'_') {
                return Some(p);
            }
        }
        p += 1;
    }
    None
}

// ── Native .bgt format (bincode + zstd) ──────────────────────────────────────

const BGT_MAGIC:   &[u8; 4] = b"BGTD";
const BGT_VERSION: u8       = 1;

#[derive(Serialize, Deserialize)]
struct BgtData {
    name:      String,
    game:      String,
    lang_from: String,
    lang_to:   String,
    entries:   Vec<DbEntry>,
}

pub fn save_bgt(db: &TranslationDb, path: &std::path::Path) -> Result<(), String> {
    let data = BgtData {
        name:      db.name.clone(),
        game:      db.game.clone(),
        lang_from: db.lang_from.clone(),
        lang_to:   db.lang_to.clone(),
        entries:   db.entries().to_vec(),
    };
    let encoded     = bincode::serialize(&data).map_err(|e| e.to_string())?;
    let compressed  = zstd::encode_all(encoded.as_slice(), 3).map_err(|e| e.to_string())?;
    let mut file    = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(BGT_MAGIC).map_err(|e| e.to_string())?;
    file.write_all(&[BGT_VERSION]).map_err(|e| e.to_string())?;
    file.write_all(&compressed).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_bgt(path: &std::path::Path) -> Result<TranslationDb, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() < 5 || &bytes[..4] != BGT_MAGIC {
        return Err("Invalid .bgt format (bad magic bytes)".into());
    }
    let decompressed = zstd::decode_all(&bytes[5..]).map_err(|e| e.to_string())?;
    let data: BgtData = bincode::deserialize(&decompressed).map_err(|e| e.to_string())?;
    Ok(TranslationDb::from_entries(data.name, data.game, data.lang_from, data.lang_to, false, data.entries))
}

// ── CSV / TSV ─────────────────────────────────────────────────────────────────
// Expected format (with or without header row):
//   original<sep>translated<sep>record_type<sep>sub_type<sep>editor_id

pub fn import_delimited(path: &std::path::Path, sep: char) -> Result<Vec<DbEntry>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    let mut first   = true;

    for line in content.lines() {
        // Detect and skip header row if present
        if first {
            first = false;
            let lower = line.to_lowercase();
            if lower.starts_with("original") || lower.starts_with("source") { continue; }
        }
        let cols: Vec<&str> = line.splitn(5, sep).collect();
        if cols.len() < 2 { continue; }
        let original   = cols[0].trim().to_string();
        let translated = cols[1].trim().to_string();
        if original.is_empty() || translated.is_empty() { continue; }
        entries.push(DbEntry {
            original,
            translated,
            record_type: cols.get(2).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            sub_type:    cols.get(3).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            editor_id:   cols.get(4).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        });
    }
    Ok(entries)
}

pub fn export_delimited(db: &TranslationDb, path: &std::path::Path, sep: char) -> Result<(), String> {
    let s   = sep;
    let mut out = format!("Original{s}Translated{s}RecordType{s}SubType{s}EditorId\n");
    for e in db.entries() {
        out.push_str(&format!(
            "{}{s}{}{s}{}{s}{}{s}{}\n",
            e.original,
            e.translated,
            e.record_type.as_deref().unwrap_or(""),
            e.sub_type.as_deref().unwrap_or(""),
            e.editor_id.as_deref().unwrap_or(""),
        ));
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

// ── .eet format (ESP/ESM Translator by Epervier666) ──────────────────────────
//
// Header structure (minimum 30 bytes):
//   [0-3]   "EET_" magic
//   [4-7]   version u32 LE
//   [8-11]  game_id u32 LE
//   [12-15] "GAME" tag
//   [16-17] game_name_len u16 LE  (usually 0)
//   [18..+game_name_len] game name
//   [+0..+3] "LINE" tag
//   [+4..+7] entry_count u32 LE
//   [+8..+11] unknown u32 LE
//
// Per-entry structure (variable size):
//   record_type  : u32-prefixed string
//   formid       : u32-prefixed string
//   editor_id    : u32-prefixed string
//   sub_type     : u32-prefixed string
//   original     : u32-prefixed string (UTF-8)
//   translated   : u32-prefixed string (UTF-8)
//   perso        : u32-prefixed string (optional note)
//   status       : u32
//   12 bytes     : unknown (skip)
//   search_key   : u32-prefixed string
//   20 bytes     : trailing (skip)

// (game_id not mapped — ESP/ESM Translator numbering is undocumented)

/// Loads a .eet file and returns (game_name, entries).
pub fn load_eet(path: &std::path::Path) -> Result<(String, Vec<DbEntry>), String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    if data.len() < 30 { return Err(".eet file is too short".into()); }
    if &data[0..4] != b"EET_" { return Err("Invalid .eet magic bytes".into()); }

    let mut pos = 4usize;
    let _version = read_u32_le(&data, &mut pos)?;
    let  game_id = read_u32_le(&data, &mut pos)?;

    // "GAME" tag
    if pos + 4 > data.len() || &data[pos..pos+4] != b"GAME" {
        return Err("Missing 'GAME' tag in .eet header".into());
    }
    pos += 4;

    let _ = game_id; // unused (mapping undocumented)
    let game_name_len = read_u16_le(&data, &mut pos)? as usize;
    // Read the game name from the header if present (usually empty)
    let game_name = if game_name_len > 0 && pos + game_name_len <= data.len() {
        let s = String::from_utf8_lossy(&data[pos..pos+game_name_len]).into_owned();
        pos += game_name_len;
        s
    } else {
        pos += game_name_len;
        String::new() // caller supplies the default name
    };

    // "LINE" tag
    if pos + 4 > data.len() || &data[pos..pos+4] != b"LINE" {
        return Err("Missing 'LINE' tag in .eet header".into());
    }
    pos += 4;

    let entry_count = read_u32_le(&data, &mut pos)? as usize;
    let _unknown    = read_u32_le(&data, &mut pos)?;

    let file_size = data.len();
    let mut entries = Vec::with_capacity(entry_count.min(1_000_000));
    let mut sync_errors = 0usize;
    let mut i = 0usize;

    while i < entry_count {
        if pos + 8 > file_size {
            log::warn!("[eet] Premature end of file at entry {}/{} (pos={})", i, entry_count, pos);
            break;
        }

        // ── Entry marker validation (record_type_len must be 4) ──
        let rt_len_raw = u32::from_le_bytes(data[pos..pos+4].try_into().unwrap());
        if rt_len_raw != 4 {
            log::warn!("[eet] Desync at entry {}: rt_len={} pos={}/{}", i, rt_len_raw, pos, file_size);
            sync_errors += 1;
            if sync_errors > 500 {
                log::error!("[eet] Too many desync errors, aborting parse");
                break;
            }
            match scan_for_entry(&data, pos + 1) {
                Some(rp) => { pos = rp; continue; }
                None     => { break; }
            }
        }

        let entry_start = pos;

        // ── Safe field reading ────────────────────────────────────────────────
        // On failure: rollback to entry_start + 1 and scan for the next entry; entry is skipped.
        macro_rules! read_str {
            ($label:expr) => {
                match read_lp_string(&data, &mut pos) {
                    Ok(s) => s,
                    Err(_) => {
                        log::warn!("[eet] Entry {} field '{}' unreadable", i, $label);
                        pos = scan_for_entry(&data, entry_start + 1).unwrap_or(file_size);
                        i += 1;
                        continue;
                    }
                }
            };
        }
        macro_rules! read_u32_field {
            ($label:expr) => {
                match read_u32_le(&data, &mut pos) {
                    Ok(v) => v,
                    Err(_) => {
                        log::warn!("[eet] Entry {} field '{}' unreadable", i, $label);
                        pos = scan_for_entry(&data, entry_start + 1).unwrap_or(file_size);
                        i += 1;
                        continue;
                    }
                }
            };
        }

        // ── Data fields (fixed structure) ─────────────────────────────────────
        let record_type = read_str!("record_type");
        let _formid     = read_str!("formid");
        let editor_id   = read_str!("edid");
        let sub_type    = read_str!("sub_type");
        let original    = read_str!("original");
        let translated  = read_str!("translated");
        let _perso      = read_str!("perso");
        let _status     = read_u32_field!("status");

        // ── Trailing bytes (variable per entry) ──────────────────────────────
        // Strategy: explicit parsing first (more precise, no false positives).
        // If any trailing field fails, fall back to scan_for_entry from the
        // current position. The entry is kept either way.
        let trailing_ok = (|| -> Option<()> {
            skip_bytes(&data, &mut pos, 14).ok()?;             // 14 unknown bytes
            read_lp_string(&data, &mut pos).ok()?;             // search_key
            skip_bytes(&data, &mut pos, 4).ok()?;              // hash
            read_lp_string(&data, &mut pos).ok()?;             // extra_a (empty string if absent)
            read_lp_string(&data, &mut pos).ok()?;             // extra_b (empty string if absent)
            read_u32_le(&data, &mut pos).ok()?;                // sentinel (FF FF FF FF)
            read_u32_le(&data, &mut pos).ok()?;                // entry_sz
            Some(())
        })();
        if trailing_ok.is_none() {
            // Fallback: advance from the current position (not entry_start) to
            // avoid false positives from scan_for_entry matching earlier data.
            pos = scan_for_entry(&data, pos).unwrap_or(file_size);
        }

        if i < 3 {
            log::debug!("[eet] Entry {} : {}/{}", i, record_type, sub_type);
        }

        i += 1;

        if original.is_empty() { continue; }

        entries.push(DbEntry {
            original,
            translated,
            record_type: if record_type.is_empty() { None } else { Some(record_type) },
            sub_type:    if sub_type.is_empty()    { None } else { Some(sub_type) },
            editor_id:   if editor_id.is_empty()   { None } else { Some(editor_id) },
        });
    }

    if sync_errors > 0 {
        log::warn!("[eet] {} desync error(s) during parsing", sync_errors);
    }
    log::info!("[eet] {} entries loaded from '{}' (declared: {})",
        entries.len(), path.display(), entry_count);
    Ok((game_name, entries))
}

/// Reads just the game name from a .bgt file without loading all entries.
/// Returns None if the file is not a valid .bgt or if the game field is empty.
pub fn peek_bgt_game(path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 5 || &bytes[..4] != BGT_MAGIC { return None; }
    let decompressed = zstd::decode_all(&bytes[5..]).ok()?;
    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct BgtHeader { name: String, game: String }
    let header: BgtHeader = bincode::deserialize(&decompressed).ok()?;
    if header.game.is_empty() { None } else { Some(header.game) }
}

// ── Automatic format detection ───────────────────────────────────────────────

pub fn load_any(path: &std::path::Path) -> Result<TranslationDb, String> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "bgt" => load_bgt(path),
        "csv" => {
            let entries = import_delimited(path, ',')?;
            Ok(TranslationDb::from_entries(
                path.file_stem().and_then(|s| s.to_str()).unwrap_or("Import").to_owned(),
                "unknown".into(), "en".into(), "fr".into(), false, entries,
            ))
        }
        "tsv" => {
            let entries = import_delimited(path, '\t')?;
            Ok(TranslationDb::from_entries(
                path.file_stem().and_then(|s| s.to_str()).unwrap_or("Import").to_owned(),
                "unknown".into(), "en".into(), "fr".into(), false, entries,
            ))
        }
        "eet" => {
            let (game, entries) = load_eet(path)?;
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Import EET").to_owned();
            let game = if game.is_empty() { "Starfield".into() } else { game };
            Ok(TranslationDb::from_entries(stem, game, "en".into(), "fr".into(), true, entries))
        }
        _ => Err(format!("Unsupported format: .{}", ext)),
    }
}
