use gtk::gdk::WindowState;
use gtk::glib::Propagation;
use gtk::prelude::{GtkWindowExt, WidgetExt};
use tauri::{LogicalSize, WebviewWindow};

fn with_gtk_window(
    window: &WebviewWindow,
    apply: impl FnOnce(gtk::ApplicationWindow) + Send + 'static,
) -> tauri::Result<()> {
    let handle = window.clone();
    window.run_on_main_thread(move || match handle.gtk_window() {
        Ok(native) => apply(native),
        Err(error) => eprintln!("failed to get GTK window '{}': {error}", handle.label()),
    })
}

/// Apply GTK's fixed-size window policy before mapping an auxiliary window.
pub fn keep_windowed(window: &WebviewWindow) {
    if let Err(error) = with_gtk_window(window, |native| {
        native.set_resizable(false);
        native.connect_window_state_event(|native, event| {
            let entered = event.changed_mask() & event.new_window_state();
            if entered.contains(WindowState::FULLSCREEN) {
                native.unfullscreen();
            }
            if entered.contains(WindowState::MAXIMIZED) {
                native.unmaximize();
            }
            Propagation::Proceed
        });
    }) {
        eprintln!(
            "failed to configure GTK window '{}': {error}",
            window.label()
        );
    }
}

/// GTK retains the default size as a constraint on a non-resizable window.
/// Update it together with the current size whenever the modal content fits.
pub fn fit_modal(window: &WebviewWindow, size: LogicalSize<f64>) -> tauri::Result<()> {
    with_gtk_window(window, move |native| {
        let width = size.width.round() as i32;
        let height = size.height.round() as i32;
        native.set_default_size(width, height);
        native.resize(width, height);
    })
}
