use std::{
    fs::File,
    io::{BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};
use binrw::BinReaderExt;
use serde::{Deserialize, Serialize};

use crate::parser::{
    error::ParseError,
    group::{GroupHeader, GroupType},
    record::{RawRecord, RecordHeader},
    strings_file::{load_strings_file, StringResolver},
    subrecord::parse_subrecords,
    types::{is_translatable_record, translatable_subrecords},
};
use crate::translation::entry::{StringSource, TranslationEntry};

/// Metadata extracted from the TES4 record (file header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub author:      String,
    pub description: String,
    pub masters:     Vec<String>,
    pub is_localized: bool,
    pub version:     f32,
}

/// Result of opening file.
pub struct LoadedFile {
    pub path:    PathBuf,
    pub info:    PluginInfo,
    pub entries: Vec<TranslationEntry>,
}

/// Main entry point: Open an .esp/.esm file and extracts all translatable strings.
pub fn open_file(path: &Path) -> Result<LoadedFile, ParseError> {
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
    let resolver = if is_localized {
        log::debug!("[parser] Loading files .strings...");
        let r = load_string_resolver(path, &info)?;
        log::info!("[parser] strings={} dlstrings={} ilstrings={}",
            r.strings.len(), r.dlstrings.len(), r.ilstrings.len());
        r
    } else {
        log::debug!("[parser] Not localized file, no file .strings");
        StringResolver::empty()
    };

    // --- Loop GRUPs and extract strings ---
    log::debug!("[parser] Loop on GRUPs...");
    let mut entries = Vec::new();
    parse_groups(&mut reader, is_localized, &resolver, &mut entries)?;
    log::info!("[parser] {} translatable entries extracted", entries.len());

    Ok(LoadedFile { path: path.to_owned(), info, entries })
}

fn parse_tes4_data(data: &[u8], _is_localized: bool) -> Result<PluginInfo, ParseError> {
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

    Ok(PluginInfo { author, description, masters, is_localized: false, version })
}

/// Searches for and loads the plugin's .strings, .dlstrings, and .ilstrings files.
/// Bethesda convention: <PluginDir>/Strings/<PluginName>_<Lang>.strings
fn load_string_resolver(plugin_path: &Path, _info: &PluginInfo) -> Result<StringResolver, ParseError> {
    let plugin_stem = plugin_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    // Go back to the Data folder, then look for Strings/
    let data_dir = plugin_path.parent().unwrap_or(plugin_path);
    let strings_dir = data_dir.join("Strings");

    log::debug!("[strings] Folder strings : {}", strings_dir.display());
    let mut resolver = StringResolver::empty();

    for lang in &["fr", "en"] {
        let base = format!("{}_{}", plugin_stem, lang);

        let s_path = strings_dir.join(format!("{}.strings", base));
        let d_path = strings_dir.join(format!("{}.dlstrings", base));
        let i_path = strings_dir.join(format!("{}.ilstrings", base));

        log::debug!("[strings] Search : {}", s_path.display());

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

        if !resolver.strings.is_empty() || !resolver.dlstrings.is_empty() {
            log::debug!("[strings] Language found : {}", lang);
            break;
        }
    }

    if resolver.strings.is_empty() && resolver.dlstrings.is_empty() && resolver.ilstrings.is_empty() {
        log::warn!("[strings] No .strings files found in {}", strings_dir.display());
    }

    Ok(resolver)
}

/// Recursively traverses the GRUPs in the file.
fn parse_groups<R: Read + Seek>(
    r: &mut R,
    is_localized: bool,
    resolver: &StringResolver,
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
                parse_records_in_group(r, group_end, is_localized, resolver, entries)?;
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
    resolver: &StringResolver,
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
            parse_records_in_group(r, sub_end, is_localized, resolver, entries)?;
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
                    resolver,
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

fn extract_entries_from_record(
    form_id:      u32,
    rec_type:     &[u8; 4],
    data:         &[u8],
    is_localized: bool,
    resolver:     &StringResolver,
    entries:      &mut Vec<TranslationEntry>,
) -> Result<(), ParseError> {
    let subrecords = parse_subrecords(data)?;
    let rec_type_str = std::str::from_utf8(rec_type).unwrap_or("????").to_owned();

    // Context menu: Which subrecords can be translated for this record type?
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

        let (text, source) = if is_localized {
            let Some(string_id) = sub.as_string_id() else { continue };
            if string_id == 0 { continue }
            let resolved = match kind {
                crate::parser::strings_file::StringFileKind::Strings   => resolver.resolve_strings(string_id),
                crate::parser::strings_file::StringFileKind::DlStrings => resolver.resolve_dlstrings(string_id),
                crate::parser::strings_file::StringFileKind::IlStrings => resolver.resolve_ilstrings(string_id),
            };
            let text = resolved.unwrap_or("").to_owned();
            (text, StringSource::Localized { string_id, kind })
        } else {
            let Some(text) = sub.as_string() else { continue };
            if text.is_empty() { continue }
            // Filters strings that contain only non-printable characters
            if !looks_like_translatable_text(&text) { continue }
            (text, StringSource::Inline { sub_type: sub.type_str().to_owned() })
        };

        if text.is_empty() { continue }

        // GMST DATA: Keep only settings whose EDID starts with 's'
        if rec_type == b"GMST" && &sub.sub_type == b"DATA" && !editor_id.starts_with('s') {
            continue;
        }

        entries.push(TranslationEntry {
            form_id,
            record_type: rec_type_str.clone(),
            editor_id:   editor_id.clone(),
            sub_type:    sub.type_str().to_owned(),
            original:    text,
            translated:  String::new(),
            status:      crate::translation::entry::EntryStatus::default(),
            source,
        });
    }

    Ok(())
}

/// Returns false if the text resembles an internal reference rather than readable text:
/// - contains control characters (excluding \n, \r, \t)
/// - consists entirely of non-alphabetic ASCII characters (e.g., “k20”, “00FF1A”)
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
