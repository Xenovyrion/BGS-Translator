use std::path::Path;

use crate::formats::ImportedEntry;
use crate::translation::entry::{EntryStatus, TranslationEntry};

// ── RFC 4180-style CSV field parser ──────────────────────────────────────────

fn parse_csv_line(line: &str, sep: char) -> Vec<String> {
    let mut fields = Vec::new();
    let mut chars  = line.chars().peekable();

    loop {
        // Quoted field
        if chars.peek() == Some(&'"') {
            chars.next(); // consume opening quote
            let mut field = String::new();
            loop {
                match chars.next() {
                    None => break,
                    Some('"') => {
                        if chars.peek() == Some(&'"') {
                            chars.next(); // escaped double-quote
                            field.push('"');
                        } else {
                            break; // closing quote
                        }
                    }
                    Some(c) => field.push(c),
                }
            }
            fields.push(field);
            // consume separator
            if chars.peek() == Some(&sep) { chars.next(); }
        } else {
            // Unquoted field — read until sep or end
            let mut field = String::new();
            loop {
                match chars.peek() {
                    None => break,
                    Some(&c) if c == sep => { chars.next(); break; }
                    Some(_) => { field.push(chars.next().unwrap()); }
                }
            }
            fields.push(field);
        }

        if chars.peek().is_none() { break; }
    }

    fields
}

fn csv_escape(s: &str, sep: char) -> String {
    let needs_quote = s.contains(sep) || s.contains('"') || s.contains('\n') || s.contains('\r');
    if !needs_quote {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        if c == '"' { out.push('"'); } // escape by doubling
        out.push(c);
    }
    out.push('"');
    out
}

// ── Column index resolution from header ──────────────────────────────────────

#[allow(dead_code)]
struct ColIndices {
    form_id:     usize,
    record_type: usize,
    sub_type:    usize,
    editor_id:   usize,
    original:    usize,
    translation: usize,
}

impl Default for ColIndices {
    fn default() -> Self {
        ColIndices { form_id: 0, record_type: 1, sub_type: 2, editor_id: 3, original: 4, translation: 5 }
    }
}

fn find_col(headers: &[String], candidates: &[&str]) -> Option<usize> {
    for (i, h) in headers.iter().enumerate() {
        let lower = h.trim().to_lowercase();
        for &c in candidates {
            if lower == c { return Some(i); }
        }
    }
    None
}

fn resolve_cols(headers: &[String]) -> ColIndices {
    ColIndices {
        form_id:     find_col(headers, &["formid", "form_id", "id"]).unwrap_or(0),
        record_type: find_col(headers, &["recordtype", "record_type", "type", "rectype"]).unwrap_or(1),
        sub_type:    find_col(headers, &["subtype", "sub_type", "field", "champ"]).unwrap_or(2),
        editor_id:   find_col(headers, &["editorid", "editor_id", "edid"]).unwrap_or(3),
        original:    find_col(headers, &["original", "source", "original text"]).unwrap_or(4),
        translation: find_col(headers, &["translation", "translated", "dest", "traduit"]).unwrap_or(5),
    }
}

fn get_field<'a>(fields: &'a [String], idx: usize) -> &'a str {
    fields.get(idx).map(|s| s.trim()).unwrap_or("")
}

// ── Import ────────────────────────────────────────────────────────────────────

pub fn import(path: &Path) -> Result<Vec<ImportedEntry>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

    // Detect separator: tab wins if any tab is in the first line
    let first_line = content.lines().next().unwrap_or("");
    let sep = if first_line.contains('\t') { '\t' } else { ',' };

    let mut lines = content.lines();
    let mut entries = Vec::new();

    // Peek first line to detect header
    let first = match lines.next() {
        None => return Ok(entries),
        Some(l) => l,
    };

    let first_fields = parse_csv_line(first, sep);
    let lower0 = first_fields.first().map(|s| s.trim().to_lowercase()).unwrap_or_default();
    let has_header = matches!(
        lower0.as_str(),
        "formid" | "form_id" | "id" | "original" | "source" | "recordtype" | "record_type"
    );

    let (cols, data_lines): (ColIndices, Box<dyn Iterator<Item = &str>>) = if has_header {
        let c = resolve_cols(&first_fields);
        (c, Box::new(lines))
    } else {
        // No header — use default positions, re-include the first line
        let c = ColIndices::default();
        // We already consumed first line from `lines`; we need to re-feed it.
        // Collect rest into a vec and prepend.
        let rest: Vec<&str> = lines.collect();
        let all: Vec<&str> = std::iter::once(first).chain(rest.into_iter()).collect();
        (c, Box::new(all.into_iter()))
    };

    for line in data_lines {
        if line.trim().is_empty() { continue; }
        let fields = parse_csv_line(line, sep);
        let original    = get_field(&fields, cols.original).to_string();
        let translation = get_field(&fields, cols.translation).to_string();
        if original.is_empty() || translation.is_empty() { continue; }

        entries.push(ImportedEntry {
            original,
            translated:  translation,
            record_type: {
                let v = get_field(&fields, cols.record_type).to_string();
                if v.is_empty() { None } else { Some(v) }
            },
            sub_type: {
                let v = get_field(&fields, cols.sub_type).to_string();
                if v.is_empty() { None } else { Some(v) }
            },
            editor_id: {
                let v = get_field(&fields, cols.editor_id).to_string();
                if v.is_empty() { None } else { Some(v) }
            },
        });
    }

    tracing::info!("[session_csv] import: {} entries from '{}'", entries.len(), path.display());
    Ok(entries)
}

// ── Export ────────────────────────────────────────────────────────────────────

pub fn export(path: &Path, entries: &[TranslationEntry]) -> Result<usize, String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    const SEP: char = ',';

    let mut out = String::with_capacity(64 * 1024);
    out.push_str("FormID,RecordType,SubType,EditorID,Original,Translation,Status\n");

    let mut count = 0usize;
    for e in entries {
        if e.status != EntryStatus::Validated { continue; }
        if e.translated.is_empty() { continue; }

        let form_id_hex = format!("{:08X}", e.form_id);
        out.push_str(&csv_escape(&form_id_hex, SEP));
        out.push(SEP);
        out.push_str(&csv_escape(&e.record_type, SEP));
        out.push(SEP);
        out.push_str(&csv_escape(&e.sub_type, SEP));
        out.push(SEP);
        out.push_str(&csv_escape(&e.editor_id, SEP));
        out.push(SEP);
        out.push_str(&csv_escape(&e.original, SEP));
        out.push(SEP);
        out.push_str(&csv_escape(&e.translated, SEP));
        out.push(SEP);
        out.push_str("validated");
        out.push('\n');
        count += 1;
    }

    std::fs::write(path, out.as_bytes()).map_err(|e| e.to_string())?;
    tracing::info!("[session_csv] export: {} entries to '{}'", count, path.display());
    Ok(count)
}
