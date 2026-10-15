import { readFileSync } from 'node:fs';
import { decideTank } from '../../src/decide-tank';
import type { Snapshot, SnapshotPane, SnapshotWorkspace } from '../../src/kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from '../../src/kelpi-world';
import type { TankState } from '../../src/tank-state';

/**
 * The recorded run from Kelpi's private instance (issue #2), loaded for tests.
 * `tests/fixtures/README.md` says how it was captured. Never hand-edit the fixture.
 */

export interface RecordedEvent {
    epoch: string;
    sequence: number;
    name: string;
    data: unknown;
}

const lines = readFileSync('tests/fixtures/private-instance-run.jsonl', 'utf8').trim().split('\n');
const { epoch, sequence, state } = JSON.parse(lines[0]) as Snapshot;

export const recordedSnapshot: Snapshot = { epoch, sequence, state };
export const recordedEvents: RecordedEvent[] = lines
    .slice(1)
    .map((line) => (JSON.parse(line) as { event: RecordedEvent }).event);

export function paneIdByLabel(label: string): string {
    const pane = recordedSnapshot.state.workspaces
        .flatMap((workspace) => workspace.panes)
        .find((candidate) => candidate.label === label);
    if (!pane) throw new Error(`no pane labelled ${label} in the snapshot`);
    return pane.id;
}

export function workspaceIdByName(name: string): string {
    const workspace = recordedSnapshot.state.workspaces.find(
        (candidate) => candidate.name === name,
    );
    if (!workspace) throw new Error(`no workspace named ${name} in the snapshot`);
    return workspace.id;
}

/** The world after every `state.changed` event up to `upToSequence`. */
export function worldAt(upToSequence: number): KelpiWorld {
    let world = worldFromSnapshot(recordedSnapshot.state);
    for (const event of recordedEvents) {
        if (event.sequence > upToSequence) break;
        if (event.name === 'state.changed') world = applyChanges(world, event.data as unknown[]);
    }
    return world;
}

/** The tank after every `state.changed` event up to `upToSequence`, deciding after each one. */
export function replayTank(upToSequence: number): TankState {
    let world = worldFromSnapshot(recordedSnapshot.state);
    let tank = decideTank(world, null);
    for (const event of recordedEvents) {
        if (event.sequence > upToSequence) break;
        if (event.name !== 'state.changed') continue;
        world = applyChanges(world, event.data as unknown[]);
        tank = decideTank(world, tank);
    }
    return tank;
}

/**
 * The raw snapshot Kelpi would have given at `atSequence`, built from the fixture's own JSON and
 * deliberately not through `applyChanges`, so a bug there cannot hide in both sides of a test.
 * Each pane takes the full `pane` object of its latest `pane-upserted`.
 */
export function snapshotAt(atSequence: number, epochOverride = epoch): Snapshot {
    const workspaces: SnapshotWorkspace[] = structuredClone(recordedSnapshot.state.workspaces);
    for (const event of recordedEvents) {
        if (event.sequence > atSequence) break;
        if (event.name !== 'state.changed') continue;
        for (const change of event.data as Record<string, unknown>[]) {
            if (change.kind === 'pane-upserted') {
                const pane = change.pane as SnapshotPane;
                const owner = workspaces.find((w) => w.id === change.workspaceID)!;
                const index = owner.panes.findIndex((p) => p.id === pane.id);
                if (index >= 0) owner.panes[index] = pane;
                else owner.panes.push(pane);
            } else if (change.kind === 'pane-removed') {
                for (const w of workspaces) w.panes = w.panes.filter((p) => p.id !== change.paneID);
            } else if (change.kind === 'workspace-upserted') {
                const from = change.workspace as SnapshotWorkspace;
                const owner = workspaces.find((w) => w.id === change.id)!;
                Object.assign(owner, { name: from.name, color: from.color, muted: from.muted });
            }
        }
    }
    const { topLevelOrder, groups } = recordedSnapshot.state;
    return {
        epoch: epochOverride,
        sequence: atSequence,
        state: { workspaces, topLevelOrder, groups },
    };
}
