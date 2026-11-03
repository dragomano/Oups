//! Launch geometry of the main window.
//!
//! The window does not open at a fixed size: it is sized for the monitor the
//! cursor is on, so the taskbar is never covered and a scaled display is taken
//! into account (everything is computed in logical pixels). The size in
//! `tauri.conf.json` stays the reference — it is what a 1920×1080 screen gets —
//! a roomier work area grows the window up to a cap, and a tighter one shrinks
//! it just enough to fit. The window is then centered in the work area.

use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition};

/// The reference size in `tauri.conf.json` is tuned for a 1920×1080 screen with
/// a taskbar, i.e. 1920×1040 of work area.
const REFERENCE_WORK: LogicalSize<f64> = LogicalSize::new(1920.0, 1040.0);
/// Cap on following a bigger screen: a reminders list has no use for a window
/// spanning a 4K display.
const MAX_GROWTH: f64 = 1.5;
/// Desktop left visible around the window when it has to shrink to fit
/// (12 px on each side once centered).
const EDGE: f64 = 24.0;

/// The size to open a window with, in logical pixels.
pub fn initial_size(
    work: LogicalSize<f64>,
    reference: LogicalSize<f64>,
    min: LogicalSize<f64>,
) -> LogicalSize<f64> {
    // One factor for both axes keeps the window's shape, and the tighter axis
    // of the work area decides — an ultrawide screen does not stretch it.
    let growth = (work.width / REFERENCE_WORK.width)
        .min(work.height / REFERENCE_WORK.height)
        .clamp(1.0, MAX_GROWTH);
    // Never below the window's own minimum, never past the work area (unless
    // even the minimum does not fit, and then the minimum wins).
    let fit = |size: f64, min: f64, available: f64| size.max(min).min((available - EDGE).max(min));
    LogicalSize::new(
        fit(reference.width * growth, min.width, work.width).round(),
        fit(reference.height * growth, min.height, work.height).round(),
    )
}

/// Size and center the main window for the monitor the cursor is on (the one
/// Windows would place a new window on), falling back to the primary monitor.
/// Called from `setup`, before the window is revealed; a failure leaves the
/// window at its configured size and position.
pub fn apply(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("main window missing")?;
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .ok_or("main window missing from the config")?;
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    // No monitor information: keep the configured size and centering.
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let size = initial_size(
        LogicalSize::new(
            f64::from(area.size.width) / scale,
            f64::from(area.size.height) / scale,
        ),
        LogicalSize::new(config.width, config.height),
        LogicalSize::new(
            config.min_width.unwrap_or(0.0),
            config.min_height.unwrap_or(0.0),
        ),
    );

    // Move onto the target monitor first: a logical size becomes physical with
    // the scale factor of the monitor the window is on, and it may still sit on
    // another one.
    window
        .set_position(PhysicalPosition::new(area.position.x, area.position.y))
        .map_err(|e| e.to_string())?;

    // tao turns a requested inner size into a window size by adding the frame it
    // measures, and a window that has never been shown still reports the frame
    // it was created with — caption height included, since its first
    // non-client pass has not run yet. The first resize therefore lands about
    // 40px too tall; the second measures the real (invisible) frame and is
    // exact. Repeat until the size holds, which takes two passes.
    let mut previous = None;
    for _ in 0..3 {
        window.set_size(size).map_err(|e| e.to_string())?;
        let got = window.inner_size().map_err(|e| e.to_string())?;
        if previous == Some((got.width, got.height)) {
            break;
        }
        previous = Some((got.width, got.height));
    }

    // Center by the size the window actually got (outer: it includes the
    // invisible resize border).
    let outer = window.outer_size().map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            area.position.x + (area.size.width as i32 - outer.width as i32) / 2,
            area.position.y + (area.size.height as i32 - outer.height as i32) / 2,
        ))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The window size `tauri.conf.json` asks for, and its minimums.
    fn configured() -> (LogicalSize<f64>, LogicalSize<f64>) {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("config is valid JSON");
        let window = config["app"]["windows"]
            .as_array()
            .and_then(|windows| windows.iter().find(|w| w["label"] == "main"))
            .expect("the config has a main window");
        let number = |key: &str| window[key].as_f64().expect("a configured number");
        (
            LogicalSize::new(number("width"), number("height")),
            LogicalSize::new(number("minWidth"), number("minHeight")),
        )
    }

    #[test]
    fn the_reference_screen_keeps_the_configured_size() {
        // A 1920×1080 screen with a taskbar is what the config is tuned for, so
        // nothing changes there.
        let (reference, min) = configured();
        assert_eq!(
            initial_size(REFERENCE_WORK, reference, min),
            LogicalSize::new(reference.width, reference.height)
        );
    }

    #[test]
    fn a_roomier_work_area_grows_the_window_with_its_shape() {
        let reference = LogicalSize::new(1000.0_f64, 660.0);
        let min = LogicalSize::new(660.0_f64, 440.0);
        // 2560×1440 with a taskbar: both axes are 4/3 of the reference.
        assert_eq!(
            initial_size(LogicalSize::new(2560.0, 1400.0), reference, min),
            LogicalSize::new(1333.0, 880.0)
        );
        // Growth stops at the cap instead of following a huge screen.
        assert_eq!(
            initial_size(LogicalSize::new(3840.0, 2120.0), reference, min),
            LogicalSize::new(1500.0, 990.0)
        );
    }

    #[test]
    fn a_tighter_work_area_shrinks_the_window_only_as_far_as_it_must() {
        let reference = LogicalSize::new(1000.0_f64, 660.0);
        let min = LogicalSize::new(660.0_f64, 440.0);
        // A 1366×768 laptop: the configured size still fits.
        assert_eq!(
            initial_size(LogicalSize::new(1366.0, 728.0), reference, min),
            LogicalSize::new(1000.0, 660.0)
        );
        // 1366×768 at 125%: 1093×582 logical, so only the height has to give.
        assert_eq!(
            initial_size(LogicalSize::new(1093.0, 582.0), reference, min),
            LogicalSize::new(1000.0, 558.0)
        );
        // A small screen keeps a margin of desktop around the window.
        assert_eq!(
            initial_size(LogicalSize::new(1024.0, 560.0), reference, min),
            LogicalSize::new(1000.0, 536.0)
        );
        // Absurdly small: the window's own minimum wins over that margin.
        assert_eq!(
            initial_size(LogicalSize::new(600.0, 400.0), reference, min),
            min
        );
    }

    #[test]
    fn an_ultrawide_screen_does_not_stretch_the_window() {
        let reference = LogicalSize::new(1000.0_f64, 660.0);
        let min = LogicalSize::new(660.0_f64, 440.0);
        // 2560×1080: the width has room to spare, the height does not, and the
        // shape stays the configured one.
        assert_eq!(
            initial_size(LogicalSize::new(2560.0, 1040.0), reference, min),
            LogicalSize::new(1000.0, 660.0)
        );
    }
}
