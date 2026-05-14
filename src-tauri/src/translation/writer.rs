use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{BufReader, BufWriter, Read, Seek, Write},
    path::Path,
};
use flate2::read::ZlibDecoder;
use crate::parser::{
    group::GroupHeader,
    record::{RecordHeader, FLAG_COMPRESSED},
    types::is_translatable_record,
};
use crate::translation::entry::{TranslationEntry, EntryStatus};

/// Translation map: (form_id + sub_type) → { original_text → translated_text }.
///
/// Keying by original text is necessary because a single record can contain
/// multiple subrecords of the same type (e.g. several CNAM fields in a QUST
/// record for different quest stages). A flat `form_id+sub_type → translation`
/// map would keep only the last value, writing the same string to every
/// occurrence. The nested map lets us pick the right translation based on the
/// actual text found in the source file.
type TranslationMap = HashMap<String, HashMap<String, String>>;

/// Write a new plugin with translations applied inline (non-localized plugin).
/// For localized plugins, see `write_strings_files`.
pub fn write_translated_plugin(
    source_path: &Path,
    output_path: &Path,
    entries: &[TranslationEntry],
) -> Result<(), String> {
    log::info!("[writer] Starting export");
    log::info!("[writer]   source : {}", source_path.display());
    log::info!("[writer]   output : {}", output_path.display());
    log::info!("[writer]   total entries : {}", entries.len());

    let validated_count = entries.iter().filter(|e| e.status == EntryStatus::Validated).count();

    // Only write validated entries — pending / untranslated / ignored are left as-is in the source.
    // Inner map: original_text → translated_text, so that multiple subrecords of the
    // same type within the same record (e.g. multiple CNAM in one QUST) each get their
    // own correct translation rather than all receiving the last one inserted.
    let mut map: TranslationMap = HashMap::new();
    for e in entries.iter().filter(|e| e.status == EntryStatus::Validated && !e.translated.is_empty()) {
        map.entry(e.unique_key())
            .or_default()
            .insert(e.original.clone(), e.translated.clone());
    }
    let translation_count: usize = map.values().map(|m| m.len()).sum();

    log::info!("[writer]   validated entries        : {}", validated_count);
    log::info!("[writer]   translations to apply    : {} across {} form_id+sub_type groups", translation_count, map.len());

    // Ensure the output directory exists
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            log::debug!("[writer] Creating output directory: {}", parent.display());
            std::fs::create_dir_all(parent).map_err(|e| {
                let msg = format!("Cannot create output directory '{}': {}", parent.display(), e);
                log::error!("[writer] {}", msg);
                msg
            })?;
        }
    }

    log::debug!("[writer] Opening source file…");
    let src = File::open(source_path).map_err(|e| {
        let msg = format!("Cannot open source '{}': {}", source_path.display(), e);
        log::error!("[writer] {}", msg);
        msg
    })?;
    let mut reader = BufReader::new(src);

    log::debug!("[writer] Creating output file…");
    let dst = File::create(output_path).map_err(|e| {
        let msg = format!("Cannot create output '{}': {}", output_path.display(), e);
        log::error!("[writer] {}", msg);
        msg
    })?;
    let mut writer = BufWriter::new(dst);

    let result = copy_and_patch(&mut reader, &mut writer, &map).map_err(|e| {
        let msg = e.to_string();
        log::error!("[writer] copy_and_patch failed: {}", msg);
        msg
    });

    if result.is_ok() {
        log::info!("[writer] Export completed successfully → {}", output_path.display());
    }
    result
}

