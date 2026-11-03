# Demo data

Two ready-made datasets in the app's own JSON format, for trying the app out,
reproducing screenshots, or getting a feel for what each feature looks like
without typing twelve reminders by hand.

Scheduling dates are relative (`"+2h"`, `"-6d19h"`), so the files never go
stale: the importer resolves them against the moment of import, and a checkout
of any age imports as the same live dataset.

| File | Contents |
| --- | --- |
| `reminders.ru.json` | The same twelve reminders, Russian titles and notes |
| `reminders.en.json` | The same twelve reminders, English titles and notes |

## Using them

**In the app:** Import → pick `reminders.ru.json` / `reminders.en.json`. The
importer assigns fresh ids, so importing the same file twice adds a second copy
instead of overwriting anything.

**Anywhere else:** it is the same envelope the app writes on export
(`{ "version": 1, "exportedAt": …, "reminders": [ … ] }`), so the files double
as a reference for the import format — with one deliberate difference, below:
the exporter always writes absolute timestamps, while the reader also accepts
relative offsets.

## Timestamps are relative

Scheduling fields (`startAt`, `nextDue`, `createdAt`) hold offsets, not dates:

| Value | On import it means |
| --- | --- |
| `"+2h"` | two hours after the import moment |
| `"-6d19h"` | six days and nineteen hours before it |
| `"-30d"` | thirty days before it |

Grammar: a `+`/`-` sign followed by `d`, `h`, `m` components (days, hours,
minutes), in that order, at least one — parsed and tested in
`src-tauri/src/relative.rs`. The importer materializes them before the record
is validated or stored; `nextDue` is recomputed from the rule either way.

Absolute dates would decay in the repository: the importer recomputes the next
occurrence from the recurrence rule, so recurring reminders survive, but a
one-shot whose start has passed fires on the first scheduler tick — it pops up
and lands in "Completed". Relative offsets are what keep the demo alive on any
import day.

## What the dataset covers

The twelve reminders are arranged so all four Eisenhower quadrants are
populated, and every priority level plus every recurrence type shows up at
least once — once, daily, weekly, monthly, yearly and interval — in Russian and
in English.

## Regenerating

```bash
pnpm demo
```

Needed only when the dataset content changes (titles, notes, rules) — the dates
never need a refresh. The script anchors every rule so its next occurrence is
in the future at import time: recurring rules start in the past and are
self-correcting, one-shot rules start at the target moment, and both are
written as offsets. The package script then runs `biome check --write demo`, so
the files stay formatted.

The checks treat the files as what they are — templates: the TypeScript test
pins the relative form, and the Rust tests import a copy to verify that every
next occurrence lands in the future and all four quadrants stay populated.

## Two things the import deliberately does not reproduce

The JSON reader in `commands.rs` resets state on purpose, so a single import
cannot show the whole app:

- **`completed` comes back as `false`.** The "Completed" tab will be empty after
  importing. To fill it, finish a couple of reminders by hand — a click each on
  the toggle in the list, or a one-shot that fires.
- **`enabled` comes back as `true`.** Disabled reminders cannot come from an
  import; switch one off in the list.

`scripts/demo-data.mjs` keeps the finished titles in a `done` array for exactly
this, so the pair is one click away from existing in the UI.