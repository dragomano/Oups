use tauri::{AppHandle, Config, Runtime};

/// Display name of the app, used for window titles and the tray tooltip.
/// `productName` in tauri.conf.json is the only source of the name; the bundle
/// identifier is a technical fallback for the case it is missing. The name is
/// not translatable, so it never lives in a locale file.
pub fn display_name<R: Runtime>(app: &AppHandle<R>) -> String {
    from_config(app.config())
}

fn from_config(config: &Config) -> String {
    config
        .product_name
        .clone()
        .unwrap_or_else(|| config.identifier.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_name_wins_over_the_identifier() {
        let config = Config {
            product_name: Some("Oups".into()),
            identifier: "com.toster.oups".into(),
            ..Config::default()
        };
        assert_eq!(from_config(&config), "Oups");
    }

    #[test]
    fn identifier_is_the_fallback() {
        let config = Config {
            product_name: None,
            identifier: "com.toster.oups".into(),
            ..Config::default()
        };
        assert_eq!(from_config(&config), "com.toster.oups");
    }

    /// The name is user-visible (window titles, tray tooltip), so the shipped
    /// config must declare it instead of falling back to the identifier.
    #[test]
    fn shipped_config_declares_a_product_name() {
        let config: Config = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is a valid Tauri config");
        assert!(
            config.product_name.is_some_and(|name| !name.is_empty()),
            "tauri.conf.json must keep a non-empty productName"
        );
    }
}