fn copy_and_patch<R: Read + Seek, W: Write>(
    r: &mut R,
    w: &mut W,
    map: &TranslationMap,
) -> Result<(), Box<dyn std::error::Error>> {
    log::debug!("[writer] copy_and_patch: reading TES4 header…");
    // Read and copy the TES4 record exactly as it is
    let tes4_header = RecordHeader::read(r)?;
    let mut tes4_data = vec![0u8; tes4_header.data_size as usize];
    r.read_exact(&mut tes4_data)?;
    write_record_raw(w, &tes4_header, &tes4_data)?;

    // Build a set of form_id hex strings for O(1) lookup per record
    let form_id_set: HashSet<String> = map
        .keys()
        .filter_map(|k| k.split('_').next().map(|s| s.to_owned()))
        .collect();

    // Then the GRUPs
    loop {
        let mut magic = [0u8; 4];
        match r.read_exact(&mut magic) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(Box::new(e)),
        }

        if &magic == GroupHeader::MAGIC {
            let group = GroupHeader::read_after_magic(r)?;
            let data_size = group.data_size() as usize;

            // Read data for the entire top-level group
            let mut group_data = vec![0u8; data_size];
            r.read_exact(&mut group_data)?;

            // Patch records in translatable groups; copy others verbatim
            let label_str = std::str::from_utf8(&group.label).unwrap_or("????");
            let is_trans = is_translatable_record(&group.label);
            log::debug!("[writer] GRUP {} — translatable={}, data_size={}", label_str, is_trans, data_size);
            let patched = if is_trans {
                patch_group_data(&group_data, map, &form_id_set)?
            } else {
                group_data
            };

            // Write GRUP header with updated total size
            write_group_header(w, &group, patched.len() as u32)?;
            w.write_all(&patched)?;
        } else {
            // Not a GRUP — unexpected; stop processing
            break;
        }
    }

    Ok(())
}

/// Recursively patch all translatable subrecords within a group body.
///
/// The group body is the raw bytes AFTER the 24-byte GRUP header.
/// Sub-GRUPs (e.g. TopicChildren containing INFO records) are handled
/// by recursive calls.
fn patch_group_data(
    data: &[u8],
    map: &TranslationMap,
    form_id_set: &HashSet<String>,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut output = Vec::with_capacity(data.len());
    let mut pos = 0;

    while pos < data.len() {
        if pos + 4 > data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }

        if &data[pos..pos + 4] == GroupHeader::MAGIC {
            // ── Sub-GRUP ─────────────────────────────────────────────────────
            let hdr = GroupHeader::SIZE as usize; // 24
            if pos + hdr > data.len() {
                output.extend_from_slice(&data[pos..]);
                break;
            }

            let group_total = u32::from_le_bytes(data[pos + 4..pos + 8].try_into()?) as usize;
            let label:  [u8; 4] = data[pos + 8..pos + 12].try_into()?;
            let gtype:  i32 = i32::from_le_bytes(data[pos + 12..pos + 16].try_into()?);
            let ts:     u16 = u16::from_le_bytes(data[pos + 16..pos + 18].try_into()?);
            let vc:     u16 = u16::from_le_bytes(data[pos + 18..pos + 20].try_into()?);
            let unk:    u32 = u32::from_le_bytes(data[pos + 20..pos + 24].try_into()?);

            let body_size  = group_total.saturating_sub(hdr);
            let body_start = pos + hdr;
            let body_end   = body_start + body_size;

            if body_end > data.len() {
                output.extend_from_slice(&data[pos..data.len()]);
                break;
            }

            // Recurse into the sub-group
            let patched_body = patch_group_data(&data[body_start..body_end], map, form_id_set)?;

            // Write sub-GRUP header with updated total size
            let new_total = (patched_body.len() + hdr) as u32;
            output.extend_from_slice(GroupHeader::MAGIC);
            output.extend_from_slice(&new_total.to_le_bytes());
            output.extend_from_slice(&label);
            output.extend_from_slice(&gtype.to_le_bytes());
            output.extend_from_slice(&ts.to_le_bytes());
            output.extend_from_slice(&vc.to_le_bytes());
            output.extend_from_slice(&unk.to_le_bytes());
            output.extend_from_slice(&patched_body);

            pos = body_end;
        } else {
            // ── Record ───────────────────────────────────────────────────────
            let rec_hdr = RecordHeader::SIZE as usize; // 24
            if pos + rec_hdr > data.len() {
                output.extend_from_slice(&data[pos..]);
                break;
            }

            let rec_type:  [u8; 4] = data[pos..pos + 4].try_into()?;
            let body_size: usize   = u32::from_le_bytes(data[pos + 4..pos + 8].try_into()?) as usize;
            let flags:     u32     = u32::from_le_bytes(data[pos + 8..pos + 12].try_into()?);
            let form_id:   u32     = u32::from_le_bytes(data[pos + 12..pos + 16].try_into()?);
            let ts:        u16     = u16::from_le_bytes(data[pos + 16..pos + 18].try_into()?);
            let vc:        u16     = u16::from_le_bytes(data[pos + 18..pos + 20].try_into()?);
            let iv:        u16     = u16::from_le_bytes(data[pos + 20..pos + 22].try_into()?);
            let unk:       u16     = u16::from_le_bytes(data[pos + 22..pos + 24].try_into()?);

            let body_start = pos + rec_hdr;
            let body_end   = body_start + body_size;

            if body_end > data.len() {
                output.extend_from_slice(&data[pos..data.len()]);
                break;
            }

            let fid_hex = format!("{:08X}", form_id);

            // Fast path: no translations for this record
            if !form_id_set.contains(&fid_hex) {
                output.extend_from_slice(&data[pos..body_end]);
                pos = body_end;
                continue;
            }

            // Decompress record body if needed
            let raw_body = &data[body_start..body_end];
            let is_compressed = flags & FLAG_COMPRESSED != 0;

            let record_body: Vec<u8> = if is_compressed && raw_body.len() >= 4 {
                let compressed = &raw_body[4..]; // first 4 bytes = decompressed size hint
                let mut dec = ZlibDecoder::new(compressed);
                let mut out = Vec::new();
                dec.read_to_end(&mut out)?;
                out
            } else {
                raw_body.to_vec()
            };

            // Patch subrecords
            let rec_type_str = std::str::from_utf8(&rec_type).unwrap_or("????");
            log::debug!("[writer] Patching {} FormID={} (compressed={})", rec_type_str, fid_hex, is_compressed);
            let patched_body = patch_subrecords(&record_body, &fid_hex, map)?;
            log::debug!("[writer]   body size: {} → {} bytes", record_body.len(), patched_body.len());

            // Write record header — clear compression flag (we always write uncompressed)
            let new_flags = flags & !FLAG_COMPRESSED;
            output.extend_from_slice(&rec_type);
            output.extend_from_slice(&(patched_body.len() as u32).to_le_bytes());
            output.extend_from_slice(&new_flags.to_le_bytes());
            output.extend_from_slice(&form_id.to_le_bytes());
            output.extend_from_slice(&ts.to_le_bytes());
            output.extend_from_slice(&vc.to_le_bytes());
            output.extend_from_slice(&iv.to_le_bytes());
            output.extend_from_slice(&unk.to_le_bytes());
            output.extend_from_slice(&patched_body);

            pos = body_end;
        }
    }

    Ok(output)
}

