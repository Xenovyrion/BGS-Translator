pub mod xtranslator_xml;
pub mod esptranslator_xml;
pub mod session_csv;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ImportedEntry {
    pub original:    String,
    pub translated:  String,
    pub record_type: Option<String>,
    pub sub_type:    Option<String>,
    pub editor_id:   Option<String>,
}

pub(crate) fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
     .replace('<', "&lt;")
     .replace('>', "&gt;")
     .replace('"', "&quot;")
}
