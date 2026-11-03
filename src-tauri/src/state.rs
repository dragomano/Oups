use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::model::Reminder;
use crate::settings::Settings;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub settings: Mutex<Settings>,
    /// Snapshot of reminders shown in the "missed" popup (filled at startup).
    pub missed: Mutex<Vec<Reminder>>,
}

impl AppState {
    pub fn db_lock(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn settings_lock(&self) -> MutexGuard<'_, Settings> {
        self.settings.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn missed_lock(&self) -> MutexGuard<'_, Vec<Reminder>> {
        self.missed.lock().unwrap_or_else(|p| p.into_inner())
    }
}
