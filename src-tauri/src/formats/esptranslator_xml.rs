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

    #[derive(PartialEq)]
    enum Block { None, Bdd, Esp }

    let mut block      = Block::None;
    let mut in_original  = false;
    let mut in_traduit   = false;
    let mut in_grup      = false;
    let mut in_champ     = false;
    let mut in_edid      = false;
    let mut in_status    = false;
    let mut original   = String::new();
    let mut traduit    = String::new();
    let mut grup       = String::new();
    let mut champ      = String::new();
    let mut edid       = String::new();
    let mut status_str = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let name = e.local_name();
                match name.as_ref() {
                    b"BDD" => {
                        block = Block::Bdd;
                        original.clear(); traduit.clear(); grup.clear(); champ.clear(); edid.clear(); status_str.clear();
                    }
                    b"ESP" => {
                        block = Block::Esp;
                        original.clear(); traduit.clear(); grup.clear(); champ.clear(); edid.clear(); status_str.clear();
                    }
                    b"ORIGINAL" if block != Block::None => { in_original = true; }
                    b"TRADUIT"  if block != Block::None => { in_traduit  = true; }
                    b"GRUP"     if block != Block::None => { in_grup     = true; }
                    b"CHAMP"    if block != Block::None => { in_champ    = true; }
                    b"EDID"     if block != Block::None => { in_edid     = true; }
                    b"STATUS"   if block == Block::Esp  => { in_status   = true; }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map_err(|e| e.to_string())?.into_owned();
                if in_original      { original    = text; }
                else if in_traduit  { traduit    = text; }
                else if in_grup     { grup       = text; }
                else if in_champ    { champ      = text; }
                else if in_edid     { edid       = text; }
                else if in_status   { status_str = text; }
            }
            Ok(Event::End(ref e)) => {
                let name = e.local_name();
                match name.as_ref() {
                    b"ORIGINAL" => { in_original = false; }
                    b"TRADUIT"  => { in_traduit  = false; }
                    b"GRUP"     => { in_grup     = false; }
                    b"CHAMP"    => { in_champ    = false; }
                    b"EDID"     => { in_edid     = false; }
                    b"STATUS"   => { in_status   = false; }
                    b"BDD" => {
                        // Always import BDD entries if original != translated and both non-empty
                        if !original.is_empty() && !traduit.is_empty() && original != traduit {
                            push_entry(&mut entries, &original, &traduit, &grup, &champ, &edid);
                        }
                        block = Block::None;
                    }
                    b"ESP" => {
                        // Import ESP entries only if STATUS is 1, -1, 98, or 99
                        let status_val: i32 = status_str.trim().parse().unwrap_or(0);
                        let import_ok = matches!(status_val, 1 | -1 | 98 | 99);
                        if import_ok && !original.is_empty() && !traduit.is_empty() && original != traduit {
                            push_entry(&mut entries, &original, &traduit, &grup, &champ, &edid);
                        }
                        block = Block::None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }

    tracing::info!("[et_xml] import: {} entries from '{}'", entries.len(), path.display());
    Ok(entries)
}

fn push_entry(
    entries: &mut Vec<ImportedEntry>,
    original: &str, traduit: &str, grup: &str, champ: &str, edid: &str,
) {
    entries.push(ImportedEntry {
        original:    original.to_string(),
        translated:  traduit.to_string(),
        record_type: if grup.is_empty()  { None } else { Some(grup.to_string()) },
        sub_type:    if champ.is_empty() { None } else { Some(champ.to_string()) },
        editor_id:   if edid.is_empty()  { None } else { Some(edid.to_string()) },
    });
}

// ── Export ────────────────────────────────────────────────────────────────────

pub fn export(
    path: &Path,
    entries: &[TranslationEntry],
    plugin_name: &str,
) -> Result<usize, String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let mut out = String::with_capacity(64 * 1024);
    out.push_str("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n");
    out.push_str("<EspTranslator>\n");
    out.push_str(&format!("  <PluginName>{}</PluginName>\n", xml_escape(plugin_name)));

    let mut count = 0usize;
    for e in entries {
        if e.status != EntryStatus::Validated { continue; }
        if e.translated.is_empty() { continue; }

        count += 1;
        out.push_str("  <ESP>\n");
        out.push_str(&format!("    <INDEX>{}</INDEX>\n",       count));
        out.push_str("    <STATUS>1</STATUS>\n");
        out.push_str(&format!("    <GRUP>{}</GRUP>\n",         xml_escape(&e.record_type)));
        out.push_str(&format!("    <CHAMP>{}</CHAMP>\n",       xml_escape(&e.sub_type)));
        out.push_str(&format!("    <EDID>{}</EDID>\n",         xml_escape(&e.editor_id)));
        out.push_str(&format!("    <ORIGINAL>{}</ORIGINAL>\n", xml_escape(&e.original)));
        out.push_str(&format!("    <TRADUIT>{}</TRADUIT>\n",   xml_escape(&e.translated)));
        out.push_str("  </ESP>\n");
    }

    out.push_str("</EspTranslator>\n");

    std::fs::write(path, out.as_bytes()).map_err(|e| e.to_string())?;
    tracing::info!("[et_xml] export: {} entries to '{}'", count, path.display());
    Ok(count)
}
