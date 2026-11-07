use tauri::image::Image;
use tauri::menu::{
    IconMenuItem, IconMenuItemBuilder, IsMenuItem, Menu, MenuItem, PredefinedMenuItem,
};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::identity::display_name;
use crate::locale::{load_dict, tr};
use crate::state::AppState;

const TRAY_ID: &str = "scheduler-tray";

const REPO_URL: &str = "https://github.com/dragomano/Oups";

/// Lucide glyphs rendered to PNG by `pnpm tray-icons` (scripts/tray-icons.mjs).
const MENU_ICONS: [(&str, &[u8]); 4] = [
    ("open", include_bytes!("../icons/menu/app-window.png")),
    ("new", include_bytes!("../icons/menu/bell-plus.png")),
    ("settings", include_bytes!("../icons/menu/settings.png")),
    ("quit", include_bytes!("../icons/menu/power.png")),
];

/// Decode an embedded Lucide PNG into a tray-menu icon.
fn menu_icon(bytes: &[u8]) -> Option<Image<'static>> {
    Image::from_bytes(bytes)
        .ok()
        .and_then(|img| img.to_owned().into())
}

pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let menu = build_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // Hovering the tray icon shows the app's own name, like other apps.
        .tooltip(display_name(app))
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "new" => {
                show_main(app);
                let _ = app.emit("menu-new-reminder", ());
            }
            "settings" => {
                show_main(app);
                let _ = app.emit_to("main", "menu-open-settings", ());
            }
            "about" => {
                if let Err(e) = tauri_plugin_opener::open_url(REPO_URL, None::<&str>) {
                    eprintln!("failed to open {REPO_URL}: {e}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let lang = {
        let state = app.state::<AppState>();
        state.settings_lock().language.clone()
    };
    let dict = load_dict(&lang);
    let info = app.package_info();
    let mut about =
        IconMenuItemBuilder::with_id("about", format!("{} {}", display_name(app), info.version));
    if let Some(icon) = app.default_window_icon() {
        about = about.icon(icon.clone());
    }
    let about = about.build(app)?;
    let top = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<Box<dyn IsMenuItem<R>>> = Vec::with_capacity(6);
    items.push(Box::new(about));
    items.push(Box::new(top));
    for (id, icon_bytes) in MENU_ICONS {
        let label = match id {
            "open" => tr(&dict, "tray.open"),
            "new" => tr(&dict, "tray.new"),
            "settings" => tr(&dict, "toolbar.settings"),
            _ => tr(&dict, "tray.quit"),
        };
        let item: Box<dyn IsMenuItem<R>> = if let Some(icon) = menu_icon(icon_bytes) {
            Box::new(IconMenuItem::with_id(
                app,
                id,
                label,
                true,
                Some(icon),
                None::<&str>,
            )?)
        } else {
            Box::new(MenuItem::with_id(app, id, label, true, None::<&str>)?)
        };
        items.push(item);
    }
    let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// Rebuild the menu with the current language (called after language change).
pub fn rebuild(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        match build_menu(app) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => eprintln!("tray menu rebuild failed: {e}"),
        }
    }
}
