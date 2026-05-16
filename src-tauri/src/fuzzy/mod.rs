//! Fuzzy text matching for BGS Translator.
//!
//! Provides a [`TextIndex`] that supports two-algorithm similarity search:
//! - **Jaro-Winkler** for short strings (≤ [`SHORT_CHAR_LIMIT`] Unicode code points)
//!   — better suited to labels, NPC names and short sentences.
//! - **Normalized Levenshtein** for longer strings (descriptions, dialogue, books)
//!   — correctly penalises word-level insertions/deletions.
//!
//! Bulk searches run with per-request rayon parallelism (call from inside a
//! `tokio::task::spawn_blocking` closure to avoid blocking the async runtime).

pub mod commands;

use ahash::AHashSet;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use strsim::{jaro_winkler, normalized_levenshtein};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Strings with ≤ this many Unicode code points use Jaro-Winkler;
/// longer strings use normalised Levenshtein.
const SHORT_CHAR_LIMIT: usize = 60;

/// Minimum Jaccard bigram overlap required before computing full Levenshtein
/// on a long-string candidate. Avoids scanning the full source set.
const BIGRAM_PREFILTER: f32 = 0.20;

// ── Public types ──────────────────────────────────────────────────────────────

/// A (original, translated) pair from a known translation source.
#[derive(Debug, Clone, Deserialize)]
pub struct FuzzySourceEntry {
    pub original:   String,
    pub translated: String,
    /// `"session"` | `"personal_db"` | `"ref_db"`
    pub origin: String,
}

/// A single entry for which a fuzzy match is requested.
#[derive(Debug, Clone, Deserialize)]
pub struct FuzzyRequest {
    pub form_id:  u32,
    pub sub_type: String,
    pub original: String,
}

/// The best fuzzy match found for one [`FuzzyRequest`].
#[derive(Debug, Clone, Serialize)]
pub struct FuzzyMatch {
    /// Echoed from the request so the frontend can correlate results.
    pub form_id:     u32,
    pub sub_type:    String,
    /// The original query string — echoed back for `(form_id, sub_type, original)` correlation.
    pub original:    String,
    /// The suggested translation text.
    pub suggested:   String,
    /// Similarity score in `[0.0, 1.0]`.
    pub score:       f32,
    /// Which source produced this match (`"session"`, `"personal_db"`, …).
    pub origin:      String,
    /// The source string that was matched (shown to the user for context).
    pub matched_src: String,
    /// Which algorithm was used: `"jaro_winkler"` | `"levenshtein"`.
    pub algorithm:   String,
}

// ── TextIndex ─────────────────────────────────────────────────────────────────

/// In-memory index of known (original, translated) pairs.
///
/// Build once with [`TextIndex::build`], then call [`TextIndex::bulk_search`]
/// (from a `spawn_blocking` context) for best performance.
pub struct TextIndex {
    /// Core data: (original, translated, origin).
    entries: Vec<IndexedEntry>,
}

struct IndexedEntry {
    original:   String,
    translated: String,
    origin:     String,
    char_count: usize,
    /// Precomputed character-bigram set — `Some` only for long strings.
    bigrams:    Option<AHashSet<[char; 2]>>,
}

impl TextIndex {
    /// Build the index from a list of source entries.
    ///
    /// De-duplicates by `original` text (first occurrence wins, so callers
    /// should pass higher-priority sources first: session → personal DB → …).
    pub fn build(sources: Vec<FuzzySourceEntry>) -> Self {
        let mut seen = AHashSet::with_capacity(sources.len());
        let mut entries = Vec::with_capacity(sources.len());

        for s in sources {
            if s.original.is_empty() || s.translated.is_empty() {
                continue;
            }
            // First occurrence wins
            if !seen.insert(s.original.clone()) {
                continue;
            }

            let char_count = s.original.chars().count();
            let bigrams = if char_count > SHORT_CHAR_LIMIT {
                Some(char_bigrams(&s.original))
            } else {
                None
            };

            entries.push(IndexedEntry {
                original:   s.original,
                translated: s.translated,
                origin:     s.origin,
                char_count,
                bigrams,
            });
        }

        TextIndex { entries }
    }

    /// Number of indexed entries.
    pub fn len(&self) -> usize { self.entries.len() }
    pub fn is_empty(&self) -> bool { self.entries.is_empty() }

    // ── Single search ────────────────────────────────────────────────────────

