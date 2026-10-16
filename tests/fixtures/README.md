# Recorded run from Kelpi's private instance

Captured once on 14 Oct 2026 by Rail A, from Kelpi's private test instance at Kelpi commit `897b5b8`. It is real data. Never hand-edit it; capture a new run instead. The one exception: on 15 Oct 2026, when the repo went public, every recording here had its home-folder paths and three private workspace names renamed for the public repo, by exact string replacement and nothing else. Paths under the home folder now start `/srv/demo`, and the renamed workspaces are Harbour, Lighthouse and Lagoon, with their sessions and pane labels to match.

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

`sidebar-order-run.jsonl` was captured on 14 Oct 2026 by Rail B, from Kelpi's private instance at Kelpi commit `897b5b8`, with `kelpi plugin watch`. It is real data, kept the same way as the run above: line 1 is the snapshot envelope, and only `state.changed` lines are kept. The stream also carried 3 `daemon.system-stats` lines and 1 `daemon.reveal-pane` line, which were left out whole.

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

`collapsed-group-run.jsonl` was captured on 14 Oct 2026 by Rail B, from the same private instance as the sidebar order run, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 818); line 2 is the only `state.changed` event that followed. Two `daemon.system-stats` lines were left out whole.

- **Snapshot:** the sidebar is Alpha, Charlie, Default, then group Ops (expanded) holding Bravo, Echo and Delta.
- **Sequence 820:** a click on the Ops group header in the window collapsed it. Kelpi sent one `group-upserted` change with `isCollapsed: true`.
- **What the window showed afterwards**, read through the debug port: Alpha ⌘1, Charlie ⌘2, Default ⌘3, then the Ops header with no workspaces under it. The collapsed group's workspaces lost their shortcuts, as Kelpi's `docs/app-state-core.md` section 2.2 says.

# Twelve sessions run

`twelve-sessions-run.jsonl` was captured on 14 Oct 2026 by Rail D, from Kelpi's private instance at Kelpi commit `897b5b8`, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 397). Only `state.changed`, `daemon.notification` and `daemon.attention-request` lines are kept, as in the first run. The stream also carried 471 `daemon.system-stats`, 8 `daemon.reveal-pane`, 4 `daemon.graft-orphans` and 3 `plugin.contributions.changed` lines, which were left out whole. No kept line was altered.

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

# Footer run

`update-footer-run.jsonl` was captured on 16 Oct 2026 by Rail H, from Kelpi's private instance at Kelpi tag `v0.2.19`, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 38). Only `state.changed` and `agent.event` lines are kept, from two watches that were joined (the second began at sequence 309). The stream also carried `daemon.system-stats`, `daemon.notification` and `daemon.attention-request` lines, which were left out whole. Paths were scrubbed by exact string replacement: the scratch folder is `/srv/demo/harbour`, Claude's transcript folder is `/srv/demo/.claude/projects/harbour`, and the home folder is `/srv/demo/home`. No other line was altered.

It feeds the "Awaiting you" footer rule (`src/quiet.ts`). All panes are in one workspace, Harbour, and every reply text is made up: the prompts told Claude exactly what to say.

**What was real Claude Code and what was driven.** Claude Code 2.1.301 is not logged in inside the instance's own panes, so a reply cannot be typed there. Each real reply came from a real `claude -p --model haiku` run in a scratch folder, with `--setting-sources project --settings <scratch file>` and `KELPI_PANE_ID` set to the pane. The scratch settings file ran Kelpi's own hook command (`kelpi event session-start|start|stop|notification|session-end --agent claude`) for Claude's `SessionStart`, `UserPromptSubmit`, `Stop`, `Notification` and `SessionEnd` hooks, against the instance's socket only. The daemon produced every event from that real hook call, and `lastAssistantMessage` is the text of Claude's real final reply.

| Pane label | Stop at | What happened | Real or driven |
| --- | --- | --- | --- |
| `update-fish` | 137, 260 | A reply ending `Awaiting you: 0 - nothing`. At 283 an `idle_prompt` notification follows the second one. | Replies real. The `idle_prompt` was driven. |
| `ask-fish` | 155 | A reply ending `Awaiting you: 2 - a mooring choice and a go`. | Real. |
| `plain-fish` | 170 | A reply with no footer. | Real. |
| `quote-fish` | 183, 204 | 183 is a reply that is only the footer line. 204 quotes the footer on its second line, with a line of prose after it. | Real. |
| `perm-fish` | 221, 237, 274 | 221 and 274 end `Awaiting you: 0`. 237 is a real reply with no footer, from a turn that asked for a `touch` that `claude -p` denied. After 274, a `start` (287) and a `permission_prompt` notification (292). | Replies real. The `start` and the `permission_prompt` were driven. |
| `long-fish` | 301, 318 | 301 is a stop that carried no reply text: its 75 KB stdin timed out in Kelpi's CLI, so the daemon saw a stop without a reply. 318 is a made-up 75 KB reply ending `Awaiting you: 0`, which Kelpi's CLI cut at 64 KiB and marked `lastAssistantMessageTruncated`. | Driven: both came from `kelpi event stop` with Claude-shaped stdin. |

**Why driving is faithful.** Driving runs the same `kelpi event` command Claude's hook runs, with the same stdin keys, into the same daemon, so the `agent.event` the plugin hears is built by the same code. It is driven only where a real turn cannot make the event: `claude -p` denies a tool silently and raises no `permission_prompt`, Claude's `idle_prompt` fires only after a minute of waiting in an interactive session, and a real 64 KiB reply is impractical.

