use std::io::{Read, Seek, SeekFrom};
use binrw::BinReaderExt;
use crate::parser::error::ParseError;

/// Flags from the TES4 header
pub const FLAG_LOCALIZED: u32 = 0x0000_0080;

/// Flags for individual records
pub const FLAG_COMPRESSED: u32 = 0x0004_0000;

/// Header common to all records (24 bytes).
/// Reference: xEdit / TES5Edit source, RecordHeader structure.
#[derive(Debug, Clone)]
pub struct RecordHeader {
    pub rec_type:  [u8; 4],   // ex: b"TES4", b"WEAP", b"QUST"
    pub data_size: u32,       // data size after the header (excluding the 24 bytes of the header)
    pub flags:     u32,
    pub form_id:   u32,
    pub timestamp: u16,
    pub version_control: u16,
    pub internal_version: u16,
    pub unknown:   u16,
}

impl RecordHeader {
    pub const SIZE: u64 = 24;

    pub fn read<R: Read + Seek>(r: &mut R) -> Result<Self, ParseError> {
        Ok(RecordHeader {
            rec_type:         r.read_le()?,
            data_size:        r.read_le()?,
            flags:            r.read_le()?,
            form_id:          r.read_le()?,
            timestamp:        r.read_le()?,
            version_control:  r.read_le()?,
            internal_version: r.read_le()?,
            unknown:          r.read_le()?,
        })
    }

    pub fn type_str(&self) -> &str {
        std::str::from_utf8(&self.rec_type).unwrap_or("????")
    }

    pub fn is_compressed(&self) -> bool {
        self.flags & FLAG_COMPRESSED != 0
    }

    pub fn is_localized(&self) -> bool {
        self.flags & FLAG_LOCALIZED != 0
    }

    /// Skip the data in this record without parsing it.
    pub fn skip_data<R: Read + Seek>(&self, r: &mut R) -> Result<(), ParseError> {
        r.seek(SeekFrom::Current(self.data_size as i64))?;
        Ok(())
    }
}

/// Raw data from a record, possibly uncompressed.
#[derive(Debug)]
pub struct RawRecord {
    pub header: RecordHeader,
    pub data:   Vec<u8>,
}

impl RawRecord {
    /// Reads the header and the data, and decompresses them if necessary.
    pub fn read<R: Read + Seek>(r: &mut R) -> Result<Self, ParseError> {
        let header = RecordHeader::read(r)?;
        let data = read_record_data(r, &header)?;
        Ok(RawRecord { header, data })
    }
}

fn read_record_data<R: Read + Seek>(
    r: &mut R,
    header: &RecordHeader,
) -> Result<Vec<u8>, ParseError> {
    if header.is_compressed() {
        // The first 4 bytes of the data = uncompressed size
        let decompressed_size: u32 = r.read_le()?;
        let compressed_len = (header.data_size - 4) as usize;

        let mut compressed = vec![0u8; compressed_len];
        r.read_exact(&mut compressed)?;

        let mut decoder = flate2::read::ZlibDecoder::new(compressed.as_slice());
        let mut decompressed = Vec::with_capacity(decompressed_size as usize);
        decoder.read_to_end(&mut decompressed)?;
        Ok(decompressed)
    } else {
        let mut data = vec![0u8; header.data_size as usize];
        r.read_exact(&mut data)?;
        Ok(data)
    }
}
