use tauri::State;

use crate::compare::{compute_diff, DiffStats, PluginDiffResult, SessionLookup};
use crate::database::DbState;
use crate::parser::open_file;
use crate::translation::session::{get_sessions_dir, load_session};

// ── Quick diff check — returns only stats ─────────────────────────────────────

/// Parses both plugins and returns aggregate diff statistics only.
/// Much lighter over IPC than the full diff — use this for the "Vérifier" button.
#[tauri::command]
pub async fn check_plugin_diff_cmd(
    path_old: String,
    path_new: String,
) -> Result<DiffStats, String> {
    log::info!("[compare] check_diff: {} vs {}", path_old, path_new);

    let old = open_file(std::path::Path::new(&path_old))
        .map_err(|e| format!("Erreur lecture plugin A : {e}"))?;
    let new_file = open_file(std::path::Path::new(&path_new))
        .map_err(|e| format!("Erreur lecture plugin B : {e}"))?;

    let (_, stats) = compute_diff(old.entries, new_file.entries, None, None, false);

    log::info!(
        "[compare] check_diff done — +{} -{} ~{} ={} (récupérables: {})",
        stats.added, stats.removed, stats.modified, stats.unchanged, stats.recoverable
    );
    Ok(stats)
}

// ── Full diff — returns all records ──────────────────────────────────────────

/// Parses both plugins and returns the complete record-level diff.
///
/// `session_id`       — id of a saved `.bgts` session (stem of the file, without extension),
///                      used to find existing translations for recovery.
///                      Pass `null` / `None` if unavailable.
/// `include_unchanged` — whether to include Unchanged records in the result
///                       (false by default to keep the payload small).
#[tauri::command]
pub async fn compute_plugin_diff_cmd(
    path_old:          String,
    path_new:          String,
    session_id:        Option<String>,
    include_unchanged: bool,
    state:             State<'_, DbState>,
    app:               tauri::AppHandle,
) -> Result<PluginDiffResult, String> {
    log::info!("[compare] compute_diff: {} vs {}", path_old, path_new);

    let old = open_file(std::path::Path::new(&path_old))
        .map_err(|e| format!("Erreur lecture plugin A : {e}"))?;
    let new_file = open_file(std::path::Path::new(&path_new))
        .map_err(|e| format!("Erreur lecture plugin B : {e}"))?;

    // Resolve session path from id (sessions are stored in the managed app-data dir)
    let session_lookup: Option<SessionLookup> = match session_id.as_deref() {
        Some(id) if !id.is_empty() => {
            let sess_path = get_sessions_dir(&app)?.join(format!("{}.bgts", id));
            match load_session(&sess_path) {
                Ok(sess) => {
                    log::info!("[compare] Session chargée : {} entrées", sess.entries.len());
                    Some(SessionLookup::build(&sess.entries))
                }
                Err(e) => {
                    log::warn!("[compare] Impossible de charger la session '{}': {}", id, e);
                    None
                }
            }
        }
        _ => None,
    };

    // Grab a reference to the currently loaded reference DB (if any)
    let db_guard = state.0.lock().map_err(|e| e.to_string())?;
    let db_ref   = db_guard.as_ref();

    let (records, stats) = compute_diff(
        old.entries,
        new_file.entries,
        session_lookup.as_ref(),
        db_ref,
        include_unchanged,
    );

    log::info!(
        "[compare] compute_diff done — +{} -{} ~{} ={} (récupérables: {})",
        stats.added, stats.removed, stats.modified, stats.unchanged, stats.recoverable
    );

    let file_old = std::path::Path::new(&path_old)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&path_old)
        .to_owned();
    let file_new = std::path::Path::new(&path_new)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&path_new)
        .to_owned();

    Ok(PluginDiffResult { file_old, file_new, stats, records })
}
