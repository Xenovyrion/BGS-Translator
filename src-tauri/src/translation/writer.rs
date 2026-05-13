use std::{
    collections::HashMap,
    fs::File,
    io::{BufReader, BufWriter, Read, Seek, Write},
    path::Path,
};
use crate::parser::{
    group::GroupHeader,
    record::RecordHeader,
    types::is_translatable_record,
};
use crate::translation::entry::TranslationEntry;

/// Translation map: form_id + sub_type → translated text.
type TranslationMap = HashMap<String, String>;

/// Write a new plugin with translations applied inline (non-localized plugin).
/// For localized plugins, see `write_strings_files`.
pub fn write_translated_plugin(
    source_path: &Path,
    output_path: &Path,
    entries: &[TranslationEntry],
) -> Result<(), String> {
    let map: TranslationMap = entries
        .iter()
        .filter(|e| !e.translated.is_empty())
        .map(|e| (e.unique_key(), e.translated.clone()))
        .collect();

    let src = File::open(source_path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(src);

    let dst = File::create(output_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(dst);

    copy_and_patch(&mut reader, &mut writer, &map).map_err(|e| e.to_string())
}

fn copy_and_patch<R: Read + Seek, W: Write>(
    r: &mut R,
    w: &mut W,
    map: &TranslationMap,
) -> Result<(), Box<dyn std::error::Error>> {
    // Read and copy the TES4 record exactly as it is
    let tes4_header = RecordHeader::read(r)?;
    let mut tes4_data = vec![0u8; tes4_header.data_size as usize];
    r.read_exact(&mut tes4_data)?;
    write_record_raw(w, &tes4_header, &tes4_data)?;

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

            // Read data for the entire group
            let mut group_data = vec![0u8; data_size];
            r.read_exact(&mut group_data)?;

            // Patch the translatable records in this group
            let patched = if is_translatable_record(&group.label) {
                patch_group_data(&group_data, map)?
            } else {
                group_data
            };

            // Rewrite the GRUP header with the size adjusted as needed
            // Note: If you replace the inline strings, the size may change.
            // To simplify v1, we pad it with the same size.
            write_group_header(w, &group, patched.len() as u32)?;
            w.write_all(&patched)?;
        } else {
            // End of the GRUPs
            break;
        }
    }

    Ok(())
}

fn patch_group_data(
    data: &[u8],
    _map: &TranslationMap,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // For v1: copy the data by replacing the FULL/DESC/etc. subrecords.
    // Simplified implementation — a full implementation requires recalculating
    // the sizes of each record/group as you go.
    // TODO: implement full patching with size recalculation
    Ok(data.to_vec())
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
