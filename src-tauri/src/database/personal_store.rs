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

    /// Full-text search across original strings (case-insensitive substring match).
    /// Scores: exact = 100, starts_with = 80, contains = 60.
    /// Only returns entries that have a non-empty translation.
    pub fn search_text(&self, query: &str, max_results: usize) -> Vec<crate::database::types::DbSearchMatch> {
        use crate::database::types::DbSearchMatch;
        if query.is_empty() { return vec![]; }
        let q = query.to_lowercase();

        let mut results: Vec<(u8, &PersonalDbEntry)> = self.entries.iter()
            .filter(|e| !e.translated.is_empty())
            .filter_map(|e| {
                let o = e.original.to_lowercase();
                let score = if o == q                { 100u8 }
                       else if o.starts_with(&q[..]) {  80   }
                       else if o.contains(&q[..])     {  60   }
                       else                           { return None; };
                Some((score, e))
            })
            .collect();

        results.sort_by(|a, b| b.0.cmp(&a.0));
        results.truncate(max_results);

        results.into_iter().map(|(score, e)| DbSearchMatch {
            source:      "personal_db".into(),
            original:    e.original.clone(),
            translated:  e.translated.clone(),
            form_id:     e.form_id,
            record_type: if e.record_type.is_empty() { None } else { Some(e.record_type.clone()) },
            sub_type:    if e.sub_type.is_empty()    { None } else { Some(e.sub_type.clone()) },
            editor_id:   if e.editor_id.is_empty()   { None } else { Some(e.editor_id.clone()) },
            score,
        }).collect()
    }

    /// Returns the count of entries per record type, sorted alphabetically.
    pub fn record_type_counts(&self) -> Vec<crate::database::types::RecordTypeCount> {
        use crate::database::types::RecordTypeCount;
        let mut map: AHashMap<String, (usize, usize)> = AHashMap::new();
        for e in &self.entries {
            let slot = map.entry(e.record_type.clone()).or_insert((0, 0));
            slot.0 += 1;
            if !e.translated.is_empty() { slot.1 += 1; }
        }
        let mut result: Vec<RecordTypeCount> = map.into_iter()
            .map(|(record_type, (count, translated))| RecordTypeCount { record_type, count, translated })
            .collect();
        result.sort_by(|a, b| a.record_type.cmp(&b.record_type));
        result
    }

    /// Returns a paginated, filtered slice of entries for the DB browser.
    pub fn browse(
        &self,
        record_type_filter: Option<&str>,
        search:             Option<&str>,
        offset:             usize,
        limit:              usize,
    ) -> crate::database::types::DbBrowseResult {
        use crate::database::types::{DbBrowseEntry, DbBrowseResult};
        let search_lower = search.map(|s| s.to_lowercase());

        let filtered: Vec<(usize, &PersonalDbEntry)> = self.entries.iter().enumerate()
            .filter(|(_, e)| {
                if let Some(rt) = record_type_filter {
                    if !rt.is_empty() && e.record_type != rt { return false; }
                }
                if let Some(ref sq) = search_lower {
                    if !sq.is_empty() {
                        let orig  = e.original.to_lowercase();
                        let trans = e.translated.to_lowercase();
                        if !orig.contains(sq.as_str()) && !trans.contains(sq.as_str()) {
                            return false;
                        }
                    }
                }
                true
            })
            .collect();

        let total = filtered.len();
        let entries: Vec<DbBrowseEntry> = filtered.into_iter()
            .skip(offset)
            .take(limit)
            .map(|(idx, e)| DbBrowseEntry {
                idx,
                form_id:     e.form_id,
                record_type: e.record_type.clone(),
                sub_type:    e.sub_type.clone(),
                editor_id:   e.editor_id.clone(),
                original:    e.original.clone(),
                translated:  e.translated.clone(),
            })
            .collect();

        DbBrowseResult { entries, total }
    }

    /// Update the `translated` field of a single entry identified by its index.
    /// Also updates both in-memory indexes. Returns `false` if `idx` is out of range.
    pub fn update_entry_at_index(&mut self, idx: usize, new_translated: String) -> bool {
        if idx >= self.entries.len() { return false; }
        let e = &mut self.entries[idx];
        if e.form_id != 0 {
            self.id_index.insert((e.form_id, e.sub_type.clone()), new_translated.clone());
        }
        self.text_index.insert(e.original.clone(), new_translated.clone());
        e.translated = new_translated;
        true
    }

    /// Remove all entries whose `translated` field is empty (or whitespace-only).
    /// Rebuilds the in-memory indexes afterwards.
    /// Returns the number of removed entries.
    pub fn purge_untranslated(&mut self) -> usize {
        let before = self.entries.len();
        self.entries.retain(|e| !e.translated.trim().is_empty());
        let removed = before - self.entries.len();
        if removed > 0 { self.rebuild_indexes(); }
        removed
    }

    /// Rebuild both in-memory lookup indexes from `self.entries`.
    fn rebuild_indexes(&mut self) {
        self.id_index.clear();
        self.text_index.clear();
        for e in &self.entries {
            if e.form_id != 0 {
                self.id_index
                    .entry((e.form_id, e.sub_type.clone()))
                    .or_insert_with(|| e.translated.clone());
            }
            self.text_index
                .entry(e.original.clone())
                .or_insert_with(|| e.translated.clone());
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
