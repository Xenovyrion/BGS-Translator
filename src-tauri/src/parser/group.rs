use std::io::{Read, Seek, SeekFrom};
use binrw::BinReaderExt;
use crate::parser::error::ParseError;

/// GRUP type (group_type field).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum GroupType {
    TopLevel      = 0,  // label = record type (ex: b"WEAP")
    WorldChildren = 1,
    InteriorCell  = 2,
    ExteriorCell  = 3,
    CellChildren  = 4,
    TopicChildren = 5,
    CellPersist   = 6,
    CellTemp      = 7,
    Unknown(i32),
}

impl From<i32> for GroupType {
    fn from(v: i32) -> Self {
        match v {
            0 => GroupType::TopLevel,
            1 => GroupType::WorldChildren,
            2 => GroupType::InteriorCell,
            3 => GroupType::ExteriorCell,
            4 => GroupType::CellChildren,
            5 => GroupType::TopicChildren,
            6 => GroupType::CellPersist,
            7 => GroupType::CellTemp,
            n => GroupType::Unknown(n),
        }
    }
}

impl GroupType {
    pub fn to_i32(self) -> i32 {
        match self {
            GroupType::TopLevel      => 0,
            GroupType::WorldChildren => 1,
            GroupType::InteriorCell  => 2,
            GroupType::ExteriorCell  => 3,
            GroupType::CellChildren  => 4,
            GroupType::TopicChildren => 5,
            GroupType::CellPersist   => 6,
            GroupType::CellTemp      => 7,
            GroupType::Unknown(n)    => n,
        }
    }
}

/// GRUP header (24 bytes, like a record header).
#[derive(Debug, Clone)]
pub struct GroupHeader {
    // magic b"GRUP" already used by the appellant
    pub group_size:      u32,   // total size, including the 24-byte header
    pub label:           [u8; 4],
    pub group_type:      GroupType,
    pub timestamp:       u16,
    pub version_control: u16,
    pub unknown:         u32,
}

impl GroupHeader {
    pub const MAGIC: &'static [u8; 4] = b"GRUP";
    pub const SIZE: u64 = 24;

    /// Reads the header of a GRUP. The magic number “GRUP” must already have been read by the caller.
    pub fn read_after_magic<R: Read + Seek>(r: &mut R) -> Result<Self, ParseError> {
        Ok(GroupHeader {
            group_size:      r.read_le()?,
            label:           r.read_le()?,
            group_type:      GroupType::from(r.read_le::<i32>()?),
            timestamp:       r.read_le()?,
            version_control: r.read_le()?,
            unknown:         r.read_le()?,
        })
    }

    /// Group data size (after the 24-byte header).
    pub fn data_size(&self) -> u64 {
        self.group_size.saturating_sub(Self::SIZE as u32) as u64
    }

    pub fn label_str(&self) -> &str {
        std::str::from_utf8(&self.label).unwrap_or("????")
    }

    /// Skip all data for the group.
    pub fn skip_data<R: Read + Seek>(&self, r: &mut R) -> Result<(), ParseError> {
        r.seek(SeekFrom::Current(self.data_size() as i64))?;
        Ok(())
    }
}
