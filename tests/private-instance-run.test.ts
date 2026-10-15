import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Tests against the recorded run from Kelpi's private instance. The fixture is real
 * captured data; `tests/fixtures/README.md` says how it was made. Never hand-edit it.
 */

interface SnapshotPane {
    id: string;
    label: string | null;
    title: string | null;
    status: string;
    agentKind: string | null;
}
interface Change {
    kind: string;
    paneID?: string;
    status?: string;
    agentSessionID?: string | null;
    pane?: SnapshotPane & { agentSessionID: string | null };
}
interface StreamEvent {
    name: string;
    sequence: number;
    data: Change[] | Record<string, unknown>;
}

const lines = readFileSync('tests/fixtures/private-instance-run.jsonl', 'utf8').trim().split('\n');
const snapshot = JSON.parse(lines[0]) as {
    sequence: number;
    state: { workspaces: { name: string; panes: SnapshotPane[] }[] };
};
const events = lines.slice(1).map((line) => (JSON.parse(line) as { event: StreamEvent }).event);
const changes = events.flatMap((event) =>
    event.name === 'state.changed' ? (event.data as Change[]) : [],
);

const snapshotPanes = snapshot.state.workspaces.flatMap((workspace) => workspace.panes);
function paneIdByLabel(label: string): string {
    const pane = snapshotPanes.find((candidate) => candidate.label === label);
    if (!pane) throw new Error(`no pane labelled ${label} in the snapshot`);
    return pane.id;
}

/** The pane's status after each status change, with repeats collapsed. */
function paneStatusTimeline(paneId: string): string[] {
    const statuses = changes
        .filter((change) => change.kind === 'agent-status-changed' && change.paneID === paneId)
        .map((change) => change.status!);
    return statuses.filter((status, index) => status !== statuses[index - 1]);
}

/** Every title the pane carried during the run. */
function titles(paneId: string): string[] {
    return changes
        .filter((change) => change.kind === 'pane-upserted' && change.pane?.id === paneId)
        .map((change) => change.pane!.title)
        .filter((title): title is string => title !== null);
}

describe('the recorded private-instance run', () => {
    it('the focus-target pane goes running, then waitingForInput, then idle', () => {
        const timeline = paneStatusTimeline(paneIdByLabel('focus-target'));
        const running = timeline.indexOf('running');
        const waiting = timeline.indexOf('waitingForInput', running);
        const idle = timeline.indexOf('idle', waiting);
        expect([running, waiting, idle].every((index) => index >= 0)).toBe(true);
    });

    it('every event arrives after the snapshot, in order', () => {
        const sequences = events.map((event) => event.sequence);
        expect(sequences.length).toBeGreaterThan(0);
        expect(sequences[0]).toBeGreaterThan(snapshot.sequence);
        sequences.slice(1).forEach((sequence, index) => {
            expect(sequence).toBeGreaterThan(sequences[index]);
        });
    });

    it('the run covers a day pane, a conductor, a rail and a plain terminal', () => {
        expect(titles(paneIdByLabel('day'))).toContain('✳ wed-14-10-2026');
        expect(titles(paneIdByLabel('conductor'))).toContain('✳ conducting-kelp-tank');
        expect(titles(paneIdByLabel('rail-a'))).toContain('✳ rail-a');

        const shell = paneIdByLabel('shell');
        const shellAgents = changes
            .filter((change) => change.pane?.id === shell || change.paneID === shell)
            .map((change) => change.pane?.agentKind ?? null);
        expect(shellAgents.every((agent) => agent === null)).toBe(true);
    });

    it("the fish pane's Claude session ended", () => {
        const fish = paneIdByLabel('fish');
        const sessions = changes
            .filter((change) => change.kind === 'agent-status-changed' && change.paneID === fish)
            .map((change) => change.agentSessionID);
        expect(sessions.some((session) => typeof session === 'string')).toBe(true);
        expect(sessions.at(-1)).toBeNull();
    });

    it('the fish pane closed', () => {
        const fish = paneIdByLabel('fish');
        expect(changes).toContainEqual({
            kind: 'pane-removed',
            paneID: fish,
            workspaceID: expect.any(String),
        });
    });

    it('the plugin backend heard every state.changed event the stream recorded', () => {
        const heard = new Set(
            readFileSync('tests/fixtures/private-instance-backend-log.txt', 'utf8')
                .split('\n')
                .map((line) => /^event (\d+) state\.changed\b/.exec(line)?.[1])
                .filter((sequence): sequence is string => sequence !== undefined)
                .map(Number),
        );
        const recorded = events
            .filter((event) => event.name === 'state.changed')
            .map((event) => event.sequence);
        expect(recorded.length).toBeGreaterThan(0);
        expect(recorded.filter((sequence) => !heard.has(sequence))).toEqual([]);
    });
});
