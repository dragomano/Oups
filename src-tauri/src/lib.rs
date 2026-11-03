mod backdrop;
mod commands;
mod db;
mod editor_window;
mod identity;
mod locale;
mod modal_window;
mod model;
mod paths;
mod recurrence;
mod relative;
mod scheduler;
mod settings;
mod sound;
mod startup;
mod state;
mod tray;
mod window_size;
mod wise;
mod wrm;

use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_autostart::ManagerExt as _;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    tauri::Builder::default()
        .manage(editor_window::Draft::default())
        // The main window is created hidden (tauri.conf.json) and shown by the
        // frontend; this decides whether the ready signal may show it at all.
        .manage(startup::Launch::detect(std::env::args_os()))
        // Must be the first plugin: a manual second launch reveals this one.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !startup::is_autostart(args) {
                tray::show_main(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![startup::AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Remember the bundle resource dir so bundled builds (macOS .app,
            // deb/AppImage) can find the locales folder at runtime.
            paths::set_resource_dir(app.path().resource_dir().ok());
            // The window is still hidden (tauri.conf.json), so it opens at the
            // size the monitor it lands on can hold, centered, without a jump.
            if let Err(e) = window_size::apply(app.handle()) {
                eprintln!("failed to size the main window: {e}");
            }
            let conn = db::open(&paths::db_path()).expect("failed to open reminders.db");
            let app_settings = settings::load(&conn);
            // The main window is transparent, so the system material (Mica on
            // Windows 11) can show through it and the window reads like a
            // native app. Older systems keep the flat background.
            backdrop::apply_to_main(app.handle(), &app_settings.theme);
            app.manage(AppState {
                db: Mutex::new(conn),
                settings: Mutex::new(app_settings),
                missed: Mutex::new(Vec::new()),
            });
            tray::build(app.handle())?;
            let autostart = app.autolaunch();
            if let Err(e) = startup::refresh_autostart(
                cfg!(debug_assertions),
                || autostart.is_enabled(),
                || autostart.enable(),
            ) {
                eprintln!("failed to refresh autostart registration: {e}");
            }
            scheduler::startup_catchup(app.handle());
            scheduler::spawn(app.handle().clone());
            // Safety net: the main window stays hidden until the frontend
            // reports ready. If the interface never loads (broken assets, a
            // JS crash), reveal it anyway instead of staying invisible.
            if startup::reveal_on_ready(app.state::<startup::Launch>().via_autostart) {
                startup::fallback_reveal(app.handle(), "main", startup::READY_FALLBACK);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            modal_window::on_window_event(window, event);
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
            {
                for label in modal_window::LABELS {
                    if let Some(modal) = window.app_handle().get_webview_window(label) {
                        let _ = modal.close();
                    }
                }
                let close_to_tray = {
                    let app = window.app_handle();
                    let state = app.state::<AppState>();
                    state.settings_lock().close_to_tray
                };
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            modal_window::open_settings,
            modal_window::fit_settings_window,
            editor_window::open_editor,
            editor_window::get_editor_reminder,
            editor_window::fit_editor_window,
            commands::main_window_ready,
            commands::popup_window_ready,
            commands::window_control,
            commands::window_maximized,
            commands::app_name,
            commands::open_external,
            backdrop::window_backdrop,
            commands::list_reminders,
            commands::upsert_reminder,
            commands::delete_reminder,
            commands::set_reminder_enabled,
            commands::set_reminder_completed,
            commands::snooze_reminder,
            commands::snooze_missed_all,
            commands::get_popup_data,
            commands::dismiss_missed,
            commands::dismiss_missed_one,
            commands::get_settings,
            commands::set_settings,
            commands::set_autostart,
            commands::get_locale,
            commands::list_locales,
            commands::export_reminders,
            commands::import_reminders,
        ])
        .run(context)
        .expect("error while running tauri application");
}
