//! Tauri commands exposing the fuzzy matching engine to the React frontend.
//!
//! ## Two entry points
//!
//! | Command | Use case |
//! |---------|----------|
//! | `get_fuzzy_matches_cmd` | Bulk — called once after plugin load (auto mode) or on bulk selection |
//! | `get_fuzzy_match_single_cmd` | Single entry — called from the EditPanel manual trigger |
//!
//! ## Source entries
//!
//! The frontend is responsible for building the `sources` array by combining:
//! 1. Current session — validated + pending translated entries (highest priority)
//! 2. Personal database — entries from the active `.bgtx` file
//!
//! Priority is determined by insertion order: sources that appear first in the
//! array win the deduplication inside [`TextIndex::build`].

use super::{FuzzyMatch, FuzzyRequest, FuzzySourceEntry, TextIndex};

// ── Bulk fuzzy match ──────────────────────────────────────────────────────────

/// Find the best fuzzy match for each entry in `targets`.
///
/// Only entries for which a match above the threshold is found are included
/// in the returned vec. The frontend should correlate results by
/// `(form_id, sub_type)`.
///
/// The heavy computation runs inside `spawn_blocking` so the tokio runtime
/// is never blocked.
///
/// ### Parameters
/// - `targets`       — entries to find matches for (typically: `untranslated` entries)
/// - `sources`       — known (original, translated) pairs sorted by priority
/// - `threshold_jw`  — minimum Jaro-Winkler score for short strings (0–1)
/// - `threshold_lev` — minimum Levenshtein score for long strings (0–1)
#[tauri::command]
pub async fn get_fuzzy_matches_cmd(
    targets:       Vec<FuzzyRequest>,
    sources:       Vec<FuzzySourceEntry>,
    threshold_jw:  f32,
    threshold_lev: f32,
) -> Result<Vec<FuzzyMatch>, String> {
    if targets.is_empty() || sources.is_empty() {
        return Ok(vec![]);
    }

    tracing::debug!(
        "[fuzzy] bulk_search: {} targets × {} sources (jw≥{:.0}% lev≥{:.0}%)",
        targets.len(), sources.len(),
        threshold_jw * 100.0, threshold_lev * 100.0,
    );

    let results = tokio::task::spawn_blocking(move || {
        let index = TextIndex::build(sources);
        tracing::debug!("[fuzzy] index built: {} unique source strings", index.len());
        index.bulk_search(&targets, threshold_jw, threshold_lev)
    })
    .await
    .map_err(|e| {
        tracing::error!("[fuzzy] bulk_search panicked: {}", e);
        e.to_string()
    })?;

    tracing::info!("[fuzzy] bulk_search done — {} matches found", results.len());
    Ok(results)
}

// ── Single-entry fuzzy match ──────────────────────────────────────────────────

/// Find the best fuzzy match for a single original string.
///
/// Used by the EditPanel "manual fuzzy" button. Returns `null` (serialised as
/// `None`) when no match is found above the threshold.
#[tauri::command]
pub async fn get_fuzzy_match_single_cmd(
    original:      String,
    sources:       Vec<FuzzySourceEntry>,
    threshold_jw:  f32,
    threshold_lev: f32,
) -> Result<Option<FuzzyMatch>, String> {
    if original.is_empty() || sources.is_empty() {
        return Ok(None);
    }

    tracing::debug!(
        "[fuzzy] single_search: '{}…' × {} sources",
        original.chars().take(40).collect::<String>(),
        sources.len(),
    );

    let result = tokio::task::spawn_blocking(move || {
        let requests = vec![FuzzyRequest {
            form_id:  0,
            sub_type: String::new(),
            original,
        }];
        let index = TextIndex::build(sources);
        index.bulk_search(&requests, threshold_jw, threshold_lev)
            .into_iter()
            .next()
    })
    .await
    .map_err(|e| {
        tracing::error!("[fuzzy] single_search panicked: {}", e);
        e.to_string()
    })?;

    Ok(result)
}
