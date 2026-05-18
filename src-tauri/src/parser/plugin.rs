use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};
use binrw::BinReaderExt;
use serde::{Deserialize, Serialize};

use crate::parser::{
    archive::extract_strings_from_archives,
    error::ParseError,
    group::{GroupHeader, GroupType},
    record::{RawRecord, RecordHeader},
    strings_file::{load_strings_file, parse_strings_from_bytes, StringResolver},
    subrecord::parse_subrecords,
    types::{is_translatable_record, translatable_subrecords},
};
use crate::translation::entry::{EntryStatus, StringSource, TranslationEntry};

/// Metadata extracted from the TES4 record (file header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub author:       String,
    pub description:  String,
    pub masters:      Vec<String>,
    pub is_localized: bool,
    #[serde(default)]
    pub version:      f32,
}

/// Result of opening file.
pub struct LoadedFile {
    pub path:    PathBuf,
    pub info:    PluginInfo,
    pub entries: Vec<TranslationEntry>,
}

/// Main entry point: Open an .esp/.esm file and extracts all translatable strings.
///
/// `target_lang` is the user's configured target language (e.g. "fr").
/// For localized plugins, English ("en") is always loaded as `original` and
/// `target_lang` is loaded as `translated` (pre-populated if a translation exists).
///
/// `on_status` is an optional progress callback called with a short string key at key
/// stages (e.g. `"loading_strings"`, `"parsing_records"`).  Pass `|_| {}` to ignore.
pub fn open_file(path: &Path, target_lang: &str, on_status: impl Fn(&str)) -> Result<LoadedFile, ParseError> {
    log::info!("[parser] Open file : {}", path.display());

    let file = File::open(path).map_err(|e| {
        log::error!("[parser] Unable to open the file : {}", e);
        ParseError::Io(e)
    })?;
    let mut reader = BufReader::new(file);

    // --- Read the TES4 record (plugin header) ---
    log::debug!("[parser] Reading the TES4 record...");
    let tes4 = RawRecord::read(&mut reader).map_err(|e| {
        log::error!("[parser] TES4 read error : {}", e);
        e
    })?;

    if &tes4.header.rec_type != b"TES4" {
        let msg = format!("Expected TES4, found {}", tes4.header.type_str());
        log::error!("[parser] Invalid magic : {}", msg);
        return Err(ParseError::InvalidMagic(msg));
    }

    let is_localized = tes4.header.is_localized();
    log::info!("[parser] Localized file : {}", is_localized);

    let info = parse_tes4_data(&tes4.data, is_localized)?;
    log::info!("[parser] Author : {:?} | Masters : {:?}", info.author, info.masters);

    // --- Load .strings files if localized ---
    // Always use "en" as source language; target_lang for pre-populated translations.
    let (src_resolver, tgt_resolver) = if is_localized {
        log::debug!("[parser] Loading .strings files (src=en, tgt={})...", target_lang);
        on_status("loading_strings");
        let resolvers = load_string_resolvers(path, &info, "en", target_lang)?;
        log::info!("[parser] src strings={} dlstrings={} ilstrings={}",
            resolvers.0.strings.len(), resolvers.0.dlstrings.len(), resolvers.0.ilstrings.len());
        log::info!("[parser] tgt strings={} dlstrings={} ilstrings={}",
            resolvers.1.strings.len(), resolvers.1.dlstrings.len(), resolvers.1.ilstrings.len());
        resolvers
    } else {
        log::debug!("[parser] Not localized file, no .strings files needed");
        (StringResolver::empty(), StringResolver::empty())
    };

    // --- Loop GRUPs and extract strings ---
    log::debug!("[parser] Loop on GRUPs...");
    on_status("parsing_records");
    let mut entries = Vec::new();
    parse_groups(&mut reader, is_localized, &src_resolver, &tgt_resolver, &mut entries)?;
    log::info!("[parser] {} translatable entries extracted", entries.len());

    Ok(LoadedFile { path: path.to_owned(), info, entries })
}

