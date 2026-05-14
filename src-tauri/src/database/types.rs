use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbEntry {
    pub original:    String,
    pub translated:  String,
    pub record_type: Option<String>,
    pub sub_type:    Option<String>,
    pub editor_id:   Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbInfo {
    pub name:        String,
    pub game:        String,
    pub lang_from:   String,
    pub lang_to:     String,
    pub entry_count: usize,
    pub read_only:   bool,
}

#[derive(Debug, Serialize)]
pub struct ApplyResult {
    pub matched: usize,
    pub total:   usize,
}

#[derive(Debug, Serialize)]
pub struct DbFileInfo {
    pub name:      String, // filename stem shown in the list
    pub path:      String, // full path
    pub format:    String, // "bgt" | "eet"
    pub size:      u64,
    pub game:      String, // game name from .bgt header, empty for .eet
    pub lang_from: String, // source language (e.g. "en"), empty for .eet
    pub lang_to:   String, // target language (e.g. "fr"), empty for .eet
}
