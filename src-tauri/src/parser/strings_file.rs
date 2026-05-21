use std::{
    collections::HashMap,
    fs::File,
    io::{BufReader, Cursor, Read, Seek},
    path::Path,
};
use binrw::BinReaderExt;
use crate::parser::error::ParseError;

/// Contents of a .strings / .dlstrings / .ilstrings file loaded into memory.
/// Key = string ID (u32), value = UTF-8 text.
pub type StringTable = HashMap<u32, String>;

/// Indicates which external .strings file a localized string ID points to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringFileKind {
    /// .strings file — short, null-terminated strings
    Strings,
    /// .dlstrings file — long strings prefixed with u32 size
    DlStrings,
    /// .ilstrings file — dialogs, same format as dlstrings
    IlStrings,
}

/// Bethesda string file format:
///
/// Header:
///   u32 count       - number of entries
///   u32 data_size   - size of the data block (strings)
///
/// Directory (count * 8 bytes):
///   u32 string_id
///   u32 offset      - offset from the start of the data block
///
/// Data block:
///   For .strings: null-terminated strings
///   For .dlstrings/.ilstrings: u32 length + null-terminated string
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringsFormat {
    /// .strings — null-terminated strings
    Strings,
    /// .dlstrings / .ilstrings — u32 size + null-terminated string
    DlStrings,
}

impl StringsFormat {
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "strings"   => Some(StringsFormat::Strings),
            "dlstrings" => Some(StringsFormat::DlStrings),
            "ilstrings" => Some(StringsFormat::DlStrings),
            _           => None,
        }
    }
}

/// Parse a `StringTable` directly from raw bytes (e.g. extracted from a BA2/BSA archive).
///
/// `ext` is the file extension without the dot: `"strings"`, `"dlstrings"`, or `"ilstrings"`.
pub fn parse_strings_from_bytes(bytes: &[u8], ext: &str) -> Result<StringTable, ParseError> {
    let format = StringsFormat::from_extension(ext)
        .ok_or_else(|| ParseError::InvalidMagic(format!("Unknown strings extension: {}", ext)))?;
    let mut cursor = Cursor::new(bytes);
    parse_strings(&mut cursor, format)
}

pub fn load_strings_file(path: &Path) -> Result<StringTable, ParseError> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let format = StringsFormat::from_extension(ext)
        .ok_or_else(|| ParseError::InvalidMagic(format!("Unknown extension: .{}", ext)))?;

    tracing::debug!("[strings_file] Loading {:?}", path);
    let file = File::open(path)?;
    let mut r = BufReader::new(file);
    let table = parse_strings(&mut r, format)?;
    tracing::debug!("[strings_file] Loaded {} entries from {:?}", table.len(), path);
    Ok(table)
}

fn parse_strings<R: Read + Seek>(r: &mut R, format: StringsFormat) -> Result<StringTable, ParseError> {
    let count:     u32 = r.read_le()?;
    let data_size: u32 = r.read_le()?;

    // Read the directory
    let mut directory = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let string_id: u32 = r.read_le()?;
        let offset:    u32 = r.read_le()?;
        directory.push((string_id, offset));
    }

    // Read the data block
    let mut data = vec![0u8; data_size as usize];
    r.read_exact(&mut data)?;

    // Extract each string
    let mut table = HashMap::with_capacity(count as usize);
    for (string_id, offset) in directory {
        let offset = offset as usize;
        if offset >= data.len() {
            continue;
        }

        let text = match format {
            StringsFormat::Strings => read_null_terminated(&data[offset..])?,
            StringsFormat::DlStrings => {
                if offset + 4 > data.len() { continue; }
                let mut c = Cursor::new(&data[offset..]);
                let len: u32 = c.read_le()?;
                let start = offset + 4;
                let end = (start + len as usize).min(data.len());
                // retire le null terminal inclus dans len
                let bytes = if end > start && data[end - 1] == 0 {
                    &data[start..end - 1]
                } else {
                    &data[start..end]
                };
                decode_string(bytes)?
            }
        };

        table.insert(string_id, text);
    }

    Ok(table)
}

fn read_null_terminated(data: &[u8]) -> Result<String, ParseError> {
    let end = data.iter().position(|&b| b == 0).unwrap_or(data.len());
    decode_string(&data[..end])
}

fn decode_string(bytes: &[u8]) -> Result<String, ParseError> {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Ok(s.to_owned());
    }
    let (cow, _enc, had_errors) = encoding_rs::WINDOWS_1252.decode(bytes);
    if !had_errors {
        Ok(cow.into_owned())
    } else {
        Err(ParseError::EncodingError)
    }
}

/// Resolve a string ID to its text from the loaded tables.
/// First searches in ilstrings, then dlstrings, then strings.
pub struct StringResolver {
    pub strings:   StringTable,
    pub dlstrings: StringTable,
    pub ilstrings: StringTable,
}

impl StringResolver {
    pub fn empty() -> Self {
        StringResolver {
            strings:   HashMap::new(),
            dlstrings: HashMap::new(),
            ilstrings: HashMap::new(),
        }
    }

    pub fn resolve_strings(&self, id: u32) -> Option<&str> {
        self.strings.get(&id).map(|s| s.as_str())
    }

    pub fn resolve_dlstrings(&self, id: u32) -> Option<&str> {
        self.dlstrings.get(&id).map(|s| s.as_str())
    }

    pub fn resolve_ilstrings(&self, id: u32) -> Option<&str> {
        self.ilstrings.get(&id).map(|s| s.as_str())
    }
}
