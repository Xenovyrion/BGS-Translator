use serde::{Deserialize, Serialize};
use crate::parser::strings_file::StringFileKind;

/// Status of a translation entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    #[default]
    Untranslated, // red    — not yet translated
    Pending,      // yellow — translation in progress / needs review
    Validated,    // green  — translation validated
    Ignored,      // grey   — to ignore (duplicates, technical terms, etc.)
}

/// Source of a string in the plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StringSource {
    Inline    { sub_type: String },
    Localized { string_id: u32, #[serde(with = "string_file_kind_serde")] kind: StringFileKind },
}

/// A translation entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationEntry {
    pub form_id:     u32,
    pub record_type: String,
    pub editor_id:   String,
    pub sub_type:    String,
    pub original:    String,
    pub translated:  String,
    #[serde(default)]
    pub status:      EntryStatus,
    pub source:      StringSource,
}

impl TranslationEntry {
    pub fn unique_key(&self) -> String {
        format!("{:08X}_{}", self.form_id, self.sub_type)
    }
}

mod string_file_kind_serde {
    use super::StringFileKind;
    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(kind: &StringFileKind, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(match kind {
            StringFileKind::Strings   => "strings",
            StringFileKind::DlStrings => "dlstrings",
            StringFileKind::IlStrings => "ilstrings",
        })
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<StringFileKind, D::Error> {
        match String::deserialize(d)?.as_str() {
            "strings"   => Ok(StringFileKind::Strings),
            "dlstrings" => Ok(StringFileKind::DlStrings),
            "ilstrings" => Ok(StringFileKind::IlStrings),
            other => Err(serde::de::Error::unknown_variant(other, &["strings", "dlstrings", "ilstrings"])),
        }
    }
}
