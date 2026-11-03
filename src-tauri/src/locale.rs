//! Rust-side locale access (used for tray menu labels and the language list).
//! The frontend loads the same JSON files via the `get_locale` command.
//!
//! Resilience rule: English strings are embedded into the binary at compile
//! time. If the portable `locales/` folder is deleted or a language file is
//! missing, the app still shows English instead of raw keys.
//!
//! Language self-description: every locale file carries a `meta` block with
//! its own `code` (must match the file name) and native `name`. The settings
//! language list is derived from the folder — adding a `xx.json` with a
//! `meta` block adds a language, no source changes needed.

use serde::Serialize;
use serde_json::Value;

use crate::paths;

/// Fallback dictionary baked into the executable (kept in sync with
/// `locales/en.json` at compile time).
const EMBEDDED_EN: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../locales/en.json"));

fn embedded_dict() -> Value {
    serde_json::from_str(EMBEDDED_EN).unwrap_or_else(|_| Value::Object(serde_json::Map::new()))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocaleInfo {
    /// Language code, equals the locale file name (e.g. "en" -> en.json).
    pub code: String,
    /// Native display name declared by the file itself (e.g. "English").
    pub name: String,
}

fn embedded_locale_info() -> LocaleInfo {
    LocaleInfo {
        code: "en".into(),
        name: "English".into(),
    }
}

/// Scan every candidate locales dir (exe-side first, then bundle
/// resources) and let each file describe itself via `meta`. A file whose
/// meta.code disagrees with its file name is skipped. Codes found in the
/// exe-side folder win over bundled ones.
pub fn available() -> Vec<LocaleInfo> {
    let mut out: Vec<LocaleInfo> = Vec::new();
    let mut seen: Vec<String> = Vec::new();
    for dir in paths::locales_candidates() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut files: Vec<String> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".json"))
            .collect();
        files.sort();
        for file in files {
            let code = file.trim_end_matches(".json").to_string();
            if seen.contains(&code) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(dir.join(&file)) else {
                continue;
            };
            let Ok(dict) = serde_json::from_str::<Value>(&text) else {
                continue;
            };
            let meta = dict.get("meta");
            if let Some(declared) = meta.and_then(|m| m.get("code")).and_then(|c| c.as_str())
                && declared != code
            {
                eprintln!(
                    "locale file {file} declares code '{declared}' — file name mismatch, skipping"
                );
                continue;
            }
            let name = meta
                .and_then(|m| m.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or(&code)
                .to_string();
            seen.push(code.clone());
            out.push(LocaleInfo { code, name });
        }
    }
    if out.is_empty() {
        out.push(embedded_locale_info());
    }
    out
}

pub fn available_codes() -> Vec<String> {
    available().into_iter().map(|l| l.code).collect()
}

pub fn load_dict(lang: &str) -> Value {
    // External files first (allows fixing translations without a rebuild),
    // then the embedded English fallback. The exe-side folder wins over the
    // bundle resources.
    for dir in paths::locales_candidates() {
        for candidate in [lang, "en"] {
            let path = dir.join(format!("{candidate}.json"));
            if let Ok(text) = std::fs::read_to_string(&path)
                && let Ok(v) = serde_json::from_str::<Value>(&text)
            {
                return v;
            }
        }
    }
    embedded_dict()
}

/// Dot-path lookup, e.g. `tr(dict, "tray.open")`. Falls back to the last
/// path segment when the key is missing.
pub fn tr(dict: &Value, key: &str) -> String {
    let mut cur = dict;
    for part in key.split('.') {
        match cur.get(part) {
            Some(v) => cur = v,
            None => return key.rsplit('.').next().unwrap_or(key).to_string(),
        }
    }
    cur.as_str().unwrap_or(key).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_english_is_valid_and_complete() {
        let dict = embedded_dict();
        assert_eq!(tr(&dict, "tray.open"), "Open");
        assert_eq!(tr(&dict, "tray.new"), "New reminder");
        assert_eq!(tr(&dict, "tray.quit"), "Quit");
        // The brand name must not live in locales — meta only describes the language.
        assert!(dict.get("app").is_none());
        assert_eq!(tr(&dict, "meta.name"), "English");
        assert_eq!(tr(&dict, "meta.code"), "en");
    }

    #[test]
    fn tr_falls_back_to_key_segment() {
        let dict = serde_json::json!({ "a": { "b": "hello" } });
        assert_eq!(tr(&dict, "a.b"), "hello");
        assert_eq!(tr(&dict, "a.missing"), "missing");
        assert_eq!(tr(&dict, "x.y.z"), "z");
    }

    #[test]
    fn repository_locales_self_describe() {
        let locales = available();
        assert!(!locales.is_empty());
        // The repository ships en.json and ru.json; each declares itself.
        let codes: Vec<&str> = locales.iter().map(|l| l.code.as_str()).collect();
        assert!(codes.contains(&"en"), "en.json missing from locales dir");
        assert!(codes.contains(&"ru"), "ru.json missing from locales dir");
        let ru = locales.iter().find(|l| l.code == "ru").unwrap();
        assert_eq!(ru.name, "Русский");
    }

    #[test]
    fn every_shipped_locale_self_describes() {
        // Adding a language must stay a data change: a file lands in locales/
        // and describes itself. Anything a file gets wrong here would silently
        // drop it from the language list, so it fails loudly instead.
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../locales");
        let mut checked = 0;
        for entry in std::fs::read_dir(&dir).expect("locales dir must exist") {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let code = path.file_stem().unwrap().to_string_lossy().to_string();
            let text = std::fs::read_to_string(&path).unwrap();
            let dict: Value = serde_json::from_str(&text)
                .unwrap_or_else(|e| panic!("{code}.json is not valid JSON: {e}"));
            let meta = dict
                .get("meta")
                .unwrap_or_else(|| panic!("{code}.json has no meta block"));
            assert_eq!(
                meta.get("code").and_then(|c| c.as_str()),
                Some(code.as_str()),
                "{code}.json declares a code that does not match its file name"
            );
            let name = meta
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or_default();
            assert!(!name.trim().is_empty(), "{code}.json has no meta.name");
            // The direction the frontend applies comes from the file as well.
            if let Some(dir) = meta.get("dir").and_then(|d| d.as_str()) {
                assert!(
                    dir == "ltr" || dir == "rtl",
                    "{code}.json has an unknown dir: {dir}"
                );
            }
            checked += 1;
        }
        assert!(checked >= 2, "the repository should ship locale files");
    }

    #[test]
    fn available_codes_covers_available() {
        let codes = available_codes();
        let infos = available();
        assert_eq!(codes.len(), infos.len());
    }
}
