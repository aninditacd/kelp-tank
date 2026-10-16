import { readFileSync } from 'node:fs';
import type {
    AgentHookEvent,
    PluginEvent,
    Snapshot,
    SnapshotPane,
    SnapshotWorkspace,
} from '../../src/kelpi-api';

/**
 * The recorded footer run: real Claude Code replies in Kelpi 0.2.19's private instance.
 * `tests/fixtures/README.md` says how it was captured and which lines were driven. Never
 * hand-edit the fixture.
 */
const lines = readFileSync('tests/fixtures/update-footer-run.jsonl', 'utf8').trim().split('\n');
const first = JSON.parse(lines[0]) as Snapshot;

export const footerSnapshot: Snapshot = {
    epoch: first.epoch,
    sequence: first.sequence,
    state: first.state,
};
export const footerEvents: PluginEvent[] = lines
    .slice(1)
    .map((line) => (JSON.parse(line) as { event: PluginEvent }).event);

/** Every `agent.event` of the run, in order, with its sequence. */
export const agentEvents: { sequence: number; event: AgentHookEvent }[] = footerEvents
    .filter((e) => e.name === 'agent.event')
    .map((e) => ({ sequence: e.sequence, event: e.data as AgentHookEvent }));

const panesByLabel = new Map<string, string>();
for (const e of footerEvents) {
    if (e.name !== 'state.changed') continue;
    for (const change of e.data as {
        kind: string;
        pane?: { id: string; label: string | null };
    }[]) {
        if (change.kind === 'pane-upserted' && change.pane?.label) {
            panesByLabel.set(change.pane.label, change.pane.id);
        }
    }
}

export function footerPaneId(label: string): string {
    const id = panesByLabel.get(label);
    if (!id) throw new Error(`no pane labelled ${label} in the footer run`);
    return id;
}

/** The stop of `label`'s pane at `sequence`, from the run. */
export function stopAt(sequence: number): AgentHookEvent {
    const found = agentEvents.find((e) => e.sequence === sequence);
    if (!found || found.event.type !== 'stop') throw new Error(`no stop at ${sequence}`);
    return found.event;
}

/**
 * The raw snapshot Kelpi would give a page opened after `atSequence`: each pane takes the full
 * `pane` object of its latest `pane-upserted`. Built from the fixture's own JSON, not through
 * `applyChanges`, so a bug there cannot hide on both sides of a test.
 */
export function footerSnapshotAt(atSequence: number): Snapshot {
    const workspaces: SnapshotWorkspace[] = structuredClone(footerSnapshot.state.workspaces);
    for (const event of footerEvents) {
        if (event.sequence > atSequence) break;
        if (event.name !== 'state.changed') continue;
        for (const change of event.data as Record<string, unknown>[]) {
            if (change.kind !== 'pane-upserted') continue;
            const pane = change.pane as SnapshotPane;
            const owner = workspaces.find((w) => w.id === change.workspaceID)!;
            const index = owner.panes.findIndex((p) => p.id === pane.id);
            if (index >= 0) owner.panes[index] = pane;
            else owner.panes.push(pane);
        }
    }
    const { topLevelOrder, groups } = footerSnapshot.state;
    return {
        epoch: footerSnapshot.epoch,
        sequence: atSequence,
        state: { workspaces, topLevelOrder, groups },
    };
}
