pub mod commands;
pub mod database;
pub mod formats;
pub mod parser;
pub mod spellcheck;
pub mod translation;
pub mod updater;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                // Default level: Info only. Debug messages are enabled at runtime
                // when the user activates debug mode via set_debug_mode_cmd.
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("bgstranslator".to_string()),
                    },
                ))
                .build(),
        )
        .setup(|app| {
            // Ensure the log directory exists before the first message is written.
            if let Ok(log_dir) = app.path().app_log_dir() {
                let _ = std::fs::create_dir_all(&log_dir);
                // Remove legacy "BGS Translator.log" created by older builds
                // (before the file_name was explicitly set to "bgstranslator").
                let legacy = log_dir.join("BGS Translator.log");
                if legacy.exists() { let _ = std::fs::remove_file(&legacy); }
            }
            log::info!("BGS Translator started — log file initialized");
            log::debug!("[system] Log dir: {:?}", app.path().app_log_dir());
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(database::DbState(std::sync::Mutex::new(None)))
        .manage(spellcheck::commands::SpellState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_plugin_cmd,
            commands::save_session_cmd,
            commands::list_sessions_cmd,
            commands::load_session_cmd,
            commands::delete_session_cmd,
            commands::import_translations_from_plugin_cmd,
            commands::ensure_dir_cmd,
            commands::export_plugin_cmd,
            database::commands::load_db_cmd,
            database::commands::apply_db_full_cmd,
            database::commands::add_to_db_cmd,
            database::commands::save_db_cmd,
            database::commands::export_db_cmd,
            database::commands::get_db_info_cmd,
            database::commands::create_db_cmd,
            database::commands::get_databases_dir_cmd,
            database::commands::scan_databases_dir_cmd,
            database::commands::find_db_for_game_cmd,
            database::commands::get_autosave_path_cmd,
            database::commands::convert_eet_cmd,
            database::commands::set_debug_mode_cmd,
            updater::check_update,
            updater::install_update,
            commands::get_log_path_cmd,
            commands::open_log_file_cmd,
            commands::open_log_dir_cmd,
            commands::import_format_cmd,
            commands::export_xtranslator_xml_cmd,
            commands::export_esptranslator_xml_cmd,
            commands::export_session_csv_cmd,
            commands::convert_to_bgt_cmd,
            spellcheck::commands::list_dictionaries_cmd,
            spellcheck::commands::download_dictionary_cmd,
            spellcheck::commands::delete_dictionary_cmd,
            spellcheck::commands::spellcheck_cmd,
            spellcheck::commands::get_suggestions_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("BGS Translator failed to start");
}
