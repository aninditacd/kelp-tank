# The daily-flow layout

Since 16 Nov 2026, the date-named log session is a turtle, `comms-<date>` is a clownfish with a speech bubble, and `do-<date>` is a fantail goldfish with a green tick. Dita asked for one creature each, all fish-shaped apart from the turtle. Think sessions need no change: their workspace gets its own ledge, and their work words pick their creatures.

## The layout

The daily-flow plugin runs three daily sessions in one desk workspace, and topic sessions in a workspace named `Think`:

- **log**: the Melbourne date, such as `mon-16-11-2026`.
- **comms**: `comms-<date>`, such as `comms-mon-16-11-2026`.
- **do**: `do-<date>`.
- **think**: `<work>-<project>-<detail>`, such as `researching-cx-macros`, up to three panes.

## How the tank reads roles

- `roleForName` (`src/decide-tank.ts`) takes the session name from the pane title, without Kelpi's status prefix. It tries the patterns in `src/role-patterns.ts` in this order: day, comms, do, rail, conductor. Then it looks for a work word (`brainstorming`, `building`, `researching`, `reviewing`, `auditing`). Anything else is a round fish.
- The day pattern is `^<weekday>-dd-mm-yyyy$`. The comms and do patterns are that date after `comms-` or `do-`. `todo-<date>`, `comms-notes` and `comms-<date>-old` stay round fish (`tests/daily-flow-layout.test.ts`).
- People can override all five patterns in the corner menu (`rolePatterns` in plugin storage). Patterns saved before comms and do existed have no entry for them, so those two take their defaults (`tests/role-patterns.test.ts`).

## How the tank treats workspaces

- Each workspace with a live Claude session gets one ledge, in Kelpi's sidebar order (`decideTank`). Every session in it shares that ledge, so the turtle, the clownfish and the fantail sit on the desk ledge, and the Think workspace is its own group.
- Fish take their workspace's Kelpi colour. Nothing here changes a colour.
- The tank follows Kelpi's sidebar groups for order and shortcuts, and never draws a group. The auto-sort moves only top-level workspaces (`src/auto-sort.ts`).
- The `Awaiting you: <n>` footer works per pane (`src/quiet.ts`), so each daily session is a quiet update or a glowing "wants you" fish on its own.

## Checked

- On 16 Nov 2026, the live Kelpi had no sidebar groups (`kelpi group list` returned `[]`), so the layout is flat.
- On the same day, the live plugin storage held no saved `rolePatterns`, so the new default applies on install.