fn parse_tes4_data(data: &[u8], is_localized: bool) -> Result<PluginInfo, ParseError> {
    let subrecords = parse_subrecords(data)?;

    let mut author      = String::new();
    let mut description = String::new();
    let mut masters     = Vec::new();
    let mut version     = 0.0f32;

    for sub in &subrecords {
        match &sub.sub_type {
            b"CNAM" => author      = sub.as_string().unwrap_or_default(),
            b"SNAM" => description = sub.as_string().unwrap_or_default(),
            b"MAST" => masters.push(sub.as_string().unwrap_or_default()),
            b"HEDR" => {
                // HEDR = f32 version + u32 num_records + u32 next_object_id
                if sub.data.len() >= 4 {
                    version = f32::from_le_bytes(sub.data[0..4].try_into().unwrap_or([0; 4]));
                }
            }
            _ => {}
        }
    }

    Ok(PluginInfo { author, description, masters, is_localized, version })
}

// ── String resolver loading ───────────────────────────────────────────────────

/// Loads string resolvers for both source and target languages.
/// Returns `(src_resolver, tgt_resolver)`.
/// Source language is always "en" (English); target is the user-configured language.
fn load_string_resolvers(
    plugin_path: &Path,
    info: &PluginInfo,
    src_lang: &str,
    tgt_lang: &str,
) -> Result<(StringResolver, StringResolver), ParseError> {
    let src = load_resolver_for_lang(plugin_path, info, src_lang)?;

    // Avoid loading the same language twice
    let tgt = if !tgt_lang.is_empty() && tgt_lang != src_lang {
        load_resolver_for_lang(plugin_path, info, tgt_lang)?
    } else {
        StringResolver::empty()
    };

    Ok((src, tgt))
}

/// Loads a StringResolver for a single language, searching loose files first,
/// then BA2/BSA archives as fallback.
/// Returns an empty resolver (no error) if no strings are found for that language.
fn load_resolver_for_lang(
    plugin_path: &Path,
    _info: &PluginInfo,
    lang: &str,
) -> Result<StringResolver, ParseError> {
    let plugin_stem = plugin_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    let data_dir    = plugin_path.parent().unwrap_or(plugin_path);
    let strings_dir = data_dir.join("Strings");
    let base        = format!("{}_{}", plugin_stem, lang);

    let mut resolver = StringResolver::empty();

    // 1. Loose .strings files
    let s_path = strings_dir.join(format!("{}.strings",   base));
    let d_path = strings_dir.join(format!("{}.dlstrings", base));
    let i_path = strings_dir.join(format!("{}.ilstrings", base));

    if s_path.exists() {
        log::info!("[strings] Loading : {}", s_path.display());
        resolver.strings = load_strings_file(&s_path).unwrap_or_else(|e| {
            log::error!("[strings] Read error .strings : {}", e);
            Default::default()
        });
    }
    if d_path.exists() {
        log::info!("[strings] Loading : {}", d_path.display());
        resolver.dlstrings = load_strings_file(&d_path).unwrap_or_else(|e| {
            log::error!("[strings] Read error .dlstrings : {}", e);
            Default::default()
        });
    }
    if i_path.exists() {
        log::info!("[strings] Loading : {}", i_path.display());
        resolver.ilstrings = load_strings_file(&i_path).unwrap_or_else(|e| {
            log::error!("[strings] Read error .ilstrings : {}", e);
            Default::default()
        });
    }

    // 2. Archive fallback (BA2 / BSA)
    if resolver.strings.is_empty() && resolver.dlstrings.is_empty() && resolver.ilstrings.is_empty() {
        log::debug!("[strings] No loose files for lang '{}' — searching archives…", lang);
        if let Some(ex) = extract_strings_from_archives(data_dir, plugin_stem, lang) {
            if let Some(bytes) = ex.strings {
                resolver.strings = parse_strings_from_bytes(&bytes, "strings").unwrap_or_else(|e| {
                    log::error!("[strings] Archive .strings parse error: {}", e);
                    Default::default()
                });
            }
            if let Some(bytes) = ex.dlstrings {
                resolver.dlstrings = parse_strings_from_bytes(&bytes, "dlstrings").unwrap_or_else(|e| {
                    log::error!("[strings] Archive .dlstrings parse error: {}", e);
                    Default::default()
                });
            }
            if let Some(bytes) = ex.ilstrings {
                resolver.ilstrings = parse_strings_from_bytes(&bytes, "ilstrings").unwrap_or_else(|e| {
                    log::error!("[strings] Archive .ilstrings parse error: {}", e);
                    Default::default()
                });
            }

            if !resolver.strings.is_empty() || !resolver.dlstrings.is_empty() || !resolver.ilstrings.is_empty() {
                log::info!("[strings] Strings loaded from archive for lang '{}'", lang);
            }
        }

        if resolver.strings.is_empty() && resolver.dlstrings.is_empty() && resolver.ilstrings.is_empty() {
            log::warn!("[strings] No .strings files found for lang '{}' (loose or in archives)", lang);
        }
    }

    Ok(resolver)
}

