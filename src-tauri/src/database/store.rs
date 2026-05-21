use ahash::AHashMap;
use crate::database::types::{DbEntry, DbInfo};

pub struct TranslationDb {
    pub name:      String,
    pub game:      String,
    pub lang_from: String,
    pub lang_to:   String,
    pub read_only: bool,
    entries:    Vec<DbEntry>,
    // Level 1 — ID-based: (form_id, sub_type, original) → translated  (skipped when form_id == 0)
    // Using original as part of the key handles records where the same form_id + sub_type
    // appear multiple times with different text (e.g. quest journal CNAM stages).
    by_id:      AHashMap<(u32, String, String), String>,
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
            // Level 1: (form_id, sub_type, original) — disambiguates quest stages sharing
            // the same form_id and sub_type but carrying different original text.
            if e.form_id != 0 {
                if let Some(st) = &e.sub_type {
                    by_id.entry((e.form_id, st.clone(), e.original.clone()))
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

        let db = TranslationDb { name, game, lang_from, lang_to, read_only, entries, by_id, contextual, text_only };
        tracing::info!("[db] Indexed {} entries for '{}'", db.entries.len(), db.name);
        db
    }

    /// 3-level lookup: (form_id + sub_type + original) → contextual → plain-text.
    pub fn lookup(&self, form_id: u32, original: &str, record_type: &str, sub_type: &str) -> Option<&str> {
        // Level 1: exact match — identifies the record by ID *and* its specific text variant.
        // This correctly handles multiple CNAM stages on the same quest record.
        if form_id != 0 {
            if let Some(t) = self.by_id.get(&(form_id, sub_type.to_owned(), original.to_owned())) {
                return Some(t.as_str());
            }
        }
        // Level 2: contextual (record_type + sub_type + original) — used for sources
        // without form_id (XML, CSV) that still carry record type information.
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

    /// Full-text search across original strings (case-insensitive substring match).
    /// Scores: exact = 100, starts_with = 80, contains = 60.
    /// Only returns entries that have a non-empty translation.
    pub fn search_text(&self, query: &str, max_results: usize) -> Vec<crate::database::types::DbSearchMatch> {
        use crate::database::types::DbSearchMatch;
        if query.is_empty() { return vec![]; }
        let q = query.to_lowercase();

        let mut results: Vec<(u8, &DbEntry)> = self.entries.iter()
            .filter(|e| !e.translated.is_empty())
            .filter_map(|e| {
                let o = e.original.to_lowercase();
                let score = if o == q                 { 100u8 }
                       else if o.starts_with(&q[..])  {  80   }
                       else if o.contains(&q[..])      {  60   }
                       else                            { return None; };
                Some((score, e))
            })
            .collect();

        results.sort_by(|a, b| b.0.cmp(&a.0));
        results.truncate(max_results);

        results.into_iter().map(|(score, e)| DbSearchMatch {
            source:      "ref_db".into(),
            original:    e.original.clone(),
            translated:  e.translated.clone(),
            form_id:     e.form_id,
            record_type: e.record_type.clone(),
            sub_type:    e.sub_type.clone(),
            editor_id:   e.editor_id.clone(),
            score,
        }).collect()
    }

    /// Returns the count of entries per record type, sorted alphabetically.
    pub fn record_type_counts(&self) -> Vec<crate::database::types::RecordTypeCount> {
        use crate::database::types::RecordTypeCount;
        let mut map: AHashMap<String, (usize, usize)> = AHashMap::new();
        for e in &self.entries {
            let rt = e.record_type.as_deref().unwrap_or("").to_string();
            let slot = map.entry(rt).or_insert((0, 0));
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
    /// `record_type_filter`: if Some and non-empty, only entries of that type are returned.
    /// `search`: case-insensitive substring match on original OR translated text.
    pub fn browse(
        &self,
        record_type_filter: Option<&str>,
        search:             Option<&str>,
        offset:             usize,
        limit:              usize,
    ) -> crate::database::types::DbBrowseResult {
        use crate::database::types::{DbBrowseEntry, DbBrowseResult};
        let search_lower = search.map(|s| s.to_lowercase());

        let filtered: Vec<(usize, &DbEntry)> = self.entries.iter().enumerate()
            .filter(|(_, e)| {
                if let Some(rt) = record_type_filter {
                    if !rt.is_empty() {
                        let entry_rt = e.record_type.as_deref().unwrap_or("");
                        if entry_rt != rt { return false; }
                    }
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
                record_type: e.record_type.as_deref().unwrap_or("").to_string(),
                sub_type:    e.sub_type.as_deref().unwrap_or("").to_string(),
                editor_id:   e.editor_id.as_deref().unwrap_or("").to_string(),
                original:    e.original.clone(),
                translated:  e.translated.clone(),
            })
            .collect();

        DbBrowseResult { entries, total }
    }

    /// Update the `translated` field of a single entry identified by its Vec index.
    /// Also updates all three in-memory lookup indexes.
    /// Returns `false` if `idx` is out of range.
    pub fn update_entry_at_index(&mut self, idx: usize, new_translated: String) -> bool {
        if idx >= self.entries.len() { return false; }
        let e = &mut self.entries[idx];
        // Level 1 — by_id
        if e.form_id != 0 {
            if let Some(st) = &e.sub_type {
                self.by_id.insert((e.form_id, st.clone(), e.original.clone()), new_translated.clone());
            }
        }
        // Level 2 — contextual
        if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
            let key = format!("{}|{}|{}", rt, st, e.original);
            self.contextual.insert(key, new_translated.clone());
        }
        // Level 3 — text_only
        self.text_only.insert(e.original.clone(), new_translated.clone());
        e.translated = new_translated;
        true
    }

    /// Remove all entries whose `translated` field is empty or whitespace-only.
    /// Rebuilds all three in-memory indexes afterwards.
    /// Returns the number of removed entries.
    pub fn purge_untranslated(&mut self) -> usize {
        let before = self.entries.len();
        self.entries.retain(|e| !e.translated.trim().is_empty());
        let removed = before - self.entries.len();
        if removed > 0 { self.rebuild_indexes(); }
        removed
    }

    /// Rebuild all three in-memory lookup indexes from `self.entries`.
    fn rebuild_indexes(&mut self) {
        self.by_id.clear();
        self.contextual.clear();
        self.text_only.clear();
        for e in &self.entries {
            if e.form_id != 0 {
                if let Some(st) = &e.sub_type {
                    self.by_id
                        .entry((e.form_id, st.clone(), e.original.clone()))
                        .or_insert_with(|| e.translated.clone());
                }
            }
            if let (Some(rt), Some(st)) = (&e.record_type, &e.sub_type) {
                let key = format!("{}|{}|{}", rt, st, e.original);
                self.contextual.entry(key).or_insert_with(|| e.translated.clone());
            }
            self.text_only.entry(e.original.clone()).or_insert_with(|| e.translated.clone());
        }
    }

    pub fn add_entries(&mut self, new_entries: Vec<DbEntry>) {
        for e in new_entries {
            if e.form_id != 0 {
                if let Some(st) = &e.sub_type {
                    self.by_id.insert((e.form_id, st.clone(), e.original.clone()), e.translated.clone());
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