**What the run showed about ordering.** A stop is not always the very next sequence after its pane's status change. Kelpi publishes the status change, then at most a `daemon.notification` and a title update, then the stop; the run's stops follow their status change by one to three sequences, with no other hook event between. `tests/quiet.test.ts` checks that.


# Baby fish run

`baby-fish-run.jsonl` was captured on 16 Oct 2026 by Rail I, from Kelpi's private instance at Kelpi tag `v0.2.19`, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 27). Only `state.changed`, `agent.event`, `dita.kelp-tank.agents` and `dita.kelp-tank.hook` lines are kept. The stream also carried 45 `daemon.system-stats` lines, 1 `daemon.notification` and 1 `daemon.attention-request`, which were left out whole. Paths were scrubbed by exact string replacement: Claude's transcript folder is `/srv/demo/.claude/projects/-srv-demo-harbour`, and the home folder is `/srv/demo/home`. No other line was altered.

It feeds the baby fish (`src/agents.ts`). Everything in it is real: the built plugin was installed in the instance, and a real `claude -p --model haiku` session ran in a scratch folder with `--setting-sources project --settings <scratch file>` and `KELPI_PANE_ID` set to the `harbour-fish` pane in workspace Harbour. The scratch settings ran the README's hook block (`claude-hook/kelp-tank-hook.mjs` for `SubagentStart`, `SubagentStop`, `PreToolUse` and `PostToolUse`, with `"async": true`), plus Kelpi's own `kelpi event` hooks for the session's status, against the instance's socket only.

| Sequence | What happened |
| --- | --- |
| 33-38 | The session starts and its turn begins. |
| 41-43 | Claude launches a background agent (`run_in_background`), told to run `sleep 20` and then `echo`. Its start gives the book one agent. |
| 46-48 | Claude launches a foreground agent, told to run `ls`. The book holds two agents. |
| 49-57 | Both agents run `Bash`. The foreground agent stops (55), leaving one agent. |
| 59-61 | Claude's first reply ends (a `stop` with the pane still `running`) while the background agent still runs. |
| 70-75 | The background agent finishes its tool calls and stops (74). The book is empty. |
| 76-86 | Claude takes a second turn for the finished agent, stops, then the session ends (`session-end`, session id cleared, the pane still open). |

The prompt told Claude not to wait for the background agent, but `claude -p` still waited before it exited. So the run has no session that ends with an agent still running. The test for that case replays the session end with the book from before the background agent's stop.

# Tool activity run

`tool-activity-run.jsonl` was captured on 16 Oct 2026 by Rail J, from Kelpi's private instance at Kelpi tag `v0.2.19`, with `kelpi plugin watch`. Line 1 is the snapshot (sequence 48). Only `state.changed`, `agent.event`, `dita.kelp-tank.hook` and `dita.kelp-tank.agents` lines are kept, up to sequence 171. The stream also carried 74 `daemon.system-stats` lines, 4 `daemon.notification`, 2 `daemon.attention-request` and 1 `daemon.reveal-pane`, which were left out whole. The home folder was scrubbed by exact string replacement to `/srv/demo/home`. No other line was altered.

It feeds what a working creature is doing and the doze (`src/activity.ts`). The built plugin was installed in the instance, with three made-up sessions: `harbour-fish` and `lighthouse-fish` in workspace Harbour, and `lagoon-fish` in workspace Lagoon.

**What was driven.** No real Claude ran. A real Claude Code session would write under the owner's own Claude folder, and `idle_prompt` fires only after a minute of waiting in an interactive session. So each session's status came from Kelpi's own hook command (`kelpi event session-start|start|stop|notification --agent claude`), run as that pane against the instance's socket, with Claude-shaped stdin and a made-up reply. Each tool call came from Kelp Tank's real hook script, `claude-hook/kelp-tank-hook.mjs`, fed Claude-shaped `PreToolUse`, `PostToolUse` or `PostToolUseFailure` JSON on stdin as the `harbour-fish` pane. The script ran the real `kelpi kelp-tank` verb, and the installed backend emitted every `dita.kelp-tank.hook` event, so the plugin heard exactly what a real hook call produces.

| Sequence | What happened |
| --- | --- |
| 50-54 | The three sessions start. |
| 61 | `lighthouse-fish` starts a turn and keeps working to the end. |
| 100-112 | `harbour-fish` and `lagoon-fish` start turns; harbour starts `Read` (106); lagoon stops, waiting (112). |
| 115-124 | Harbour finishes `Read`, then starts `Read` and `Bash` together (116, 117). `Bash` finishes first (121), then `Read` (124). |
| 129 | Claude's `idle_prompt` for the waiting `lagoon-fish`. |
| 131-151 | Harbour runs `Edit`, `WebFetch`, a `Bash` that fails (`PostToolUseFailure`, 145) and `Agent`. |
| 157-164 | Harbour stops, waiting, then gets its own `idle_prompt`. |
| 171 | `lagoon-fish` starts its next turn. |

# Hook payloads

`hook-payloads/` holds one real Claude Code 2.1.301 hook payload per event Kelp Tank's hook handles: `subagent-start.json`, `subagent-stop.json`, `pre-tool-use.json` and `post-tool-use.json`. They come from an earlier run on 16 Oct 2026, of the same kind as the one above, in which two subagents ran in the same private-instance pane. The tool calls are from inside a subagent, so they carry `agent_id`.

Each was changed by hand in only these ways: `cwd`, `transcript_path` and `agent_transcript_path` are scrubbed to `/srv/demo/...`; `tool_input`, `tool_response.stdout`, `last_assistant_message` and the background task's `description` are replaced by made-up text about moorings and tide charts. The hook tests check that none of that text reaches `kelpi`.
