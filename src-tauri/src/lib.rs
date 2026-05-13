pub mod commands;
pub mod database;
pub mod parser;
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
            // tauri_plugin_log creates the file on the first log::xxx!() call,
            // so we emit a startup message here before any user action.
            if let Ok(log_dir) = app.path().app_log_dir() {
                let _ = std::fs::create_dir_all(&log_dir);
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
        .invoke_handler(tauri::generate_handler![
            commands::open_plugin_cmd,
            commands::save_session_cmd,
            commands::list_sessions_cmd,
            commands::load_session_cmd,
            commands::delete_session_cmd,
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
        ])
        .run(tauri::generate_context!())
        .expect("BGS Translator failed to start");
}
