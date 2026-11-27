// Canvas and popup geometry, shared by the browser entries and the capture
// driver. Plain JS so `node _shots/capture.mjs` can read it without a build
// step — the constants must match on both sides or the shot is the wrong size.
// The POPUP_* ones repeat scheduler.rs; geometry.test.mjs fails when they drift.

/** Logical size of an 11" iPad in landscape — one shape for the whole gallery. */
export const APP_W = 1194;
export const APP_H = 834;

/** Real popup window geometry (src-tauri/src/scheduler.rs): the size every
    popup opens at. The missed list is then fitted to its cards by the page. */
export const POPUP_W = 440;
export const POPUP_H = 310;
/** Distance from the work-area corner, POPUP_MARGIN in scheduler.rs. */
export const POPUP_MARGIN = 24;
/** Share of the work-area height a fitted popup may take, POPUP_MAX_SHARE in scheduler.rs. */
export const POPUP_MAX_SHARE = 2 / 3;

/** Tray-menu shot canvas: the menu (a DOM replica) over a desktop backdrop. */
export const TRAY_W = 460;
export const TRAY_H = 360;

/** The gallery languages. Mirrors the table in screenshots/README.md. */
export const LANGUAGES = ["en", "ru"];
