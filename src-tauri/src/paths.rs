use std::path::PathBuf;
use std::sync::OnceLock;

/// Resource dir of the running bundle (macOS .app Contents/Resources, Linux
/// /usr/lib/<name>, ...). Set once at startup from the Tauri path resolver.
static RESOURCE_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

pub fn set_resource_dir(dir: Option<PathBuf>) {
    let _ = RESOURCE_DIR.set(dir);
}

fn resource_dir() -> Option<PathBuf> {
    RESOURCE_DIR.get().and_then(|o| o.clone())
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

fn dir_is_writable(dir: &std::path::Path) -> bool {
    let probe = dir.join(".oups_write_probe");
    match std::fs::File::create(&probe) {
        Ok(_) => {
            drop(std::fs::remove_file(&probe));
            true
        }
        Err(_) => false,
    }
}

/// Per-user app-data dir used when the exe folder is not writable
/// (installed .deb / .dmg builds). Windows keeps the portable layout.
fn platform_data_dir() -> PathBuf {
    let base = if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|h| PathBuf::from(h).join("Library/Application Support"))
            .unwrap_or_else(|_| PathBuf::from("/tmp"))
    } else if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
    } else {
        std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                std::env::var("HOME")
                    .map(|h| PathBuf::from(h).join(".local/share"))
                    .unwrap_or_else(|_| PathBuf::from("/tmp"))
            })
    };
    let dir = base.join("Oups");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Project root in debug builds (dev runs keep db + locales in the repo).
fn dev_root() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
}

/// Where reminders.db lives: the exe folder when writable (portable use —
/// Windows and unpacked builds), otherwise the platform app-data dir
/// (installed .deb / .dmg bundles put the binary in read-only locations).
/// In debug builds everything stays in the project root.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = dev_root() {
        return dir;
    }
    let portable = exe_dir().filter(|dir| dir_is_writable(dir));
    portable.unwrap_or_else(platform_data_dir)
}

pub fn db_path() -> PathBuf {
    data_dir().join("reminders.db")
}

/// Optional sound stays next to the executable, even when data lives elsewhere.
#[cfg(target_os = "windows")]
pub fn sound_path() -> Option<PathBuf> {
    dev_root().or_else(exe_dir).map(|dir| dir.join("oups.wav"))
}

/// Places where the locales folder may live, in priority order: next to the
/// exe (portable layout), then the bundle resource dir (macOS .app,
/// deb/AppImage installs), then the project root in dev builds. Missing
/// entries are skipped by the callers.
pub fn locales_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(dir) = exe_dir() {
        out.push(dir.join("locales"));
    }
    if let Some(res) = resource_dir() {
        out.push(res.join("locales"));
    }
    if let Some(dir) = dev_root() {
        out.push(dir.join("locales"));
    }
    out
}
