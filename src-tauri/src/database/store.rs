use std::collections::HashMap;
use crate::database::types::{DbEntry, DbInfo};

pub struct TranslationDb {
    pub name:      String,
    pub game:      String,
    pub lang_from: String,
    pub lang_to:   String,
    pub read_only: bool,
    entries:    Vec<DbEntry>,
    // Contextual index: "record_type|sub_type|original" → translated
    contextual: HashMap<String, String>,
    // Plain-text index: "original" → translated
    text_only:  HashMap<String, String>,
}

impl TranslationDb {
    pub fn from_entries(
        name: String, game: String,
        lang_from: String, lang_to: String,
        read_only: bool, entries: Vec<DbEntry>,
    ) -> Self {
        let mut contextual = HashMap::with_capacity(entries.len());
        let mut text_only  = HashMap::with_capacity(entries.len());

        for e in &entries {
            // Plain-text index: first match wins
            text_only.entry(e.original.clone()).or_insert_with(|| e.translated.clone());
            // Contextual index when both record type and sub-type are known
            if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
                let key = format!("{}|{}|{}", rt, st, e.original);
                contextual.entry(key).or_insert_with(|| e.translated.clone());
            }
        }

        TranslationDb { name, game, lang_from, lang_to, read_only, entries, contextual, text_only }
    }

    /// Looks up a translation: contextual index first, plain-text as fallback.
    pub fn lookup(&self, original: &str, record_type: &str, sub_type: &str) -> Option<&str> {
        let ctx_key = format!("{}|{}|{}", record_type, sub_type, original);
        self.contextual.get(&ctx_key)
            .or_else(|| self.text_only.get(original))
            .map(|s| s.as_str())
    }

    pub fn entry_count(&self) -> usize { self.entries.len() }
    pub fn entries(&self) -> &[DbEntry] { &self.entries }

    pub fn info(&self) -> DbInfo {
        DbInfo {
            name: self.name.clone(), game: self.game.clone(),
            lang_from: self.lang_from.clone(), lang_to: self.lang_to.clone(),
            entry_count: self.entries.len(), read_only: self.read_only,
        }
    }

    pub fn add_entries(&mut self, new_entries: Vec<DbEntry>) {
        for e in new_entries {
            self.text_only.insert(e.original.clone(), e.translated.clone());
            if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
                let key = format!("{}|{}|{}", rt, st, e.original);
                self.contextual.insert(key, e.translated.clone());
            }
            self.entries.push(e);
        }
    }
}
