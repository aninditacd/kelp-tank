# Kelp Tank

Kelp Tank is a hobby plugin for Kelpi, Dita's terminal app. Each Claude session shows as a fish in a 3D kelp aquarium.
It is a hobby project with no Linear tickets. The view draws the tank (water, glass, sand, rock ledges, kelp and the creatures) from Kelpi's live sessions, and a click jumps to a session. An end-to-end check in the private instance, then an install in Dita's live Kelpi, finish version one.

## Stack

TypeScript (`strict`), pnpm, esbuild, Vitest, ESLint, Prettier, Husky with lint-staged. Three.js 0.186 is bundled into the view.
TypeScript stays on 6.0 because `typescript-eslint` 8.71 does not support TypeScript 7.

## Layout

- `kelpi.plugin.json` - manifest. Id `dita.kelp-tank`, one view `dita.kelp-tank.home` (placements: pane, sidebar.primary, sidebar.secondary), five commands (`dita.kelp-tank.summary`, `dita.kelp-tank.quiet`, `dita.kelp-tank.hook`, `dita.kelp-tank.agent-book` and `dita.kelp-tank.activity`), and one CLI verb, `kelpi kelp-tank`, mapped to the hook command.
- `src/backend.ts` - exports `activate(api)`; registers the summary command, which returns `api.workspaces.list()`, and the quiet command; it also listens to `api.agents.onEvent` to keep the quiet panes (see `src/quiet.ts`). The hook command is `kelpi kelp-tank <Event> --session <id> [--agent <id>] [--tool <name>]`: it updates the agent book, saves it in plugin storage (`babyAgents`), and emits the plugin events `dita.kelp-tank.hook` (one per call: `{ paneID, workspaceID, event, sessionId, agentId, toolName, at }`) and, when the book changed, `dita.kelp-tank.agents` (the book). The agent book command answers the book to a new page. The backend also keeps each pane's running tools and doze in memory (`recordTool`, `recordAgentEvent`), and the activity command answers them, with the last event they cover, to a new page.
- `src/ui/index.html`, `src/ui/app.ts` - the view. `app.ts` creates the tank, feeds it from `startLiveTank`, and passes each click to `jump`.
- `src/ui/tank.ts` - `createTank(canvas, { onSelect(paneId) })` returns `{ setState(state), recall(memory), snapshot(), dispose() }`. `recall` hands it what an earlier page remembered, before the first state, so creatures and the zoom and scroll come back; `snapshot` is what to remember now. It draws the scene about 30 frames a second (`src/ui/pacing.ts`), re-lays it on resize, re-sizes its canvas when the window's pixel ratio changes (a move to another screen) without re-laying it, moves the creatures, and calls `onSelect` once per click on a creature with its pane id (never for empty water). That signature is the click hand-off to `app.ts`'s `jump`; keep it stable. Each session's `babies` swim beside its creature (`babyPoint` in `behaviour.ts`, `makeBaby` in `creatures.ts`), carry its pane id so they hover and click as it, show their own agent's prop, and stay out of `snapshot`. Props on rails and babies are drawn at `propScale` (`MIN_PROP_SCALE` in `behaviour.ts`) so they read on small fish.
- `src/ui/behaviour.ts` - pure: `decideGoals(state)` and the points creatures head for, `isTired` (a working turn of `TIRED_AFTER_MS`, 10 minutes, or more), `restPoint` (where a dozer sleeps on its own ledge) and `heldActivity` (a prop's one-second hold) and `glassTap` (when a tap on the glass rings, robust to a dropped frame at 30 fps). `src/ui/tooltip.ts` - hover text. `src/ui/pick.ts` - the pane id under the pointer. All unit-tested in `tests/ui/`.
- `src/ui/creatures.ts`, `src/ui/effects.ts`, `src/ui/toon.ts` - the creature meshes with their eyelids (`setLids`), the "!" bubble, glow and ripple, and shared toon materials, ported from the approved preview. Not unit-tested: WebGL.
- `src/ui/layout.ts` - `layoutTank(widthPx, heightPx, count)`, the pure ledge layout in world units (140 px a unit). Ledges fit the view down to `MIN_LEDGE_SPACING`, then the tank grows taller than the view. `src/ui/colors.ts` - Kelpi's workspace colours and the kelp tint. Both are unit-tested in `tests/ui/`.
- `src/ui/pacing.ts` - pure: `paceFrame`, which animation frames draw under `FRAME_RATE_CAP` (about 30 a second, whatever the display's refresh rate). Unit-tested in `tests/ui/pacing.test.ts`. `docs/prd.md` answer 3 has the CPU it saved.
- `src/ui/pixels.ts` - pure: `nextCanvas`, the canvas's CSS size and pixel ratio (capped at `MAX_PIXEL_RATIO`, 2), or null when neither changed. A pixel-ratio change counts on its own. Unit-tested in `tests/ui/pixels.test.ts`.
- `src/ui/view.ts` - pure zoom and scroll maths: the reset view, zoom around the pointer, scrolling, wheel input and the camera. `src/ui/hidden.ts` - pure: which workspaces the tank draws, the menu's rows, the hidden-waiting dot, and the hidden set in Kelpi plugin storage (`hiddenWorkspaces`). Both are unit-tested in `tests/ui/`.
- `src/ui/memory.ts` - pure: where each creature starts on a new page and the view it opens at, from what the tank remembered in Kelpi plugin storage (`tankMemory`). Kelpi rebuilds a sidebar view's page on every workspace switch and gives a sidebar no view state, so this is how the tank keeps its state. Unit-tested in `tests/ui/memory.test.ts`.
- `src/ui/workspace-menu.ts` - the corner menu's DOM, drawn from `hidden.ts`. Not unit-tested: DOM only.
- `src/quiet.ts` - pure: `awaitingCount(reply)` reads the `Awaiting you: <n>` footer from a reply's last non-empty line, and `quietAfter(quiet, event)` keeps the set of panes whose last reply ended `Awaiting you: 0`. The backend (`src/backend.ts`) keeps that set in memory from `api.agents.onEvent` and answers the `dita.kelp-tank.quiet` command with it; the view asks after every snapshot and also applies Kelpi's `agent.event` events. Reply text is never stored, logged or sent. Unit-tested in `tests/quiet.test.ts`.
- `src/kelpi-world.ts` - Kelpi's workspaces and panes as plain data, built from a snapshot and kept current by applying `state.changed` events.
- `src/agents.ts` - pure: the agent book of each pane's live background agents, from Kelp Tank's Claude hook. `parseHookArgv`, `applyHook`, `liveAgents`, `readBook`, and `AGENT_TIMEOUT_MS` (an agent silent for more than 20 minutes has no baby fish). Unit-tested in `tests/agents.test.ts`, and replayed from a real run in `tests/baby-fish-run.test.ts`.
- `claude-hook/kelp-tank-hook.mjs` - the optional Claude Code hook (SubagentStart, SubagentStop, PreToolUse, PostToolUse, PostToolUseFailure) the README tells users to install. It runs `kelpi kelp-tank` with only the event, session, agent and tool, prints nothing and never waits. It is not in the plugin package. Tested by running it in `tests/hooks/kelp-tank-hook.test.ts`.
- `src/decide-tank.ts` - `decideTank(world, previous, chords, quiet, babies)`, the pure decider that turns the world into a `TankState`: creature, state (`update` for a waiting, quiet, non-rail pane), dozing (never for a rail, and not for a waiting conductor while a rail in its workspace is working), ledges, relaying, each session's activity (rails included), and each session's baby fish from the agent book, each with its own agent's activity.
- `src/shortcuts.ts` - each workspace's ⌘ shortcut, numbered by Kelpi's visible sidebar order with chords from its live keymap, and `ledgeLabel`, the text on a ledge.
- `src/activity.ts` - pure: what a working session is doing and whether a waiting one dozes. Tool groups (`activityForTool`), the parent session's running tools and each background agent's own running tools from `dita.kelp-tank.hook` events (`applyToolEvent`; an agent's tools outlive its parent's turn and clear on its finish, its `SubagentStop` or `session-end`), and the `idle_prompt` doze from Kelpi's `agent.event` (`applyAgentEvent`). It lives in `KelpiWorld.activity`; the backend keeps the same record, and a new page seeds it from the activity command (`readActivity`, `seedActivity`), so a dozer and a prop survive a workspace switch. Unit-tested in `tests/activity.test.ts`, and replayed from a real run in `tests/live-tank.test.ts`.
- `src/ui/activity-fx.ts` - the props for what a creature is doing (circling pages, doodling pencil, tiny terminal, orbiting globe, thought bubble), the tired sweat drop and the dozing "z"s, ported from the preview Dita picked. Not unit-tested: WebGL.
- `src/live-tank.ts` - `startLiveTank(kelpi, onState, onError)`, run by the view: keeps the `TankState` current from Kelpi's pushed events, resnapshots on a `gap` or a new epoch, and `jump(paneId)` focuses a session's pane. It takes the agent book from the backend after each snapshot and from each `dita.kelp-tank.agents` event, and re-decides every 30 seconds while any agent is left. After each snapshot it also seeds the activity from the backend, and skips the activity change of a buffered event the answer already covers.
- `src/kelpi-api.ts` - the slice of Kelpi's plugin API this plugin calls, copied from Kelpi's SDK at tag `v0.2.19` (the SDK is not on npm).
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
- CI (`.github/workflows/ci.yml`) runs on every PR. It builds Kelpi's CLI from github.com/benfriebe/kelpi at `v0.2.19` to run `pnpm validate`.

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

A plugin backend does hear Kelpi's session events, pushed through `api.events.on`. Rail A proved it in the private instance, in the first recorded run.

- The real run is `tests/fixtures/private-instance-run.jsonl`; `tests/fixtures/README.md` explains it. Test new logic against it.
- `docs/prd.md`, "Answered questions", records where the session name lives (the pane `title`, after a status prefix), focus from a plugin, and the frame rate.
- `src/tank-state.ts` is the shared shape the decider produces and the scene consumes.
- `tests/fixtures/update-footer-run.jsonl` is the second recorded run: real Claude replies for the footer rule, from Kelpi 0.2.19. `tests/fixtures/README.md` says which lines were driven.
- `probes/tank-probe/` is the throwaway plugin that measured all this. It is not part of Kelp Tank.