// ── GRUP traversal ────────────────────────────────────────────────────────────

/// Recursively traverses the GRUPs in the file.
fn parse_groups<R: Read + Seek>(
    r: &mut R,
    is_localized: bool,
    src_resolver: &StringResolver,
    tgt_resolver: &StringResolver,
    entries: &mut Vec<TranslationEntry>,
) -> Result<(), ParseError> {
    loop {
        let mut magic = [0u8; 4];
        match r.read_exact(&mut magic) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(ParseError::Io(e)),
        }

        if &magic == GroupHeader::MAGIC {
            let group = GroupHeader::read_after_magic(r)?;
            let group_end = r.stream_position()? + group.data_size();

            // We only enter top-level groups that contain translatable records
            if group.group_type == GroupType::TopLevel && is_translatable_record(&group.label) {
                parse_records_in_group(r, group_end, is_localized, src_resolver, tgt_resolver, entries)?;
            } else {
                // Skip the group
                r.seek(SeekFrom::Start(group_end))?;
            }
        } else {
            // Not a GRUP; we stop (end of file or unexpected structure)
            break;
        }
    }
    Ok(())
}

fn parse_records_in_group<R: Read + Seek>(
    r: &mut R,
    group_end: u64,
    is_localized: bool,
    src_resolver: &StringResolver,
    tgt_resolver: &StringResolver,
    entries: &mut Vec<TranslationEntry>,
) -> Result<(), ParseError> {
    while r.stream_position()? < group_end {
        let mut magic = [0u8; 4];
        match r.read_exact(&mut magic) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(ParseError::Io(e)),
        }

        if &magic == GroupHeader::MAGIC {
            // Subgroup (cells, dialog boxes, etc.) → traverse recursively
            let sub_group = GroupHeader::read_after_magic(r)?;
            let sub_end = r.stream_position()? + sub_group.data_size();
            parse_records_in_group(r, sub_end, is_localized, src_resolver, tgt_resolver, entries)?;
        } else {
            // That's a record
            let rec_type = magic;
            let data_size:        u32 = r.read_le()?;
            let flags:            u32 = r.read_le()?;
            let form_id:          u32 = r.read_le()?;
            let _timestamp:       u16 = r.read_le()?;
            let _version_control: u16 = r.read_le()?;
            let _internal_ver:    u16 = r.read_le()?;
            let _unknown:         u16 = r.read_le()?;

            let header = RecordHeader {
                rec_type,
                data_size,
                flags,
                form_id,
                timestamp: 0,
                version_control: 0,
                internal_version: 0,
                unknown: 0,
            };

            if is_translatable_record(&rec_type) {
                let data = read_and_decompress(r, &header)?;
                extract_entries_from_record(
                    form_id,
                    &rec_type,
                    &data,
                    is_localized,
                    src_resolver,
                    tgt_resolver,
                    entries,
                )?;
            } else {
                header.skip_data(r)?;
            }
        }
    }
    Ok(())
}

fn read_and_decompress<R: Read + Seek>(
    r: &mut R,
    header: &RecordHeader,
) -> Result<Vec<u8>, ParseError> {
    if header.is_compressed() {
        let decompressed_size: u32 = r.read_le()?;
        let compressed_len = (header.data_size - 4) as usize;
        let mut compressed = vec![0u8; compressed_len];
        r.read_exact(&mut compressed)?;

        let mut decoder = flate2::read::ZlibDecoder::new(compressed.as_slice());
        let mut out = Vec::with_capacity(decompressed_size as usize);
        decoder.read_to_end(&mut out)?;
        Ok(out)
    } else {
        let mut data = vec![0u8; header.data_size as usize];
        r.read_exact(&mut data)?;
        Ok(data)
    }
}