/// Patch translatable subrecords within one record's decompressed body.
///
/// `form_id_hex` is the 8-char uppercase hex FormID used as map key prefix.
/// Handles XXXX large-data extension transparently.
fn patch_subrecords(
    data: &[u8],
    form_id_hex: &str,
    map: &TranslationMap,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut output = Vec::with_capacity(data.len());
    let mut pos = 0;
    let mut xxxx_size: Option<u32> = None; // size override from preceding XXXX

    while pos < data.len() {
        // Need at least 6 bytes for a subrecord header (type[4] + size u16)
        if pos + 6 > data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }

        let sub_type: [u8; 4] = data[pos..pos + 4].try_into()?;
        let size_u16 = u16::from_le_bytes(data[pos + 4..pos + 6].try_into()?);

        // XXXX: next 4 bytes carry the u32 size for the following subrecord
        if &sub_type == b"XXXX" {
            let xxxx_end = pos + 6 + size_u16 as usize;
            if xxxx_end > data.len() || size_u16 < 4 {
                output.extend_from_slice(&data[pos..]);
                break;
            }
            let actual = u32::from_le_bytes(data[pos + 6..pos + 10].try_into()?);
            xxxx_size = Some(actual);
            pos = xxxx_end;
            continue;
        }

        let was_xxxx     = xxxx_size.is_some();
        let actual_size  = xxxx_size.take().unwrap_or(size_u16 as u32) as usize;
        let body_start   = pos + 6;
        let body_end     = body_start + actual_size;

        if body_end > data.len() {
            output.extend_from_slice(&data[pos..]);
            break;
        }

        let sub_str   = std::str::from_utf8(&sub_type).unwrap_or("????");
        let outer_key = format!("{}_{}", form_id_hex, sub_str);

        // Match by original text so that multiple subrecords of the same type
        // within a single record (e.g. several CNAM in one QUST) each get
        // their own correct translation.
        let mut replaced = false;
        if let Some(translations) = map.get(&outer_key) {
            let current_text = read_cstring(&data[body_start..body_end]);
            if let Some(translated) = translations.get(&current_text) {
                let mut new_data = translated.as_bytes().to_vec();
                new_data.push(0u8);
                log::debug!("[writer]   subrecord {} replaced ({} → {} bytes)", outer_key, actual_size, new_data.len());
                write_subrecord(&mut output, &sub_type, &new_data);
                replaced = true;
            }
        }

        if !replaced {
            // Copy verbatim — re-emit XXXX prefix if the original had one
            if was_xxxx {
                output.extend_from_slice(b"XXXX");
                output.extend_from_slice(&4u16.to_le_bytes());
                output.extend_from_slice(&(actual_size as u32).to_le_bytes());
                output.extend_from_slice(&sub_type);
                output.extend_from_slice(&size_u16.to_le_bytes()); // original placeholder
                output.extend_from_slice(&data[body_start..body_end]);
            } else {
                output.extend_from_slice(&data[pos..body_end]);
            }
        }

        pos = body_end;
    }

    Ok(output)
}

