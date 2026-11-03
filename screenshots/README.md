# Screenshots

Every screen of the app, in two languages. The data is made up — it is a
demo set, not anything from a real database.

Main-window composites are **1194×834** — the logical size of an 11" iPad in
landscape — so the gallery keeps one landscape shape and the files stay small
(the `09-tray` shot captures a smaller menu; `10-editor-mobile` uses a
390×844 viewport to show the narrow editor and settings layouts).
Captured at
1×: in a README column on a Retina display they still carry roughly 3× the
pixels they need.

Each area has a `.ru` and an `.en` variant. They are rendered from the real
components (same CSS, same locale files, same theme), so what you see is the
app itself.

| File | Area |
| --- | --- |
| `01-list.ru.png` / `.en` | Reminder list, **Active** tab |
| `02-completed.ru.png` / `.en` | Reminder list, **Completed** tab (finished and disabled) |
| `03-matrix.ru.png` / `.en` | **Matrix** tab — the Eisenhower 2×2 grid |
| `04-editor.ru.png` / `.en` | Reminder editor with the priority dropdown open |
| `05-settings.ru.png` / `.en` | Settings: language, theme, accents, popup position |
| `06-empty.ru.png` / `.en` | Empty state, before any reminder exists |
| `07-popup.ru.png` / `.en` | Reminder popup floating over the app |
| `08-popup-missed.ru.png` / `.en` | Missed reminders popup, shown at startup |
| `09-tray.ru.png` / `.en` | The tray icon's context menu |
| `10-editor-mobile.ru.png` / `.en` | Standalone editor at a phone-sized width, with compact monthly selection |
| `11-settings-mobile.ru.png` / `.en` | Modal settings at a phone-sized width, with a fixed autosave note |

## Notes

- The main-window shots show the app's own window chrome: the main window is
  frameless, so its frame (the gutter, the rounded bordered card) and the
  minimize/maximize/close buttons in the toolbar are part of the page, not
  something the harness adds. Windows draws the rounded corners, the shadow and
  the 1px window frame around them, which a browser capture cannot show.
- The popup shots composite the real 440×310 popup window over the app, sitting
  in the corner the app defaults to (`popup_corner = bottom-right`) — that is
  how it actually appears over your work. The missed list uses a taller window
  because that popup grows with the number of missed reminders.
  Unlike the main window, popups keep their native title bar.
- `04-editor` composites the standalone editor in an 820px-wide iframe, fitted
  to its content, with its custom header and the priority dropdown open.
  The editor has no native title bar. The narrow editor capture
  keeps the month grid behind its selected-days button and the footer visible.
- `05-settings` composites the real two-column settings window over the main
  window, using its own iframe and fitting its height to the settings content.
  It uses the same native owner and parent-window blocking as the editor.
  The narrow settings capture stacks the sections and keeps the autosave note visible.
- `06-empty` is kept here for completeness but is deliberately left out of both
  top-level READMEs — an empty window is the first thing every user sees anyway.
- `09-tray` is the one shot that mounts no Svelte component: the tray menu is
  native UI, invisible to a browser harness. The page rebuilds it in DOM from
  the real sources — labels through the app's own `t()`, the exact PNGs
  embedded into the binary, the name/version from `tauri.conf.json` and
  `Cargo.toml` — and paints only the Windows 11 menu chrome and the desktop
  backdrop around it. If the menu structure, a label or an icon changes, the
  shot regenerates from `_shots/tray.ts`; the chrome itself is a stand-in, not
  a pixel copy of Windows.
- Each README shows only its own language: `README.md` links the `.en` files,
  `README.ru.md` links the `.ru` files.
- Everything is captured in the light theme with the default blue accent.

## Regenerating

```bash
pnpm shots          # every shot, both languages
pnpm shots 03 07    # only the shots whose name starts this way
```

`_shots/` holds the harness that produces them. It mounts the real components —
same CSS, same locale files, same theme — with the Tauri `invoke` bridge
replaced by stubs, so nothing in `src/` knows it exists.

| File | Role |
| --- | --- |
| `capture.mjs` | Drives headless Edge over the DevTools protocol |
| `dataset.ts` | The demo dataset, resolved the way the importer resolves it |
| `stubs/` | The `invoke` bridge and the Tauri modules the UI touches |
| `main.ts`, `popup.ts`, `editor.ts`, `settings.ts`, `shell.ts`, `tray.ts` | The entry points: main window, popup, editor, settings, composite canvas, tray menu |
| `freeze-clock.ts` | Pins `Date.now()` to the moment in `config.ts` |
| `no-motion.ts` | Disables CSS transitions and animations on every content page |
| `config.ts` | The pinned moment |
| `geometry.mjs` | Canvas size, popup geometry, gallery languages — read by both sides |
| `vite.config.ts` | Project root, with `@tauri-apps/*` aliased to `stubs/` |

Four things about the capture are worth remembering:

- Drive it over the DevTools protocol — `Emulation.setDeviceMetricsOverride` at
  1194×834, then `Page.captureScreenshot`. `msedge --screenshot` is not a
  substitute: `--window-size` covers the window rather than the viewport, so
  the frame comes out the wrong size and has to be cropped, and the flag
  captures at an arbitrary moment — which is how the popup quietly renders as a
  plain app about half the time.
- Wait for the page to signal that its content is in the DOM before capturing.
  A fixed delay either wastes time or loses the popup. Each entry point raises
  `data-shots-ready` on `<html>` once it is done, and the driver fails loudly
  if it raises `data-shots-error` instead.
- Give every window its own iframe. `100vh` in a single document is the whole
  canvas rather than the popup's own window, and letting it through silently
  pushes the popup off the canvas. The shell sizes each frame instead, which is
  also where the popup's corner offset lives.
- Keep the captured frame byte-stable. Every content page turns CSS transitions
  and animations off (`no-motion.ts`), because a transition caught mid-flight —
  the priority picker's rotating chevron, say — rasterizes differently on each
  run and silently churns the committed PNGs. Edge is spawned with
  `--remote-debugging-port=0`, the real port is read from the
  `DevToolsActivePort` file in the run's own profile dir, and the process tree
  is killed with `taskkill /T /F` on Windows: a fixed port once glued every
  run to a leftover browser that still held it, until a wedged orphan failed
  runs with "never became ready".

The data is the demo set, not a hand-written fixture: `dataset.ts` ports the
import path (`relative::resolve_reminder`, then `initial_next_due`), so the
shots show what a user sees right after importing `demo/reminders.<lang>.json`
and the timestamps stay reproducible. The two fields the JSON reader
deliberately resets — `completed` and `enabled` — are the only ones the
`02-completed` shot sets itself; see `demo/README.md` for why.
