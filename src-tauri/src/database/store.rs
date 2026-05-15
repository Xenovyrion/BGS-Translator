use ahash::AHashMap;
use crate::database::types::{DbEntry, DbInfo};

pub struct TranslationDb {
    pub name:      String,
    pub game:      String,
    pub lang_from: String,
    pub lang_to:   String,
    pub read_only: bool,
    entries:    Vec<DbEntry>,
    // Level 1 — ID-based: (form_id, sub_type) → translated  (skipped when form_id == 0)
    by_id:      AHashMap<(u32, String), String>,
    // Level 2 — Contextual: "record_type|sub_type|original" → translated
    contextual: AHashMap<String, String>,
    // Level 3 — Plain-text fallback: "original" → translated
    text_only:  AHashMap<String, String>,
}

impl TranslationDb {
    pub fn from_entries(
        name: String, game: String,
        lang_from: String, lang_to: String,
        read_only: bool, entries: Vec<DbEntry>,
    ) -> Self {
        let mut by_id      = AHashMap::with_capacity(entries.len());
        let mut contextual = AHashMap::with_capacity(entries.len());
        let mut text_only  = AHashMap::with_capacity(entries.len());

        for e in &entries {
            // Level 1: ID index (only when form_id is known and sub_type is present)
            if e.form_id != 0 {
                if let Some(st) = &e.sub_type {
                    by_id.entry((e.form_id, st.clone()))
                        .or_insert_with(|| e.translated.clone());
                }
            }
            // Level 2: contextual (first match wins)
            if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
                let key = format!("{}|{}|{}", rt, st, e.original);
                contextual.entry(key).or_insert_with(|| e.translated.clone());
            }
            // Level 3: plain-text fallback (first match wins)
            text_only.entry(e.original.clone()).or_insert_with(|| e.translated.clone());
        }

        TranslationDb { name, game, lang_from, lang_to, read_only, entries, by_id, contextual, text_only }
    }

    /// 3-level lookup: form_id → contextual → plain-text.
    pub fn lookup(&self, form_id: u32, original: &str, record_type: &str, sub_type: &str) -> Option<&str> {
        // Level 1: exact ID match (most precise)
        if form_id != 0 {
            if let Some(t) = self.by_id.get(&(form_id, sub_type.to_owned())) {
                return Some(t.as_str());
            }
        }
        // Level 2: contextual (record_type + sub_type + original)
        let ctx_key = format!("{}|{}|{}", record_type, sub_type, original);
        if let Some(t) = self.contextual.get(&ctx_key) {
            return Some(t.as_str());
        }
        // Level 3: plain-text fallback
        self.text_only.get(original).map(|s| s.as_str())
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
            if e.form_id != 0 {
                if let Some(st) = &e.sub_type {
                    self.by_id.insert((e.form_id, st.clone()), e.translated.clone());
                }
            }
            if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
                let key = format!("{}|{}|{}", rt, st, e.original);
                self.contextual.insert(key, e.translated.clone());
            }
            self.text_only.insert(e.original.clone(), e.translated.clone());
            self.entries.push(e);
        }
    }
}