/// Read a null-terminated UTF-8 string from a subrecord body.
/// Strips the trailing NUL (if present) and returns a `String`.
/// Returns an empty string if the bytes are not valid UTF-8.
fn read_cstring(data: &[u8]) -> String {
    let trimmed = match data.iter().position(|&b| b == 0) {
        Some(nul) => &data[..nul],
        None      => data,
    };
    std::str::from_utf8(trimmed).unwrap_or("").to_string()
}

/// Write a subrecord, automatically using XXXX prefix if data > 65535 bytes.
fn write_subrecord(output: &mut Vec<u8>, sub_type: &[u8; 4], data: &[u8]) {
    if data.len() > 0xFFFF {
        output.extend_from_slice(b"XXXX");
        output.extend_from_slice(&4u16.to_le_bytes());
        output.extend_from_slice(&(data.len() as u32).to_le_bytes());
        output.extend_from_slice(sub_type);
        output.extend_from_slice(&0u16.to_le_bytes()); // size placeholder (overridden by XXXX)
    } else {
        output.extend_from_slice(sub_type);
        output.extend_from_slice(&(data.len() as u16).to_le_bytes());
    }
    output.extend_from_slice(data);
}

fn write_record_raw<W: Write>(
    w: &mut W,
    header: &RecordHeader,
    data: &[u8],
) -> Result<(), std::io::Error> {
    w.write_all(&header.rec_type)?;
    w.write_all(&(data.len() as u32).to_le_bytes())?;
    w.write_all(&header.flags.to_le_bytes())?;
    w.write_all(&header.form_id.to_le_bytes())?;
    w.write_all(&header.timestamp.to_le_bytes())?;
    w.write_all(&header.version_control.to_le_bytes())?;
    w.write_all(&header.internal_version.to_le_bytes())?;
    w.write_all(&header.unknown.to_le_bytes())?;
    w.write_all(data)?;
    Ok(())
}

fn write_group_header<W: Write>(
    w: &mut W,
    group: &GroupHeader,
    data_size: u32,
) -> Result<(), std::io::Error> {
    w.write_all(GroupHeader::MAGIC)?;
    w.write_all(&(data_size + GroupHeader::SIZE as u32).to_le_bytes())?;
    w.write_all(&group.label)?;
    w.write_all(&group.group_type.to_i32().to_le_bytes())?;
    w.write_all(&group.timestamp.to_le_bytes())?;
    w.write_all(&group.version_control.to_le_bytes())?;
    w.write_all(&group.unknown.to_le_bytes())?;
    Ok(())
}
