use std::path::Path;
use quick_xml::Reader;
use quick_xml::events::Event;

use crate::formats::ImportedEntry;
use crate::formats::xml_escape;
use crate::translation::entry::{EntryStatus, TranslationEntry};

// ── Import ────────────────────────────────────────────────────────────────────

pub fn import(path: &Path) -> Result<Vec<ImportedEntry>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut reader = Reader::from_str(&content);
    reader.config_mut().trim_text(true);

    let mut entries = Vec::new();

    // per-String state
    let mut in_string = false;
    let mut in_source = false;
    let mut in_dest   = false;
    let mut in_edid   = false;
    let mut in_rec    = false;
    let mut source    = String::new();
    let mut dest      = String::new();
    let mut edid      = String::new();
    let mut rec       = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let name = e.local_name();
                match name.as_ref() {
                    b"String" => {
                        in_string = true;
                        source.clear(); dest.clear(); edid.clear(); rec.clear();
                    }
                    b"Source" if in_string => { in_source = true; }
                    b"Dest"   if in_string => { in_dest   = true; }
                    b"EDID"   if in_string => { in_edid   = true; }
                    b"REC"    if in_string => { in_rec    = true; }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map_err(|e| e.to_string())?.into_owned();
                if in_source      { source = text; }
                else if in_dest   { dest   = text; }
                else if in_edid   { edid   = text; }
                else if in_rec    { rec    = text; }
            }
            Ok(Event::End(ref e)) => {
                let name = e.local_name();
                match name.as_ref() {
                    b"Source" => { in_source = false; }
                    b"Dest"   => { in_dest   = false; }
                    b"EDID"   => { in_edid   = false; }
                    b"REC"    => { in_rec    = false; }
                    b"String" => {
                        if in_string && !source.is_empty() && source != dest && !dest.is_empty() {
                            // Parse "RECTYPE:SUBTYPE" from rec field
                            let (record_type, sub_type) = if rec.contains(':') {
                                let mut parts = rec.splitn(2, ':');
                                let rt = parts.next().unwrap_or("").trim().to_string();
                                let st = parts.next().unwrap_or("").trim().to_string();
                                (
                                    if rt.is_empty() { None } else { Some(rt) },
                                    if st.is_empty() { None } else { Some(st) },
                                )
                            } else {
                                (if rec.is_empty() { None } else { Some(rec.clone()) }, None)
                            };
                            entries.push(ImportedEntry {
                                original:    source.clone(),
                                translated:  dest.clone(),
                                record_type,
                                sub_type,
                                editor_id: if edid.is_empty() { None } else { Some(edid.clone()) },
                            });
                        }
                        in_string = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }

    tracing::info!("[xt_xml] import: {} entries from '{}'", entries.len(), path.display());
    Ok(entries)
}

// ── Export ────────────────────────────────────────────────────────────────────

pub fn export(
    path: &Path,
    entries: &[TranslationEntry],
    plugin_name: &str,
    source_lang: &str,
    dest_lang: &str,
) -> Result<usize, String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let mut out = String::with_capacity(64 * 1024);
    out.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    out.push_str("<SSTXMLRessources>\n");
    out.push_str(&format!(
        "  <PluginName>{}</PluginName>\n  <SourceLanguage>{}</SourceLanguage>\n  <DestLanguage>{}</DestLanguage>\n",
        xml_escape(plugin_name),
        xml_escape(source_lang),
        xml_escape(dest_lang),
    ));

    let mut count = 0usize;
    for e in entries {
        if e.status != EntryStatus::Validated { continue; }
        if e.translated.is_empty() { continue; }

        let rec = format!("{}:{}", e.record_type, e.sub_type);

        out.push_str("  <String>\n");
        out.push_str(&format!("    <EDID>{}</EDID>\n",     xml_escape(&e.editor_id)));
        out.push_str(&format!("    <REC>{}</REC>\n",       xml_escape(&rec)));
        out.push_str(&format!("    <Source>{}</Source>\n", xml_escape(&e.original)));
        out.push_str(&format!("    <Dest>{}</Dest>\n",     xml_escape(&e.translated)));
        out.push_str("  </String>\n");
        count += 1;
    }

    out.push_str("</SSTXMLRessources>\n");

    std::fs::write(path, out.as_bytes()).map_err(|e| e.to_string())?;
    tracing::info!("[xt_xml] export: {} entries to '{}'", count, path.display());
    Ok(count)
}
