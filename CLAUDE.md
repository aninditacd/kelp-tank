# Kelp Tank

Kelp Tank is a hobby plugin for Kelpi, Dita's terminal app. Each Claude session shows as a fish in a 3D kelp aquarium.
It is a hobby project with no Linear tickets. The view draws the tank (water, glass, sand, rock ledges, kelp and the creatures) from Kelpi's live sessions, and a click jumps to a session. Issue #7 checks it end to end and installs it in Dita's live Kelpi.

## Stack

TypeScript (`strict`), pnpm, esbuild, Vitest, ESLint, Prettier, Husky with lint-staged. Three.js 0.186 is bundled into the view.
TypeScript stays on 6.0 because `typescript-eslint` 8.71 does not support TypeScript 7.

## Layout

- `kelpi.plugin.json` - manifest. Id `dita.kelp-tank`, one view `dita.kelp-tank.home` (placements: pane, sidebar.primary, sidebar.secondary), one command `dita.kelp-tank.summary`.
- `src/backend.ts` - exports `activate(api)`; registers the summary command, which returns `api.workspaces.list()`.
- `src/ui/index.html`, `src/ui/app.ts` - the view. `app.ts` creates the tank, feeds it from `startLiveTank`, and passes each click to `jump`.
- `src/ui/tank.ts` - `createTank(canvas, { onSelect(paneId) })` returns `{ setState(state), recall(memory), snapshot(), dispose() }`. `recall` hands it what an earlier page remembered, before the first state, so creatures and the zoom and scroll come back; `snapshot` is what to remember now. It draws the scene, re-lays it on resize, moves the creatures, and calls `onSelect` once per click on a creature with its pane id (never for empty water). That signature is the click hand-off to issue #4; keep it stable.
- `src/ui/behaviour.ts` - pure: `decideGoals(state)` and the points creatures head for. `src/ui/tooltip.ts` - hover text. `src/ui/pick.ts` - the pane id under the pointer. All unit-tested in `tests/ui/`.
- `src/ui/creatures.ts`, `src/ui/effects.ts`, `src/ui/toon.ts` - the creature meshes, the "!" bubble, glow and ripple, and shared toon materials, ported from the approved preview. Not unit-tested: WebGL.
- `src/ui/layout.ts` - `layoutTank(widthPx, heightPx, count)`, the pure ledge layout in world units (140 px a unit). Ledges fit the view down to `MIN_LEDGE_SPACING`, then the tank grows taller than the view. `src/ui/colors.ts` - Kelpi's workspace colours and the kelp tint. Both are unit-tested in `tests/ui/`.
- `src/ui/view.ts` - pure zoom and scroll maths: the reset view, zoom around the pointer, scrolling, wheel input and the camera. `src/ui/hidden.ts` - pure: which workspaces the tank draws, the menu's rows, the hidden-waiting dot, and the hidden set in Kelpi plugin storage (`hiddenWorkspaces`). Both are unit-tested in `tests/ui/`.
- `src/ui/memory.ts` - pure: where each creature starts on a new page and the view it opens at, from what the tank remembered in Kelpi plugin storage (`tankMemory`). Kelpi rebuilds a sidebar view's page on every workspace switch and gives a sidebar no view state, so this is how the tank keeps its state. Unit-tested in `tests/ui/memory.test.ts`.
- `src/ui/workspace-menu.ts` - the corner menu's DOM, drawn from `hidden.ts`. Not unit-tested: DOM only.
- `src/kelpi-world.ts` - Kelpi's workspaces and panes as plain data, built from a snapshot and kept current by applying `state.changed` events.
- `src/decide-tank.ts` - `decideTank(world, previous)`, the pure decider that turns the world into a `TankState`: creature, state, ledges, relaying.
- `src/shortcuts.ts` - each workspace's ⌘ shortcut, numbered by Kelpi's visible sidebar order with chords from its live keymap, and `ledgeLabel`, the text on a ledge.
- `src/live-tank.ts` - `startLiveTank(kelpi, onState, onError)`, run by the view: keeps the `TankState` current from Kelpi's pushed events, resnapshots on a `gap` or a new epoch, and `jump(paneId)` focuses a session's pane.
- `src/kelpi-api.ts` - the slice of Kelpi's plugin API this plugin calls, copied from Kelpi's SDK at commit `897b5b8` (the SDK is not on npm).
- `scripts/build.mjs` - builds the installable package into `dist/`. The repo root is not a plugin package; `dist/` is.
- `scripts/package.mjs` - packs a built directory into one `.kelpi-plugin` file with Kelpi's CLI, offline. `.github/workflows/release.yml` runs it on a `v*` tag and attaches `kelp-tank.kelpi-plugin` to a GitHub release.
- `LICENSE` - MIT. `README.md` is written for strangers installing or building the plugin.
- `tests/` - Vitest. `tests/hooks/` runs the real pre-commit hook in a scratch copy of the repo. `tests/personal-data.test.ts` fails on any home-folder path or email address in a tracked file, no-reply addresses aside.

## Commands

- `pnpm check` - everything CI runs: format check, lint, typecheck, tests, build, validate.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`.
- `pnpm build` - writes `dist/`. `pnpm build:watch` rebuilds the two bundles on change; restart it after editing `src/ui/index.html` or `kelpi.plugin.json`, which it copies only at start.
- `pnpm validate` - `kelpi plugin validate dist --json`, offline, using the CLI at `$KELPI_CLI` or `~/apps/kelpi/packages/cli/dist/kelpi.js`. It never uses the `kelpi` on `PATH`, which reaches Dita's live app.
- `pnpm package` - builds `dist/` and packs it into `kelp-tank.kelpi-plugin` (gitignored), with the same CLI and the same dead socket as `pnpm validate`.
- Pre-commit runs Prettier, ESLint and `vitest related` on staged files, then `tsc`. Never skip it with `--no-verify`.
- CI (`.github/workflows/ci.yml`) runs on every PR. It builds Kelpi's CLI from github.com/benfriebe/kelpi at `897b5b8` to run `pnpm validate`.

With a private instance running (see below) and `kelpi_test` defined as in Kelpi's `docs/plugin-development.md`:

- `pnpm build:watch` beside `kelpi_test plugin dev dist --trust` - installs each rebuilt revision into the private instance.
- `kelpi_test plugin logs dita.kelp-tank` - backend `console.log` output.

Never point these at the running Kelpi unless Dita says so.

The repo is public. Keep home-folder paths, email addresses and Dita's private project and workspace names out of every tracked file, screenshots included. Use made-up names in fixtures and tests.

## Where to read more

- `docs/prd.md` - the version-one product decisions Dita approved on 14 Oct 2026. Read it before building.
- Test against Kelpi's private instance (`node scripts/dev-instance.mjs` in `~/apps/kelpi`, see its `docs/plugin-development.md`), never the live app.
- Kelpi's own source is at `~/apps/kelpi`.

## Kelpi session events (answered 14 Oct 2026)

A plugin backend does hear Kelpi's session events, pushed through `api.events.on`. Rail A proved it in the private instance (issue #2).

- The real run is `tests/fixtures/private-instance-run.jsonl`; `tests/fixtures/README.md` explains it. Test new logic against it.
- `docs/prd.md`, "Answered questions", records where the session name lives (the pane `title`, after a status prefix), focus from a plugin, and the frame rate.
- `src/tank-state.ts` is the shared shape the decider produces and the scene consumes.
- `probes/tank-probe/` is the throwaway plugin that measured all this. It is not part of Kelp Tank.