/// Resolve a string ID from the correct table based on the string file kind.
fn resolve_by_kind<'a>(
    resolver: &'a StringResolver,
    kind: crate::parser::strings_file::StringFileKind,
    id: u32,
) -> &'a str {
    match kind {
        crate::parser::strings_file::StringFileKind::Strings   => resolver.resolve_strings(id).unwrap_or(""),
        crate::parser::strings_file::StringFileKind::DlStrings => resolver.resolve_dlstrings(id).unwrap_or(""),
        crate::parser::strings_file::StringFileKind::IlStrings => resolver.resolve_ilstrings(id).unwrap_or(""),
    }
}

fn extract_entries_from_record(
    form_id:      u32,
    rec_type:     &[u8; 4],
    data:         &[u8],
    is_localized: bool,
    src_resolver: &StringResolver,
    tgt_resolver: &StringResolver,
    entries:      &mut Vec<TranslationEntry>,
) -> Result<(), ParseError> {
    let subrecords = parse_subrecords(data)?;
    let rec_type_str = std::str::from_utf8(rec_type).unwrap_or("????").to_owned();

    // Which subrecords can be translated for this record type?
    let translatable = translatable_subrecords(rec_type);

    let editor_id = subrecords
        .iter()
        .find(|s| &s.sub_type == b"EDID")
        .and_then(|s| s.as_string())
        .unwrap_or_default();

    for sub in &subrecords {
        // Check whether this subrecord can be translated in the context of this record
        let Some(&(_, kind)) = translatable.iter().find(|(t, _)| *t == &sub.sub_type) else {
            continue;
        };

        let (original, translated, source) = if is_localized {
            let Some(string_id) = sub.as_string_id() else { continue };
            if string_id == 0 { continue }

            // Resolve using the appropriate string table kind
            let src_text = resolve_by_kind(src_resolver, kind, string_id).to_owned();
            let tgt_text = resolve_by_kind(tgt_resolver, kind, string_id).to_owned();

            // Skip entries that have no text at all (string ID not present in either resolver)
            if src_text.is_empty() && tgt_text.is_empty() { continue }

            // If English source is missing but we have a target translation, use target
            // as the displayed original (better than showing nothing).
            let (orig, trans) = if src_text.is_empty() {
                (tgt_text, String::new())
            } else {
                (src_text, tgt_text)
            };

            (orig, trans, StringSource::Localized { string_id, kind })
        } else {
            // Non-localized plugin: strings are inline in the record
            let Some(text) = sub.as_string() else { continue };
            if text.is_empty() { continue }
            // Filter out strings that look like internal references rather than readable text
            if !looks_like_translatable_text(&text) { continue }
            (text, String::new(), StringSource::Inline { sub_type: sub.type_str().to_owned() })
        };

        if original.is_empty() { continue }

        // GMST DATA: keep only settings whose EDID starts with 's'
        if rec_type == b"GMST" && &sub.sub_type == b"DATA" && !editor_id.starts_with('s') {
            continue;
        }

        // Status: Validated if we already have a target-language translation, else Untranslated
        let status = if !translated.is_empty() {
            EntryStatus::Validated
        } else {
            EntryStatus::default() // Untranslated
        };

        entries.push(TranslationEntry {
            form_id,
            record_type: rec_type_str.clone(),
            editor_id:   editor_id.clone(),
            sub_type:    sub.type_str().to_owned(),
            original,
            translated,
            status,
            source,
        });
    }

    Ok(())
}

/// Returns false if the text resembles an internal reference rather than readable text:
/// - contains control characters (excluding \n, \r, \t)
/// - consists entirely of non-alphabetic ASCII characters (e.g., "k20", "00FF1A")
fn looks_like_translatable_text(s: &str) -> bool {
    // Reject strings with control characters (except common whitespace)
    if s.chars().any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t') {
        return false;
    }
    // Reject pure ASCII hex-like or code strings with no spaces and no letters > 1 word
    if s.len() <= 32 && !s.contains(' ') {
        let has_letter = s.chars().any(|c| c.is_alphabetic() && c.is_ascii());
        let all_ascii  = s.chars().all(|c| c.is_ascii());
        // If it's all ASCII characters with no spaces or letters → probably a code/ref
        if all_ascii && !has_letter { return false; }
    }
    true
}