    fn search_one(
        &self,
        form_id:       u32,
        sub_type:      &str,
        query:         &str,
        threshold_jw:  f32,
        threshold_lev: f32,
    ) -> Option<FuzzyMatch> {
        if query.is_empty() || self.is_empty() {
            return None;
        }

        let query_chars = query.chars().count();
        let is_short    = query_chars <= SHORT_CHAR_LIMIT;
        let threshold   = if is_short { threshold_jw } else { threshold_lev };

        // Precompute query bigrams once (only for long strings)
        let query_bigrams: Option<AHashSet<[char; 2]>> = if !is_short {
            Some(char_bigrams(query))
        } else {
            None
        };

        let best = self.entries.iter().filter_map(|e| {
            // ── Length pre-filter ────────────────────────────────────────────
            let ratio = e.char_count as f32 / query_chars as f32;
            if is_short {
                // Jaro-Winkler: allow more variation (short strings are noisy)
                if ratio < 0.35 || ratio > 2.85 {
                    return None;
                }
            } else {
                // Levenshtein: tighter band
                if ratio < 0.55 || ratio > 1.82 {
                    return None;
                }
                // ── Bigram Jaccard pre-filter ────────────────────────────────
                // Only compute Levenshtein when there is reasonable bigram overlap.
                if let (Some(qbg), Some(ebg)) = (&query_bigrams, &e.bigrams) {
                    if jaccard_bigrams(qbg, ebg) < BIGRAM_PREFILTER {
                        return None;
                    }
                }
            }

            // ── Similarity ───────────────────────────────────────────────────
            let score = if is_short {
                jaro_winkler(query, &e.original) as f32
            } else {
                normalized_levenshtein(query, &e.original) as f32
            };

            if score >= threshold {
                Some((score, &e.translated, &e.origin, &e.original, is_short))
            } else {
                None
            }
        })
        .max_by(|(a, ..), (b, ..)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        best.map(|(score, translated, origin, matched_src, is_short)| FuzzyMatch {
            form_id,
            sub_type:    sub_type.to_owned(),
            original:    query.to_owned(),
            suggested:   translated.clone(),
            score,
            origin:      origin.clone(),
            matched_src: matched_src.clone(),
            algorithm:   if is_short {
                "jaro_winkler".to_owned()
            } else {
                "levenshtein".to_owned()
            },
        })
    }

    // ── Bulk search ──────────────────────────────────────────────────────────

    /// Search for the best match for every request, in parallel.
    ///
    /// Returns only the requests that found a match above the threshold.
    /// Call this from inside `tokio::task::spawn_blocking`.
    pub fn bulk_search(
        &self,
        requests:      &[FuzzyRequest],
        threshold_jw:  f32,
        threshold_lev: f32,
    ) -> Vec<FuzzyMatch> {
        requests
            .par_iter()
            .filter_map(|req| {
                self.search_one(
                    req.form_id,
                    &req.sub_type,
                    &req.original,
                    threshold_jw,
                    threshold_lev,
                )
            })
            .collect()
    }
}

// ── Bigram helpers ────────────────────────────────────────────────────────────

fn char_bigrams(s: &str) -> AHashSet<[char; 2]> {
    let chars: Vec<char> = s.chars().collect();
    let mut set = AHashSet::with_capacity(chars.len().saturating_sub(1));
    for w in chars.windows(2) {
        set.insert([w[0], w[1]]);
    }
    set
}

fn jaccard_bigrams(a: &AHashSet<[char; 2]>, b: &AHashSet<[char; 2]>) -> f32 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.iter().filter(|bg| b.contains(*bg)).count();
    let union = a.len() + b.len() - intersection;
    if union == 0 { 1.0 } else { intersection as f32 / union as f32 }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn src(original: &str, translated: &str, origin: &str) -> FuzzySourceEntry {
        FuzzySourceEntry {
            original:   original.to_owned(),
            translated: translated.to_owned(),
            origin:     origin.to_owned(),
        }
    }

    #[test]
    fn exact_match_returns_score_one() {
        let idx = TextIndex::build(vec![
            src("The iron sword", "L'épée de fer", "session"),
        ]);
        let m = idx.search_one(1, "FULL", "The iron sword", 0.70, 0.70).unwrap();
        assert!((m.score - 1.0).abs() < 1e-4);
        assert_eq!(m.suggested, "L'épée de fer");
    }

    #[test]
    fn close_variant_matches_above_threshold() {
        let idx = TextIndex::build(vec![
            src("The iron sword", "L'épée de fer", "session"),
        ]);
        // "The iron blade" vs "The iron sword" — should score above 0.70
        let m = idx.search_one(1, "FULL", "The iron blade", 0.70, 0.70);
        assert!(m.is_some(), "Expected a fuzzy match");
    }

    #[test]
    fn completely_different_returns_none() {
        let idx = TextIndex::build(vec![
            src("The iron sword", "L'épée de fer", "session"),
        ]);
        let m = idx.search_one(1, "FULL", "Completely unrelated banana", 0.85, 0.85);
        assert!(m.is_none());
    }

    #[test]
    fn deduplication_session_wins_over_personal_db() {
        // session entry comes first → wins
        let idx = TextIndex::build(vec![
            src("Hello world", "Session translation", "session"),
            src("Hello world", "Personal DB translation", "personal_db"),
        ]);
        let m = idx.search_one(0, "", "Hello world", 0.70, 0.70).unwrap();
        assert_eq!(m.origin, "session");
    }

    /// Regression test: "Speak with Ellie" vs "Speak with Barrett" — both share
    /// the 11-char prefix "Speak with ", so strsim's unlimited-prefix JW should
    /// give a score near 1.0, well above any reasonable threshold.
    #[test]
    fn speak_with_ellie_vs_barrett() {
        let idx = TextIndex::build(vec![
            src("Speak with Barrett", "Parlez à Barrett.", "session"),
        ]);
        let m = idx.search_one(1, "DIAL", "Speak with Ellie", 0.85, 0.70);
        assert!(
            m.is_some(),
            "Expected a fuzzy match for 'Speak with Ellie' vs 'Speak with Barrett' at threshold 0.85, got None"
        );
        let m = m.unwrap();
        assert!(
            m.score >= 0.85,
            "Expected score ≥ 0.85, got {:.4}",
            m.score
        );
    }

    #[test]
    fn bulk_search_returns_all_matches() {
        let idx = TextIndex::build(vec![
            src("The iron sword", "L'épée de fer", "session"),
            src("Ancient ruins", "Ruines anciennes", "session"),
        ]);
        let requests = vec![
            FuzzyRequest { form_id: 1, sub_type: "FULL".into(), original: "The iron blade".into() },
            FuzzyRequest { form_id: 2, sub_type: "FULL".into(), original: "Ancient ruin".into() },
            FuzzyRequest { form_id: 3, sub_type: "FULL".into(), original: "Totally different".into() },
        ];
        let results = idx.bulk_search(&requests, 0.70, 0.70);
        // First two should match, third should not
        assert_eq!(results.len(), 2);
    }
}
