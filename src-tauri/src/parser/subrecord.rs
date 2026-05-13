use std::io::Cursor;
use binrw::BinReaderExt;
use crate::parser::error::ParseError;

/// A subrecord parsed from the raw data of a record.
#[derive(Debug, Clone)]
pub struct Subrecord {
    pub sub_type: [u8; 4],
    pub data:     Vec<u8>,
}

impl Subrecord {
    pub fn type_str(&self) -> &str {
        std::str::from_utf8(&self.sub_type).unwrap_or("????")
    }

    /// Extract the text content from a non-localized subrecord (null-terminated, encoded in UTF-8 or Windows-1252).
    pub fn as_string(&self) -> Option<String> {
        if self.data.is_empty() {
            return Some(String::new());
        }
        // Remove the null terminator if it is present
        let bytes = if self.data.last() == Some(&0) {
            &self.data[..self.data.len() - 1]
        } else {
            &self.data
        };

        // Try UTF-8 first (Starfield and modern plugins)
        if let Ok(s) = std::str::from_utf8(bytes) {
            return Some(s.to_owned());
        }
        // Fallback Windows-1252 for legacy plugins
        let (cow, _enc, had_errors) = encoding_rs::WINDOWS_1252.decode(bytes);
        if !had_errors {
            Some(cow.into_owned())
        } else {
            None
        }
    }

    /// If the plugin is localized, this subrecord contains a u32 string ID.
    pub fn as_string_id(&self) -> Option<u32> {
        if self.data.len() == 4 {
            let mut c = Cursor::new(&self.data);
            c.read_le::<u32>().ok()
        } else {
            None
        }
    }


}

/// Parses all subrecords from a slice of raw data.
///
/// Handles the special case XXXX: when a subrecord exceeds 65,535 bytes,
/// Bethesda inserts an `XXXX` subrecord whose 4 bytes of data
/// contain the actual size (u32) of the subrecord that immediately follows.
pub fn parse_subrecords(data: &[u8]) -> Result<Vec<Subrecord>, ParseError> {
    let mut subrecords = Vec::new();
    let mut cursor = Cursor::new(data);
    let mut size_override: Option<u32> = None;

    while (cursor.position() as usize) < data.len() {
        let sub_type: [u8; 4] = cursor.read_le()?;
        let size_u16: u16      = cursor.read_le()?;

        // Apply the XXXX override if available; otherwise, use the standard u16 size
        let size = size_override.take().unwrap_or(size_u16 as u32) as usize;

        // Subrecord XXXX: encodes the u32 size of the next subrecord
        if &sub_type == b"XXXX" {
            let pos = cursor.position() as usize;
            if pos + 4 > data.len() {
                return Err(ParseError::UnexpectedEof);
            }
            let next_size = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap());
            // size_u16 is always 4 for XXXX (size of the u32 content)
            cursor.set_position((pos + size_u16 as usize) as u64);
            size_override = Some(next_size);
            continue;
        }

        let pos = cursor.position() as usize;
        if pos + size > data.len() {
            return Err(ParseError::UnexpectedEof);
        }

        let sub_data = data[pos..pos + size].to_vec();
        cursor.set_position((pos + size) as u64);

        subrecords.push(Subrecord { sub_type, data: sub_data });
    }

    Ok(subrecords)
}
