//! Optional Windows reminder sound. Playback never affects scheduling.

#[cfg(any(target_os = "windows", test))]
use std::path::Path;

pub fn play_reminder() {
    #[cfg(target_os = "windows")]
    if let Some(path) = crate::paths::sound_path() {
        play_if_file(&path, windows::play);
    }
}

#[cfg(any(target_os = "windows", test))]
fn play_if_file(path: &Path, play: impl FnOnce(&Path) -> bool) {
    if path.is_file() {
        // Missing, unreadable or unsupported audio is intentionally silent.
        let _ = play(path);
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    const SND_ASYNC: u32 = 0x0001;
    const SND_NODEFAULT: u32 = 0x0002;
    const SND_NOSTOP: u32 = 0x0010;
    const SND_FILENAME: u32 = 0x0002_0000;

    #[link(name = "winmm")]
    unsafe extern "system" {
        fn PlaySoundW(sound: *const u16, module: *mut std::ffi::c_void, flags: u32) -> i32;
    }

    pub(super) fn play(path: &Path) -> bool {
        let mut filename: Vec<u16> = path.as_os_str().encode_wide().collect();
        if filename.contains(&0) {
            return false;
        }
        filename.push(0);
        // SAFETY: filename is a live, NUL-terminated UTF-16 string. With
        // SND_FILENAME Windows opens the file during this call; asynchronous
        // playback does not retain our filename buffer. No module is needed.
        unsafe {
            PlaySoundW(
                filename.as_ptr(),
                std::ptr::null_mut(),
                SND_FILENAME | SND_ASYNC | SND_NODEFAULT | SND_NOSTOP,
            ) != 0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_or_deleted_sound_skips_playback() {
        let dir = std::env::temp_dir().join(format!("oups-sound-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("oups.wav");
        play_if_file(&path, |_| panic!("missing sound must not be played"));
        play_if_file(&dir, |_| panic!("a directory must not be played"));
        std::fs::write(&path, b"unsupported audio").unwrap();
        let mut called = false;
        play_if_file(&path, |actual| {
            assert_eq!(actual, path);
            called = true;
            false // A playback failure is harmless, including invalid audio.
        });
        assert!(called);
        std::fs::remove_file(&path).unwrap();
        play_if_file(&path, |_| panic!("deleted sound must not be played"));
        std::fs::remove_dir(&dir).unwrap();
    }
}
