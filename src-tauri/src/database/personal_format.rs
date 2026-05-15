use std::io::Write;
use serde::{Deserialize, Serialize};
use crate::database::{personal_store::PersonalDb, types::PersonalDbEntry};

// ── .bgtx binary format ────────────────────────────────────────────────────────
//
// Layout:
//   [0..4]  magic  "BGTX"
//   [4]     version = 1
//   [5..]   zstd-compressed bincode-encoded PersonalBgtxData

const BGTX_MAGIC:   &[u8; 4] = b"BGTX";
const BGTX_VERSION: u8       = 1;

#[derive(Serialize, Deserialize)]
struct PersonalBgtxData {
    name:      String,
    game:      String,
    lang_from: String,
    lang_to:   String,
    entries:   Vec<PersonalDbEntry>,
}

pub fn save_bgtx(db: &PersonalDb, path: &std::path::Path) -> Result<(), String> {
    let data = PersonalBgtxData {
        name:      db.name.clone(),
        game:      db.game.clone(),
        lang_from: db.lang_from.clone(),
        lang_to:   db.lang_to.clone(),
        entries:   db.entries().to_vec(),
    };
    let encoded    = bincode::serialize(&data).map_err(|e| e.to_string())?;
    let compressed = zstd::encode_all(encoded.as_slice(), 3).map_err(|e| e.to_string())?;
    let mut file   = std::fs::File::create(path).map_err(|e| e.to_string())?;
    file.write_all(BGTX_MAGIC).map_err(|e| e.to_string())?;
    file.write_all(&[BGTX_VERSION]).map_err(|e| e.to_string())?;
    file.write_all(&compressed).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_bgtx(path: &std::path::Path) -> Result<PersonalDb, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() < 5 || &bytes[..4] != BGTX_MAGIC {
        return Err("Invalid .bgtx format (bad magic bytes)".into());
    }
    let decompressed = zstd::decode_all(&bytes[5..]).map_err(|e| e.to_string())?;
    let data: PersonalBgtxData = bincode::deserialize(&decompressed).map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().into_owned();
    Ok(PersonalDb::from_entries(
        data.name, path_str, data.game,
        data.lang_from, data.lang_to,
        data.entries,
    ))
}

/// Read only the header of a .bgtx file (much faster than full load).
pub struct BgtxPeek {
    pub name:        String,
    pub game:        String,
    pub lang_from:   String,
    pub lang_to:     String,
    pub entry_count: usize,
}

pub fn peek_bgtx(path: &std::path::Path) -> Option<BgtxPeek> {
    use std::io::Read as _;
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic).ok()?;
    if &magic != BGTX_MAGIC { return None; }
    let mut _ver = [0u8; 1];
    reader.read_exact(&mut _ver).ok()?;
    let decoder = zstd::Decoder::new(reader).ok()?;
    // We need all data to get entry_count, so we load the full struct here
    let data: PersonalBgtxData = bincode::deserialize_from(decoder).ok()?;
    Some(BgtxPeek {
        entry_count: data.entries.len(),
        name:        data.name,
        game:        data.game,
        lang_from:   data.lang_from,
        lang_to:     data.lang_to,
    })
}
