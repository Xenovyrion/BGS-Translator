pub mod commands;

use ahash::AHashMap;
use serde::Serialize;

use crate::database::store::TranslationDb;
use crate::translation::entry::TranslationEntry;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Removed,
    Modified,
    Unchanged,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TranslationSource {
    Session,
    RefDb,
}

#[derive(Debug, Clone, Serialize)]
pub struct FieldDiff {
    pub sub_type:           String,
    pub text_old:           Option<String>,
    pub text_new:           Option<String>,
    pub translation:        Option<String>,
    pub translation_source: Option<TranslationSource>,
    pub change_kind:        ChangeKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordDiff {
    pub form_id:           u32,
    pub editor_id:         String,
    pub record_type:       String,
    pub change_kind:       ChangeKind,
    pub fields:            Vec<FieldDiff>,
    pub recoverable_count: usize,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DiffStats {
    pub added:               usize,
    pub removed:             usize,
    pub modified:            usize,
    pub unchanged:           usize,
    pub recoverable:         usize,
    pub total_fields_changed: usize,
}

#[derive(Debug, Serialize)]
pub struct PluginDiffResult {
    pub file_old: String,
    pub file_new: String,
    pub stats:    DiffStats,
    pub records:  Vec<RecordDiff>,
}

// ── Internal plugin index ─────────────────────────────────────────────────────

/// Indexed representation of all translatable fields in a plugin.
struct PluginIndex {
    /// form_id → (record_type, editor_id)  — first occurrence wins
    meta:      AHashMap<u32, (String, String)>,
    /// (form_id, sub_type) → ordered list of original texts
    fields:    AHashMap<(u32, String), Vec<String>>,
    /// form_id → ordered list of sub_types (order of first appearance)
    sub_types: AHashMap<u32, Vec<String>>,
    /// All form_ids in order of first appearance
    form_ids:  Vec<u32>,
}

impl PluginIndex {
    fn build(entries: Vec<TranslationEntry>) -> Self {
        let mut meta:      AHashMap<u32, (String, String)>    = AHashMap::new();
        let mut fields:    AHashMap<(u32, String), Vec<String>> = AHashMap::new();
        let mut sub_types: AHashMap<u32, Vec<String>>          = AHashMap::new();
        let mut form_ids:  Vec<u32>                            = Vec::new();
        let mut seen:      AHashMap<u32, ()>                   = AHashMap::new();

        for e in entries {
            let fid = e.form_id;

            if seen.insert(fid, ()).is_none() {
                form_ids.push(fid);
                meta.insert(fid, (e.record_type.clone(), e.editor_id.clone()));
            }

            // Track sub_type order (first appearance per record)
            let st_list = sub_types.entry(fid).or_default();
            if !st_list.contains(&e.sub_type) {
                st_list.push(e.sub_type.clone());
            }

            // Append text to the (form_id, sub_type) group
            fields.entry((fid, e.sub_type)).or_default().push(e.original);
        }

        PluginIndex { meta, fields, sub_types, form_ids }
    }

    fn contains(&self, fid: u32) -> bool {
        self.meta.contains_key(&fid)
    }

    fn meta(&self, fid: u32) -> Option<(&str, &str)> {
        self.meta.get(&fid).map(|(rt, eid)| (rt.as_str(), eid.as_str()))
    }

    fn sub_types(&self, fid: u32) -> &[String] {
        self.sub_types.get(&fid).map(|v| v.as_slice()).unwrap_or(&[])
    }

    fn texts(&self, fid: u32, sub_type: &str) -> &[String] {
        self.fields
            .get(&(fid, sub_type.to_owned()))
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }
}

// ── Session translation lookup ────────────────────────────────────────────────

/// Fast lookup built from a saved session's entries.
pub struct SessionLookup {
    /// (form_id, sub_type, original) → translated
    map: AHashMap<(u32, String, String), String>,
}

impl SessionLookup {
    pub fn build(entries: &[TranslationEntry]) -> Self {
        let mut map = AHashMap::with_capacity(entries.len());
        for e in entries {
            if !e.translated.is_empty() {
                map.insert(
                    (e.form_id, e.sub_type.clone(), e.original.clone()),
                    e.translated.clone(),
                );
            }
        }
        SessionLookup { map }
    }

    pub fn lookup(&self, fid: u32, sub_type: &str, original: &str) -> Option<&str> {
        self.map
            .get(&(fid, sub_type.to_owned(), original.to_owned()))
            .map(|s| s.as_str())
    }
}

// ── Core diff algorithm ───────────────────────────────────────────────────────

/// Computes the diff between two lists of plugin entries.
/// Returns the record-level diffs and aggregate stats.
pub fn compute_diff(
    entries_old:       Vec<TranslationEntry>,
    entries_new:       Vec<TranslationEntry>,
    session_lookup:    Option<&SessionLookup>,
    db:                Option<&TranslationDb>,
    include_unchanged: bool,
) -> (Vec<RecordDiff>, DiffStats) {
    let idx_old = PluginIndex::build(entries_old);
    let idx_new = PluginIndex::build(entries_new);

    // Full ordered set: new-file order first, then removed-only records at the end
    let mut all_ids: Vec<u32> = idx_new.form_ids.clone();
    for fid in &idx_old.form_ids {
        if !idx_new.contains(*fid) {
            all_ids.push(*fid);
        }
    }

    let mut records = Vec::new();
    let mut stats   = DiffStats::default();

    for fid in all_ids {
        let in_old = idx_old.contains(fid);
        let in_new = idx_new.contains(fid);

        // record_type and editor_id: prefer new version, fall back to old
        let (record_type, editor_id) = match idx_new
            .meta(fid)
            .or_else(|| idx_old.meta(fid))
        {
            Some((rt, eid)) => (rt.to_owned(), eid.to_owned()),
            None            => continue,
        };

        if in_old && !in_new {
            // ── Completely removed record ─────────────────────────────────────
            let fields = build_one_sided_fields(fid, &idx_old, ChangeKind::Removed);
            stats.removed             += 1;
            stats.total_fields_changed += fields.len();
            records.push(RecordDiff {
                form_id: fid, editor_id, record_type,
                change_kind: ChangeKind::Removed,
                recoverable_count: 0,
                fields,
            });
        } else if !in_old && in_new {
            // ── Completely new record ─────────────────────────────────────────
            let fields = build_one_sided_fields(fid, &idx_new, ChangeKind::Added);
            stats.added               += 1;
            stats.total_fields_changed += fields.len();
            records.push(RecordDiff {
                form_id: fid, editor_id, record_type,
                change_kind: ChangeKind::Added,
                recoverable_count: 0,
                fields,
            });
        } else {
            // ── Record present in both — diff fields ──────────────────────────
            let (fields, any_changed) = diff_record_fields(
                fid, &idx_old, &idx_new, &record_type,
                session_lookup, db,
            );

            let recoverable_count = fields
                .iter()
                .filter(|f| f.change_kind != ChangeKind::Unchanged && f.translation.is_some())
                .count();

            if any_changed {
                stats.modified             += 1;
                stats.total_fields_changed += fields
                    .iter()
                    .filter(|f| f.change_kind != ChangeKind::Unchanged)
                    .count();
                if recoverable_count > 0 {
                    stats.recoverable += 1;
                }
                records.push(RecordDiff {
                    form_id: fid, editor_id, record_type,
                    change_kind: ChangeKind::Modified,
                    fields,
                    recoverable_count,
                });
            } else {
                stats.unchanged += 1;
                if include_unchanged {
                    records.push(RecordDiff {
                        form_id: fid, editor_id, record_type,
                        change_kind: ChangeKind::Unchanged,
                        recoverable_count: 0,
                        fields,
                    });
                }
            }
        }
    }

    (records, stats)
}

/// Builds FieldDiff entries for a record that exists in only one of the two plugins.
fn build_one_sided_fields(fid: u32, idx: &PluginIndex, kind: ChangeKind) -> Vec<FieldDiff> {
    let mut fields = Vec::new();
    for st in idx.sub_types(fid) {
        for text in idx.texts(fid, st) {
            let (text_old, text_new) = match kind {
                ChangeKind::Removed => (Some(text.clone()), None),
                _                   => (None, Some(text.clone())),
            };
            fields.push(FieldDiff {
                sub_type: st.clone(),
                text_old,
                text_new,
                translation:        None,
                translation_source: None,
                change_kind:        kind.clone(),
            });
        }
    }
    fields
}

/// Diffs all fields of a record that exists in both plugins.
/// Returns the list of FieldDiffs and a flag indicating whether anything changed.
fn diff_record_fields(
    fid:            u32,
    idx_old:        &PluginIndex,
    idx_new:        &PluginIndex,
    record_type:    &str,
    session_lookup: Option<&SessionLookup>,
    db:             Option<&TranslationDb>,
) -> (Vec<FieldDiff>, bool) {
    // Union of sub_types: new order first, then old-only at the end
    let mut all_sub_types: Vec<String> = idx_new.sub_types(fid).to_vec();
    for st in idx_old.sub_types(fid) {
        if !all_sub_types.contains(st) {
            all_sub_types.push(st.clone());
        }
    }

    let mut fields      = Vec::new();
    let mut any_changed = false;

    for st in &all_sub_types {
        let texts_old = idx_old.texts(fid, st);
        let texts_new = idx_new.texts(fid, st);

        let mut group = diff_text_group(
            fid, st, record_type,
            texts_old, texts_new,
            session_lookup, db,
        );

        if group.iter().any(|f| f.change_kind != ChangeKind::Unchanged) {
            any_changed = true;
        }

        fields.append(&mut group);
    }

    (fields, any_changed)
}

/// Diffs two ordered lists of texts for the same (form_id, sub_type).
///
/// Algorithm:
///   1. Greedy exact-match pass → Unchanged
///   2. Remaining matched positionally → Modified
///   3. Surplus new texts → Added
///   4. Surplus old texts → Removed
fn diff_text_group(
    fid:            u32,
    sub_type:       &str,
    record_type:    &str,
    texts_old:      &[String],
    texts_new:      &[String],
    session_lookup: Option<&SessionLookup>,
    db:             Option<&TranslationDb>,
) -> Vec<FieldDiff> {
    let mut matched_old = vec![false; texts_old.len()];
    let mut matched_new = vec![false; texts_new.len()];

    // Pass 1 — exact matches (Unchanged)
    for (i, old) in texts_old.iter().enumerate() {
        for (j, new) in texts_new.iter().enumerate() {
            if !matched_old[i] && !matched_new[j] && old == new {
                matched_old[i] = true;
                matched_new[j] = true;
                break;
            }
        }
    }

    let unmatched_old: Vec<&String> = texts_old.iter().enumerate()
        .filter(|(i, _)| !matched_old[*i])
        .map(|(_, t)| t)
        .collect();
    let unmatched_new: Vec<&String> = texts_new.iter().enumerate()
        .filter(|(j, _)| !matched_new[*j])
        .map(|(_, t)| t)
        .collect();

    let mut result = Vec::new();

    // Emit Unchanged first (in new-file order)
    for (j, new) in texts_new.iter().enumerate() {
        if matched_new[j] {
            result.push(FieldDiff {
                sub_type:           sub_type.to_owned(),
                text_old:           Some(new.clone()),
                text_new:           Some(new.clone()),
                translation:        None,
                translation_source: None,
                change_kind:        ChangeKind::Unchanged,
            });
        }
    }

    // Pass 2 — positional matching of remaining → Modified
    let min_len = unmatched_old.len().min(unmatched_new.len());
    for i in 0..min_len {
        let old_text = unmatched_old[i];
        let new_text = unmatched_new[i];
        let (translation, source) =
            resolve_translation(fid, sub_type, record_type, old_text, session_lookup, db);
        result.push(FieldDiff {
            sub_type:           sub_type.to_owned(),
            text_old:           Some(old_text.clone()),
            text_new:           Some(new_text.clone()),
            translation,
            translation_source: source,
            change_kind:        ChangeKind::Modified,
        });
    }

    // Pass 3 — surplus new texts → Added
    for t in &unmatched_new[min_len..] {
        result.push(FieldDiff {
            sub_type:           sub_type.to_owned(),
            text_old:           None,
            text_new:           Some((*t).clone()),
            translation:        None,
            translation_source: None,
            change_kind:        ChangeKind::Added,
        });
    }

    // Pass 4 — surplus old texts → Removed
    for t in &unmatched_old[min_len..] {
        let (translation, source) =
            resolve_translation(fid, sub_type, record_type, t, session_lookup, db);
        result.push(FieldDiff {
            sub_type:           sub_type.to_owned(),
            text_old:           Some((*t).clone()),
            text_new:           None,
            translation,
            translation_source: source,
            change_kind:        ChangeKind::Removed,
        });
    }

    result
}

/// Looks up an existing translation for an old text.
/// Priority: session → reference DB.
fn resolve_translation(
    fid:            u32,
    sub_type:       &str,
    record_type:    &str,
    original:       &str,
    session_lookup: Option<&SessionLookup>,
    db:             Option<&TranslationDb>,
) -> (Option<String>, Option<TranslationSource>) {
    if let Some(sess) = session_lookup {
        if let Some(t) = sess.lookup(fid, sub_type, original) {
            return (Some(t.to_owned()), Some(TranslationSource::Session));
        }
    }
    if let Some(database) = db {
        if let Some(t) = database.lookup(fid, original, record_type, sub_type) {
            return (Some(t.to_owned()), Some(TranslationSource::RefDb));
        }
    }
    (None, None)
}
