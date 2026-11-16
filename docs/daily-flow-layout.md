# The daily-flow layout

Since 16 Nov 2026, the `comms-<date>` and `do-<date>` sessions are daily turtles, like the date-named log session. Think sessions need no change: their workspace gets its own ledge, and their work words pick their creatures.

## The layout

The daily-flow plugin runs three daily sessions in one desk workspace, and topic sessions in a workspace named `Think`:

- **log**: the Melbourne date, such as `mon-16-11-2026`.
- **comms**: `comms-<date>`, such as `comms-mon-16-11-2026`.
- **do**: `do-<date>`.
- **think**: `<work>-<project>-<detail>`, such as `researching-cx-macros`, up to three panes.

## How the tank reads roles

- `roleForName` (`src/decide-tank.ts`) takes the session name from the pane title, without Kelpi's status prefix. It tries the patterns in `src/role-patterns.ts` in this order: day, rail, conductor. Then it looks for a work word (`brainstorming`, `building`, `researching`, `reviewing`, `auditing`). Anything else is a round fish.
- The day pattern was `^<weekday>-dd-mm-yyyy$`, so `comms-mon-16-11-2026` and `do-mon-16-11-2026` were round fish. It now allows an optional `comms-` or `do-` before the date. `todo-<date>`, `comms-notes` and `comms-<date>-old` stay round fish (`tests/daily-flow-layout.test.ts`).
- People can override the patterns in the corner menu (`rolePatterns` in plugin storage). A saved day pattern replaces the new default, so anyone who saved the old one keeps the old rule until they press **Reset to defaults**.

## How the tank treats workspaces

- Each workspace with a live Claude session gets one ledge, in Kelpi's sidebar order (`decideTank`). Every session in it shares that ledge, so three turtles sit on the desk ledge, and the Think workspace is its own group.
- Fish take their workspace's Kelpi colour. Nothing here changes a colour.
- The tank follows Kelpi's sidebar groups for order and shortcuts, and never draws a group. The auto-sort moves only top-level workspaces (`src/auto-sort.ts`).
- The `Awaiting you: <n>` footer works per pane (`src/quiet.ts`), so each daily session is a quiet update or a glowing "wants you" fish on its own.

## Checked

- On 16 Nov 2026, the live Kelpi had no sidebar groups (`kelpi group list` returned `[]`), so the layout is flat.
- On the same day, the live plugin storage held no saved `rolePatterns`, so the new default applies on install.
