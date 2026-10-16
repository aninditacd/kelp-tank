import { readFileSync } from 'node:fs';
// The repo has no `@/` alias; these relative imports match tests/support/recorded-run.ts.
import { EMPTY_BOOK, readBook, type AgentBook } from '../../src/agents';
import type { PluginEvent, Snapshot } from '../../src/kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from '../../src/kelpi-world';

/**
 * The recorded baby fish run: a real Claude Code session running Kelp Tank's real hook in Kelpi
 * 0.2.19's private instance. `tests/fixtures/README.md` says how it was captured. Never hand-edit
 * the fixture.
 */
const lines = readFileSync('tests/fixtures/baby-fish-run.jsonl', 'utf8').trim().split('\n');
const first = JSON.parse(lines[0]) as Snapshot;

export const babySnapshot: Snapshot = {
    epoch: first.epoch,
    sequence: first.sequence,
    state: first.state,
};
export const babyEvents: PluginEvent[] = lines
    .slice(1)
    .map((line) => (JSON.parse(line) as { event: PluginEvent }).event);

/** One `dita.kelp-tank.hook` event's data, as the backend emitted it. */
export interface HookEventData {
    paneID: string;
    workspaceID: string | null;
    event: string;
    sessionId: string;
    agentId: string | null;
    toolName: string | null;
    at: number;
}

export const hookEvents: { sequence: number; data: HookEventData }[] = babyEvents
    .filter((e) => e.name === 'dita.kelp-tank.hook')
    .map((e) => ({ sequence: e.sequence, data: e.data as HookEventData }));

export function babyPaneId(label: string): string {
    const pane = babySnapshot.state.workspaces
        .flatMap((w) => w.panes)
        .find((p) => p.label === label);
    if (!pane) throw new Error(`no pane labelled ${label} in the baby fish run`);
    return pane.id;
}

/** Kelpi's world after every `state.changed` up to `sequence`. */
export function babyWorldAt(sequence: number): KelpiWorld {
    let world = worldFromSnapshot(babySnapshot.state);
    for (const event of babyEvents) {
        if (event.sequence > sequence) break;
        if (event.name === 'state.changed') world = applyChanges(world, event.data as unknown[]);
    }
    return world;
}

/** The book of the last `dita.kelp-tank.agents` event at or before `sequence`. */
export function bookAt(sequence: number): AgentBook {
    const last = babyEvents
        .filter((e) => e.name === 'dita.kelp-tank.agents' && e.sequence <= sequence)
        .at(-1);
    return last ? readBook(last.data) : EMPTY_BOOK;
}

/** The time of the last hook call at or before `sequence`: when the run was at that point. */
export function timeAt(sequence: number): number {
    return hookEvents.filter((h) => h.sequence <= sequence).at(-1)?.data.at ?? 0;
}
