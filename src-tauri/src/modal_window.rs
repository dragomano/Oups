use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, Window, WindowEvent,
};

use crate::{locale, startup, state::AppState};

pub const LABELS: [&str; 2] = ["editor", "settings"];

#[derive(Debug, PartialEq)]
enum OwnerAction {
    Enable,
    EnableAndFocus,
}

fn owner_action(label: &str, event: &WindowEvent) -> Option<OwnerAction> {
    if !LABELS.contains(&label) {
        return None;
    }
    match event {
        WindowEvent::CloseRequested { .. } => Some(OwnerAction::EnableAndFocus),
        WindowEvent::Destroyed => Some(OwnerAction::Enable),
        _ => None,
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let Some(action) = owner_action(window.label(), event) else {
        return;
    };
    let Some(main) = window.app_handle().get_webview_window("main") else {
        return;
    };
    // Enable the owner before destroying the modal so Windows can activate it.
    // Destroyed is a fallback for windows destroyed without a close request.
    if main.set_enabled(true).is_err() {
        return;
    }
    if action == OwnerAction::EnableAndFocus
        && window.is_focused().unwrap_or(false)
        && main.is_visible().unwrap_or(false)
    {
        let _ = main.set_focus();
    }
}

pub fn focus_existing(app: &AppHandle) -> Result<bool, String> {
    for label in LABELS {
        if let Some(window) = app.get_webview_window(label) {
            window.unminimize().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    if focus_existing(&app)? {
        return Ok(());
    }
    let language = app.state::<AppState>().settings_lock().language.clone();
    let title = locale::tr(&locale::load_dict(&language), "settings.title");
    open(&app, "settings", "settings.html", &title)
}

pub fn open(app: &AppHandle, label: &str, page: &str, title: &str) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    let monitor = main
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(app.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or("monitor missing")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = 820.0_f64.min((area.size.width as f64 / scale - 32.0).max(1.0));
    let height = 600.0_f64.min((area.size.height as f64 / scale - 48.0).max(1.0));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title(title)
        .decorations(false)
        .inner_size(width, height)
        .min_inner_size(280.0_f64.min(width), 240.0_f64.min(height))
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .visible(false);
    #[cfg(target_os = "windows")]
    let builder = builder.drag_and_drop(false);
    #[cfg(target_os = "windows")]
    let builder = builder.owner(&main).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let builder = builder.parent(&main).map_err(|e| e.to_string())?;
    builder.build().map_err(|e| e.to_string())?;
    main.set_enabled(false).map_err(|e| e.to_string())?;
    startup::fallback_reveal(app, label, startup::READY_FALLBACK);
    Ok(())
}

#[tauri::command]
pub fn fit_settings_window(app: AppHandle, height: f64) -> Result<(), String> {
    fit(&app, "settings", height)
}

fn fitted_size(
    width: f64,
    content_height: f64,
    available: LogicalSize<f64>,
    decoration: LogicalSize<f64>,
) -> LogicalSize<f64> {
    LogicalSize::new(
        width
            .max(1.0)
            .min((available.width - decoration.width).max(1.0)),
        content_height
            .max(1.0)
            .min((available.height - decoration.height).max(1.0)),
    )
}

fn clamp_position(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    origin: PhysicalPosition<i32>,
    available: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        position.x.clamp(
            origin.x,
            origin.x + available.width.saturating_sub(size.width) as i32,
        ),
        position.y.clamp(
            origin.y,
            origin.y + available.height.saturating_sub(size.height) as i32,
        ),
    )
}

pub fn fit(app: &AppHandle, label: &str, height: f64) -> Result<(), String> {
    if !height.is_finite() || height <= 0.0 {
        return Err("invalid modal height".into());
    }
    let window = app
        .get_webview_window(label)
        .ok_or("modal window missing")?;
    let main = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(main.current_monitor().map_err(|e| e.to_string())?)
        .ok_or("monitor missing")?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let size = fitted_size(
        inner.width as f64 / scale,
        height,
        LogicalSize::new(
            area.size.width as f64 / scale,
            area.size.height as f64 / scale,
        ),
        LogicalSize::new(
            outer.width.saturating_sub(inner.width) as f64 / scale,
            outer.height.saturating_sub(inner.height) as f64 / scale,
        ),
    );
    window.set_size(size).map_err(|e| e.to_string())?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    let position = if visible {
        window.outer_position().map_err(|e| e.to_string())?
    } else {
        let main_size = main.outer_size().map_err(|e| e.to_string())?;
        let origin = main.outer_position().map_err(|e| e.to_string())?;
        PhysicalPosition::new(
            origin.x + (main_size.width as i32 - outer.width as i32) / 2,
            origin.y + (main_size.height as i32 - outer.height as i32) / 2,
        )
    };
    window
        .set_position(clamp_position(position, outer, area.position, area.size))
        .map_err(|e| e.to_string())?;
    if !visible {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close_requested() -> WindowEvent {
        let (signal_tx, _) = std::sync::mpsc::channel();
        tauri_runtime::window::WindowEvent::CloseRequested { signal_tx }.into()
    }

    #[test]
    fn modal_close_restores_the_owner_before_destruction() {
        for label in ["editor", "settings"] {
            assert_eq!(
                owner_action(label, &close_requested()),
                Some(OwnerAction::EnableAndFocus),
                "{label} must release its owner at CloseRequested, before native destruction"
            );
            assert_eq!(
                owner_action(label, &WindowEvent::Destroyed),
                Some(OwnerAction::Enable)
            );
        }
    }

    #[test]
    fn unrelated_windows_and_events_do_not_release_the_owner() {
        for label in ["main", "reminder-123", "missed"] {
            assert_eq!(owner_action(label, &close_requested()), None);
            assert_eq!(owner_action(label, &WindowEvent::Destroyed), None);
        }
        for label in ["editor", "settings"] {
            for event in [
                WindowEvent::Focused(true),
                WindowEvent::Focused(false),
                WindowEvent::Resized(PhysicalSize::new(820, 600)),
            ] {
                assert_eq!(owner_action(label, &event), None);
            }
        }
    }

    #[test]
    fn fits_the_screen_independently_of_the_main_window() {
        let frame = LogicalSize::new(16.0, 40.0);
        assert_eq!(
            fitted_size(820.0, 582.0, LogicalSize::new(1280.0, 720.0), frame),
            LogicalSize::new(820.0, 582.0)
        );
        assert_eq!(
            fitted_size(820.0, 850.0, LogicalSize::new(390.0, 700.0), frame),
            LogicalSize::new(374.0, 660.0)
        );
        assert_eq!(
            fitted_size(360.0, 582.0, LogicalSize::new(1920.0, 1080.0), frame),
            LogicalSize::new(360.0, 582.0)
        );
        assert_eq!(
            fitted_size(820.0, 582.0, LogicalSize::new(10.0, 30.0), frame),
            LogicalSize::new(1.0, 1.0)
        );
    }

    #[test]
    fn keeps_the_modal_inside_an_offset_work_area() {
        assert_eq!(
            clamp_position(
                PhysicalPosition::new(100, 900),
                PhysicalSize::new(836, 622),
                PhysicalPosition::new(-1920, 40),
                PhysicalSize::new(1920, 1000)
            ),
            PhysicalPosition::new(-836, 418)
        );
    }

    #[test]
    fn frameless_modals_use_the_available_content_area() {
        assert_eq!(
            fitted_size(
                820.0,
                800.0,
                LogicalSize::new(390.0, 640.0),
                LogicalSize::new(0.0, 0.0)
            ),
            LogicalSize::new(390.0, 640.0)
        );
    }
}
