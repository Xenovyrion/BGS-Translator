use ahash::AHashMap;
use crate::database::types::{PersonalDbEntry, PersonalDbInfo};

/// In-memory representation of a personal database (.bgtx).
///
/// Lookup priority:
///   1. ID-based  : (form_id, sub_type) → translated  (exact, per-record)
///   2. Text-based: original            → translated  (fallback)
///
/// Adding entries:
///   - Same (form_id, sub_type) → overwrite (user is explicitly updating)
///   - Same original but different IDs → overwrite text index, add new ID entry
pub struct PersonalDb {
    pub name:      String,
    pub path:      String,   // stored path on disk
    pub game:      String,
    pub lang_from: String,
    pub lang_to:   String,
    entries:       Vec<PersonalDbEntry>,
    // Primary index: (form_id, sub_type) → translated
    id_index:      AHashMap<(u32, String), String>,
    // Secondary index: original → translated
    text_index:    AHashMap<String, String>,
}

impl PersonalDb {
    /// Build from a list of entries (used after loading from disk).
    pub fn from_entries(
        name:      String,
        path:      String,
        game:      String,
        lang_from: String,
        lang_to:   String,
        entries:   Vec<PersonalDbEntry>,
    ) -> Self {
        let mut id_index   = AHashMap::with_capacity(entries.len());
        let mut text_index = AHashMap::with_capacity(entries.len());

        for e in &entries {
            if e.form_id != 0 {
                id_index
                    .entry((e.form_id, e.sub_type.clone()))
                    .or_insert_with(|| e.translated.clone());
            }
            text_index
                .entry(e.original.clone())
                .or_insert_with(|| e.translated.clone());
        }

        PersonalDb { name, path, game, lang_from, lang_to, entries, id_index, text_index }
    }

    /// Empty database (no entries yet).
    pub fn empty(name: String, path: String, game: String, lang_from: String, lang_to: String) -> Self {
        Self::from_entries(name, path, game, lang_from, lang_to, vec![])
    }

    /// Lookup a translation.
    /// `form_id == 0` skips the ID index and goes straight to text.
    pub fn lookup(&self, form_id: u32, original: &str, sub_type: &str) -> Option<&str> {
        if form_id != 0 {
            let key = (form_id, sub_type.to_owned());
            if let Some(t) = self.id_index.get(&key) {
                return Some(t.as_str());
            }
        }
        self.text_index.get(original).map(|s| s.as_str())
    }

    /// Add or update entries.
    /// Always overwrites on same (form_id, sub_type); always overwrites text index too.
    pub fn add_entries(&mut self, new_entries: Vec<PersonalDbEntry>) {
        for e in new_entries {
            // ── Update ID index ──
            if e.form_id != 0 {
                self.id_index.insert((e.form_id, e.sub_type.clone()), e.translated.clone());
            }
            // ── Update text index ──
            self.text_index.insert(e.original.clone(), e.translated.clone());

            // ── Update entries vec: overwrite in place if same (form_id, sub_type) ──
            if e.form_id != 0 {
                if let Some(existing) = self.entries.iter_mut().find(|x| {
                    x.form_id == e.form_id && x.sub_type == e.sub_type
                }) {
                    existing.translated  = e.translated;
                    existing.original    = e.original;
                    existing.editor_id   = e.editor_id;
                    existing.record_type = e.record_type;
                    continue;
                }
            } else {
                // text-only: overwrite if same original
                if let Some(existing) = self.entries.iter_mut().find(|x| x.original == e.original) {
                    existing.translated = e.translated;
                    continue;
                }
            }
            self.entries.push(e);
        }
    }

    pub fn entry_count(&self) -> usize { self.entries.len() }
    pub fn entries(&self) -> &[PersonalDbEntry] { &self.entries }

    pub fn info(&self) -> PersonalDbInfo {
        PersonalDbInfo {
            name:        self.name.clone(),
            path:        self.path.clone(),
            game:        self.game.clone(),
            lang_from:   self.lang_from.clone(),
            lang_to:     self.lang_to.clone(),
            entry_count: self.entries.len(),
        }
    }
}
