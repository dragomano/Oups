use std::ffi::OsStr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager};

pub const AUTOSTART_ARG: &str = "--autostart";

/// How long a hidden window waits for its interface to report ready before
/// the fallback reveals it anyway.
pub const READY_FALLBACK: Duration = Duration::from_secs(10);

#[derive(Clone, Default)]
pub struct RevealFallback {
    cancelled: Arc<AtomicBool>,
}

impl RevealFallback {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    fn should_reveal(&self, visible: bool) -> bool {
        !self.cancelled.load(Ordering::Acquire) && !visible
    }
}

/// How this process was started: the autostart entry adds `--autostart`, and
/// such a launch keeps the main window in the tray even after the interface
/// reports itself ready.
#[derive(Clone, Copy, Debug)]
pub struct Launch {
    pub via_autostart: bool,
}

impl Launch {
    pub fn detect<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Self {
            via_autostart: is_autostart(args),
        }
    }
}

/// Whether the frontend's ready signal may reveal the main window.
pub fn reveal_on_ready(via_autostart: bool) -> bool {
    !via_autostart
}

/// Reveal a still-hidden window after `delay` unless its fallback was cancelled.
pub fn fallback_reveal(app: &AppHandle, label: &str, delay: Duration, fallback: RevealFallback) {
    let handle = app.clone();
    let label = label.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        if let Some(win) = handle.get_webview_window(&label)
            && fallback.should_reveal(win.is_visible().unwrap_or(true))
        {
            let _ = win.show();
            let _ = win.set_focus();
        }
    });
}

/// Refresh enabled registrations with the current executable path and arguments.
/// Disabled OS entries stay disabled; dev builds leave registrations untouched.
pub fn refresh_autostart<E>(
    development: bool,
    is_enabled: impl FnOnce() -> Result<bool, E>,
    enable: impl FnOnce() -> Result<(), E>,
) -> Result<(), E> {
    if !development && is_enabled()? {
        enable()?;
    }
    Ok(())
}

pub fn is_autostart<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    args.into_iter()
        .skip(1)
        .any(|arg| arg.as_ref() == OsStr::new(AUTOSTART_ARG))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::*;

    #[test]
    fn enabled_autostart_is_registered_again_after_the_status_check() {
        let calls = RefCell::new(Vec::new());
        let result = refresh_autostart(
            false,
            || {
                calls.borrow_mut().push("is_enabled");
                Ok::<_, &str>(true)
            },
            || {
                calls.borrow_mut().push("enable");
                Ok(())
            },
        );
        assert_eq!(result, Ok(()));
        assert_eq!(*calls.borrow(), ["is_enabled", "enable"]);
    }

    #[test]
    fn disabled_autostart_is_not_reenabled() {
        assert_eq!(
            refresh_autostart(
                false,
                || Ok::<_, &str>(false),
                || panic!("disabled autostart must stay disabled"),
            ),
            Ok(())
        );
    }

    #[test]
    fn development_builds_do_not_read_or_write_autostart() {
        assert_eq!(
            refresh_autostart::<&str>(
                true,
                || panic!("dev builds must not read autostart"),
                || panic!("dev builds must not overwrite the portable registration"),
            ),
            Ok(())
        );
    }

    #[test]
    fn status_check_errors_are_reported_without_registering() {
        assert_eq!(
            refresh_autostart(
                false,
                || Err("cannot read autostart"),
                || panic!("unknown autostart state must not enable it"),
            ),
            Err("cannot read autostart")
        );
    }

    #[test]
    fn registration_errors_are_reported() {
        assert_eq!(
            refresh_autostart(false, || Ok(true), || Err("cannot write autostart")),
            Err("cannot write autostart")
        );
    }

    #[test]
    fn manual_launch_reveals_the_window_once_ready() {
        assert!(reveal_on_ready(Launch::detect(["Oups.exe"]).via_autostart));
    }

    #[test]
    fn autostart_launch_stays_hidden_after_ready() {
        assert!(!reveal_on_ready(
            Launch::detect(["Oups.exe", AUTOSTART_ARG]).via_autostart
        ));
    }

    #[test]
    fn autostart_requires_an_exact_argument_after_the_executable() {
        assert!(is_autostart(["Oups.exe", AUTOSTART_ARG]));
        assert!(is_autostart(["Oups.exe", "--other", AUTOSTART_ARG]));
        assert!(!is_autostart(["Oups.exe"]));
        assert!(!is_autostart(["Oups.exe", "--autostart=false"]));
        assert!(!is_autostart([AUTOSTART_ARG]));
        assert!(!is_autostart(Vec::<String>::new()));
    }

    #[test]
    fn pending_fallback_reveals_a_hidden_window() {
        assert!(RevealFallback::default().should_reveal(false));
    }

    #[test]
    fn ready_or_tray_hide_cancels_the_pending_reveal() {
        let fallback = RevealFallback::default();
        let timer = fallback.clone();

        fallback.cancel();

        assert!(!timer.should_reveal(false));
    }

    #[test]
    fn fallback_leaves_visible_or_closed_windows_alone() {
        assert!(!RevealFallback::default().should_reveal(true));
    }
}
