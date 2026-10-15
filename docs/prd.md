# Kelp Tank - PRD, version one

Kelp Tank puts every Claude session in a cute 3D aquarium in Kelpi's sidebar, so Dita sees at a glance which one needs her.
Version one is done when the tank runs in her real Kelpi sidebar, follows her live sessions, and jumps to a session on click.
Decided with Dita on 14 Oct 2026. The approved look is a preview Dita signed off that day.

## Why

Dita runs many Claude sessions across about four workspaces and switches between them as she needs.
Today she has to scan panes to find the one waiting on her.
The tank turns that into something she can spot from the corner of her eye. It should also make work more fun.
It is a hobby build, with no deadline and no Linear tickets.

## What she sees

**The tank** sits in a Kelpi sidebar and fills whatever width the sidebar has, narrow or wide.

- Each workspace with at least one live Claude or Codex session gets its own rock ledge with kelp.
- Ledges zig-zag up the tank. With more workspaces, the ledges share the height down to a minimum (112 px each at normal zoom). Past that, the tank grows taller and Dita scrolls it, so no workspace is cut off and no fish shrinks.
- A workspace with no live session gets no ledge.
- Each workspace's ledge shows its name. Its kelp and fish take the workspace's own Kelpi colour.
- Plain terminal panes are not fish. Workspace groups, such as Operations, do not appear.

**The creatures** come from the session's name, because Kelpi does not record who started a pane.

| Session | How the tank recognises it | Creature |
| --- | --- | --- |
| Daily session | A day name such as `wed-14-10-2026` | Turtle |
| Conductor | A name containing `conduct` | Round pufferfish with a tiny crown |
| A conductor's rail | A name ending in `rail-a`, `rail-b` and so on, with or without a batch prefix such as `lh-deps-1013-` | Very small fish that follow their conductor |
| Anything else | Any other name | Chubby round fish |

All creatures are cute, with big eyes and pink cheeks. A busy ledge is shared, not capped.

**The states**

| Session state | What the creature does |
| --- | --- |
| Working | Swims around its workspace's ledge. |
| Wants Dita | Swims to the glass and taps, glows, and shows a "!" speech bubble above it. |
| Idle | Drifts slowly near the bottom of its ledge. |
| Closed | Swims off the side and disappears. |

- "Finished" and "asking a question" are the same state. Both mean the session is waiting on Dita.
- **A rail never asks Dita directly.** A waiting rail swims to its conductor and nudges it, with no glow or bubble.
- If a rail's conductor has closed, a waiting rail glows like any other fish.
- A muted workspace's fish still go to the glass, but without the glow or bubble.
- The tank makes no sound. Kelpi already sends its own notifications.

**Interaction**

- Hovering a fish shows its session name, workspace and state.
- Clicking a fish jumps to that session. Once Dita is in the session, Kelpi marks it as seen, and the glow stops.
- A pinch or Cmd-scroll zooms in and out around the pointer, up to three times closer. The +, - and fit buttons in the bottom corner do the same, and fit returns to the tank's full width, scrolled to the top. A plain scroll moves through a tall tank and never zooms.
- The menu button in the top corner lists every workspace with a live session, each with a show/hide toggle. A hidden workspace's ledge and fish leave the tank, and stay hidden after a restart.
- When a session in a hidden workspace wants Dita, the menu button shows a glowing dot. A relaying rail or a muted workspace never lights it, as they never glow.

## Not in version one

- Kelp that grows with commits.
- Water that turns murky when CI fails.
- Anything for workspace groups, or a sound.

## How we know it works

- **Automated tests** cover what the tank decides from Kelpi's data. Examples include which creature a name becomes, which workspaces get a ledge, and when a rail relays instead of glowing.
- **The private Kelpi test instance** runs the plugin end to end, without touching Dita's live Kelpi. Kelpi's `docs/plugin-development.md` describes it.
- **A recorded run** of real Kelpi events from that instance becomes a test fixture. Tests then replay it without anyone looking.
- **Dita installs it into her live Kelpi** only at the end, on her go, and checks it against her real sessions.

## Answered questions

Rail A ran these in Kelpi's private test instance on 14 Oct 2026, at Kelpi commit `897b5b8`. The recorded run is `tests/fixtures/private-instance-run.jsonl`, and `tests/fixtures/README.md` says how it was made.

1. **Where does a Claude session's name show up?** In the pane's `title`, with a one-character status prefix and a space: `✳ wed-14-10-2026`. The prefix changes while the session works (`◐ kelp-tank`) and rests on `✳`. The title arrives two events after the session id at start (sequences 177 and 179 in the fixture), and clears one event before the session id at exit (318 and 319). A decider should allow for a pane that briefly has a session but no name, or a name but no session. The pane's `label` is only the name given to the Kelpi pane, not the session. Evidence: `claude -n wed-14-10-2026` in a pane labelled `day` produced `"title": "✳ wed-14-10-2026"` in `pane list --json` and in the recorded `pane-upserted` events.
2. **Does jumping to a session from the tank mark it as seen?** Yes, while Kelpi's window is active. The probe view called `ui.focusPane` on a waiting `rail-a` pane with the window in front. Two seconds later, `rail-a` was `idle` and the untouched `conductor` was still `waitingForInput`. With the window behind another app, the same call moved focus but the pane stayed waiting. It cleared once the window came to the front, matching Kelpi's rule for clicks (agent-lifecycle.md 5.8).
3. **How smooth is the tank with a dozen fish in a narrow sidebar?** A placeholder scene of 12 moving shapes drew 106 frames a second in a 192 px primary sidebar, on a 2x display, with the window in front (one 2-second sample). Kelpi's source sets a 180 px minimum sidebar width (`SidebarResizer.tsx`); that was read, not run. With the window hidden behind other apps, the view draws no frames at all, so the tank costs nothing when nobody is looking.

## What the plan rests on

These come from reading Kelpi's docs and source on 14 Oct 2026, at commit `897b5b8`. Items marked **Run** were proved in the private instance the same day.

- **Run:** A plugin backend hears Kelpi's live events as they happen, through `api.events.on`. The probe backend logged all 53 recorded `state.changed` events, including `agent-status-changed` and `pane-removed`.
- **Run:** Each pane reports `idle`, `running` or `waitingForInput`, plus `agentKind` `claude`. A plain terminal pane reports no agent.
- **Run:** A finished turn sets `waitingForInput`. When a Claude session exits, its session id clears but the pane stays `waitingForInput` until it closes. So a closed session must be read from the missing session id or the closed pane, not from the status. The title clears one event earlier than the id.
- **Run:** A plugin view can focus a pane with `ui.focusPane` (see answer 2).
- **Run:** Each workspace reports its colour and whether it is muted. A muted workspace's `daemon.notification` events still arrive, carrying `muted: true`.
- **Run:** Three.js renders in a plugin pane and sidebar when it is bundled inside the plugin.
