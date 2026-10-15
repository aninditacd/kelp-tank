# Recorded run from Kelpi's private instance

Captured once on 14 Oct 2026 by Rail A (issue #2), from Kelpi's private test instance at Kelpi commit `897b5b8`. It is real data. Never hand-edit it; capture a new run instead. The one exception: on 15 Oct 2026 (issue #18) every recording here had its home-folder paths and three private workspace names renamed for the public repo, by exact string replacement and nothing else. Paths under the home folder now start `/srv/demo`, and the renamed workspaces are Harbour, Lighthouse and Lagoon, with their sessions and pane labels to match.

## Files

- `private-instance-run.jsonl` - the `kelpi plugin watch` stream. Line 1 is the snapshot envelope `{ok, epoch, sequence, state}`. Each later line is one `{ok, event}` envelope, unchanged.
  - Only event lines named `state.changed`, `daemon.notification` or `daemon.attention-request` are kept. The stream also carried 125 `daemon.system-stats` lines (one a second), 3 `plugin.contributions.changed` lines and 1 `daemon.reveal-pane` line, which were left out whole. No kept line was altered.
- `private-instance-backend-log.txt` - lines from `kelpi plugin logs dita.kelp-tank-probe` for the same run. The probe plugin's backend (`probes/tank-probe/`) logged `event <sequence> <name> <change kinds>` for each event it heard through `api.events.on`. The file keeps the `event` lines for sequences after the snapshot and up to the last kept event, plus every `report` line from the probe view.

## What happened in the run

| Pane label | Workspace | What it did |
| --- | --- | --- |
| `day` | Kelp (green) | `claude -n wed-14-10-2026`: idle, running, waitingForInput, then idle when the window was raised with it focused. |
| `conductor` | Kelp | `claude -n conducting-kelp-tank`: idle, running, waitingForInput. Never focused, so it stays waiting. |
| `rail-a` | Kelp | `claude -n rail-a`: running, waitingForInput, then idle 2 seconds after the probe view called `ui.focusPane` on it with the window active. |
| `focus-target` | Kelp | `claude -n focus-target`: running, waitingForInput. The probe focused it with the window in the background, and it stayed waiting. It went idle once the window was raised. |
| `fish` | Ops (purple, muted) | `claude -n kelp-tank`: running, waitingForInput, then `/exit` (its session id cleared, status stayed `waitingForInput`), then the pane closed (`pane-removed`). |
| `shell` | Ops | A plain terminal. It never ran an agent. |

The snapshot on line 1 was taken before any Claude session started, so it holds no agent sessions. Every session arrives through events. The run has no Codex session, and no session already running at the snapshot. The Default workspace also holds an unlabelled shell and two plugin panes (`Kelp Tank`, `Kelp Tank Probe`).

## How it was captured

1. `node scripts/dev-instance.mjs --state out/kelp-tank-playground` in `~/apps/kelpi`.
2. `kelpi_test workspace create --name Kelp --color green` and `--name Ops --color purple --muted`, then panes named as above.
3. `kelpi_test plugin watch > raw.jsonl` in the background, then `claude -n <name>` in each Claude pane, accepting the folder-trust prompt and rejecting the MCP prompt.
4. The prompt `Reply with the single word ok. Do not use any tools.` in each Claude pane, then the focus and close steps in the table.
5. SIGINT to the watch process, and the line selection described above.

# Sidebar order run

`sidebar-order-run.jsonl` was captured on 14 Oct 2026 by Rail B (issue #3), from Kelpi's private instance at Kelpi commit `897b5b8`, with `kelpi plugin watch`. It is real data, kept the same way as the run above: line 1 is the snapshot envelope, and only `state.changed` lines are kept. The stream also carried 3 `daemon.system-stats` lines and 1 `daemon.reveal-pane` line, which were left out whole.

It shows that the snapshot's `workspaces` array is not the sidebar order. The array is creation order: Default, Alpha, Bravo, Charlie, Delta. The sidebar follows `topLevelOrder`, with each group expanded in its own `childOrder`.

| When | What was done | Sidebar order, read from the private instance's window |
| --- | --- | --- |
| Snapshot (sequence 64) | Charlie moved to the top; Delta and Bravo in group Ops | Charlie, Default, Alpha, Ops: Delta, Bravo |
| 66 | `workspace move Alpha --top-level --index 0` | Alpha, Charlie, Default, Ops: Delta, Bravo |
| 67 | `group reorder Ops --order Bravo,Delta` | Alpha, Charlie, Default, Ops: Bravo, Delta |
| 69 | `workspace create --name Echo` | Echo joins the top level |
| 71 | `workspace move Echo --group Ops --index 1` | Alpha, Charlie, Default, Ops: Bravo, Echo, Delta |

The snapshot row and the last row match the window's sidebar text, read through the instance's debug port. The middle rows follow from the commands.

# Collapsed group run

`collapsed-group-run.jsonl` was captured on 14 Oct 2026 by Rail B (issue #11), from the same private instance as the sidebar order run, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 818); line 2 is the only `state.changed` event that followed. Two `daemon.system-stats` lines were left out whole.

- **Snapshot:** the sidebar is Alpha, Charlie, Default, then group Ops (expanded) holding Bravo, Echo and Delta.
- **Sequence 820:** a click on the Ops group header in the window collapsed it. Kelpi sent one `group-upserted` change with `isCollapsed: true`.
- **What the window showed afterwards**, read through the debug port: Alpha ⌘1, Charlie ⌘2, Default ⌘3, then the Ops header with no workspaces under it. The collapsed group's workspaces lost their shortcuts, as Kelpi's `docs/app-state-core.md` section 2.2 says.

# Twelve sessions run

`twelve-sessions-run.jsonl` was captured on 14 Oct 2026 by Rail D (issue #7), from Kelpi's private instance at Kelpi commit `897b5b8`, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 397). Only `state.changed`, `daemon.notification` and `daemon.attention-request` lines are kept, as in the first run. The stream also carried 471 `daemon.system-stats`, 8 `daemon.reveal-pane`, 4 `daemon.graft-orphans` and 3 `plugin.contributions.changed` lines, which were left out whole. No kept line was altered.

Every session is a real `claude -n <name>` in a pane of the instance. Claude there was not logged in, so a prompt never finished a turn. The working and waiting states were therefore driven with Claude's own hook command, `kelpi event start` and `kelpi event stop --agent claude`, run as that pane (its `KELPI_PANE_ID`, against the instance's socket). The instance's daemon produced every event from those calls, exactly as it does when Claude's hooks fire.

- **At the snapshot:** `kelp-tank` in Kelp (green), and `conducting-test` and `rail-a` in Ops (purple) were already running Claude.
- **Then:** seven more workspaces (Harbour, Lighthouse muted, Lagoon, Notes, Garden, Radio, Quiet) and nine more sessions: `kelp-review` (Kelp), `rail-b` (Ops), `wed-15-10-2026` (Harbour), `lighthouse`, `lagoon`, `notes`, `garden`, `radio` and `quiet`.
- **During the run:** sessions went waiting, working and idle; clicks on the tank's waiting `kelp-tank` fish jumped to it, and Kelpi marked it seen. `workspace move Radio --top-level --index 1`, and later `Lagoon` to the same place.
- **The end:** `radio` and `quiet` ran `/exit`, and the `garden` pane was closed.

| Session | Workspace | Creature | Left as |
| --- | --- | --- | --- |
| `kelp-tank` | Kelp | fish | idle |
| `kelp-review` | Kelp | fish | idle |
| `conducting-test` | Ops | conductor | working |
| `rail-a` | Ops | rail | idle |
| `rail-b` | Ops | rail | waiting (relays to its conductor) |
| `wed-15-10-2026` | Harbour | day (turtle) | working |
| `lighthouse` | Lighthouse (muted) | fish | working |
| `lagoon` | Lagoon | fish | idle |
| `notes` | Notes | fish | working |
| `garden`, `radio`, `quiet` | Garden, Radio, Quiet | fish | ended |

The sidebar at the end, read with `workspace list`: Default, Lagoon, Radio, Kelp, Ops, Harbour, Lighthouse, Notes, Garden, Quiet.
