import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Snapshot, SnapshotPane } from '../src/kelpi-api';
import {
    applyChanges,
    sidebarOrder,
    visibleWorkspaceOrder,
    worldFromSnapshot,
    type KelpiWorld,
} from '../src/kelpi-world';

function pane(id: string, overrides: Partial<SnapshotPane> = {}): SnapshotPane {
    return {
        id,
        type: 'shell',
        title: null,
        label: null,
        status: 'idle',
        agentKind: 'claude',
        agentSessionID: 'session-' + id,
        ...overrides,
    };
}

const snapshotState: Snapshot['state'] = {
    workspaces: [
        {
            id: 'w1',
            name: 'Kelp',
            color: 'green',
            muted: false,
            panes: [pane('p1')],
            parkedPanes: [pane('p2')],
        },
        {
            id: 'w2',
            name: 'Ops',
            color: 'purple',
            muted: true,
            panes: [pane('p3')],
            parkedPanes: [],
        },
    ],
    topLevelOrder: [
        { kind: 'workspace', id: 'w1' },
        { kind: 'workspace', id: 'w2' },
    ],
    groups: [],
};

function world(): KelpiWorld {
    return worldFromSnapshot(snapshotState);
}

describe('the Kelpi world', () => {
    it('the world reads panes and parked panes from a snapshot', () => {
        expect(world().panes.map((p) => [p.id, p.workspaceId])).toEqual([
            ['p1', 'w1'],
            ['p2', 'w1'],
            ['p3', 'w2'],
        ]);
        expect(world().workspaces).toEqual([
            { id: 'w1', name: 'Kelp', color: 'green', muted: false },
            { id: 'w2', name: 'Ops', color: 'purple', muted: true },
        ]);
    });

    it('pane-upserted adds a new pane and replaces a known one', () => {
        const next = applyChanges(world(), [
            {
                kind: 'pane-upserted',
                workspaceID: 'w1',
                paneID: 'p1',
                pane: pane('p1', { title: '✳ a' }),
            },
            { kind: 'pane-upserted', workspaceID: 'w2', paneID: 'p9', pane: pane('p9') },
        ]);
        expect(next.panes.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p9']);
        expect(next.panes[0].title).toBe('✳ a');
        expect(next.panes[3].workspaceId).toBe('w2');
    });

    it('pane-removed drops the pane', () => {
        const next = applyChanges(world(), [
            { kind: 'pane-removed', workspaceID: 'w1', paneID: 'p1' },
        ]);
        expect(next.panes.map((p) => p.id)).toEqual(['p2', 'p3']);
    });

    it('agent-status-changed updates status, session id and agent kind', () => {
        const next = applyChanges(world(), [
            {
                kind: 'agent-status-changed',
                workspaceID: 'w1',
                paneID: 'p1',
                status: 'waitingForInput',
                agentSessionID: null,
                agentKind: 'codex',
            },
        ]);
        expect(next.panes[0]).toMatchObject({
            status: 'waitingForInput',
            agentSessionId: null,
            agentKind: 'codex',
        });
    });

    it("workspace-upserted updates a workspace's name, colour and muted flag", () => {
        const next = applyChanges(world(), [
            {
                kind: 'workspace-upserted',
                id: 'w1',
                workspace: { id: 'w1', name: 'Kelp 2', color: 'blue', muted: true },
            },
            {
                kind: 'workspace-upserted',
                id: 'w3',
                workspace: { id: 'w3', name: 'New', color: 'red', muted: false },
            },
        ]);
        expect(next.workspaces).toEqual([
            { id: 'w1', name: 'Kelp 2', color: 'blue', muted: true },
            { id: 'w2', name: 'Ops', color: 'purple', muted: true },
            { id: 'w3', name: 'New', color: 'red', muted: false },
        ]);
    });

    it('a workspace-upserted that leaves out fields keeps the known ones', () => {
        const next = applyChanges(world(), [
            { kind: 'workspace-upserted', id: 'w2', workspace: { id: 'w2', name: 'Ops 2' } },
            { kind: 'workspace-upserted', id: 'w4', workspace: { id: 'w4' } },
        ]);
        expect(next.workspaces.slice(1)).toEqual([
            { id: 'w2', name: 'Ops 2', color: 'purple', muted: true },
            { id: 'w4', name: '', color: 'gray', muted: false },
        ]);
    });

    it('workspace-removed drops the workspace and its panes', () => {
        const next = applyChanges(world(), [{ kind: 'workspace-removed', id: 'w1' }]);
        expect(next.workspaces.map((w) => w.id)).toEqual(['w2']);
        expect(next.panes.map((p) => p.id)).toEqual(['p3']);
    });

    it('other change kinds leave the world unchanged', () => {
        const next = applyChanges(world(), [
            { kind: 'layout-changed', workspaceID: 'w1', layout: null },
            { kind: 'focus-changed', workspaceID: 'w1', focusedPaneID: 'p1' },
        ]);
        expect(next).toEqual(world());
    });
});

describe('the sidebar order', () => {
    const lines = readFileSync('tests/fixtures/sidebar-order-run.jsonl', 'utf8').trim().split('\n');
    const snapshot = JSON.parse(lines[0]) as Snapshot;
    const events = lines
        .slice(1)
        .map((line) => (JSON.parse(line) as { event: { data: unknown[] } }).event);
    const names = (world: KelpiWorld) => {
        const byId = new Map(world.workspaces.map((w) => [w.id, w.name]));
        return sidebarOrder(world).map((id: string) => byId.get(id));
    };

    it("the snapshot's workspaces follow Kelpi's sidebar, groups expanded in place", () => {
        expect(snapshot.state.workspaces.map((w) => w.name)).toEqual([
            'Default',
            'Alpha',
            'Bravo',
            'Charlie',
            'Delta',
        ]);
        expect(names(worldFromSnapshot(snapshot.state))).toEqual([
            'Charlie',
            'Default',
            'Alpha',
            'Delta',
            'Bravo',
        ]);
    });

    it('moving and regrouping workspaces updates the sidebar order', () => {
        const world = events.reduce(
            (current, event) => applyChanges(current, event.data),
            worldFromSnapshot(snapshot.state),
        );
        expect(names(world)).toEqual(['Alpha', 'Charlie', 'Default', 'Bravo', 'Echo', 'Delta']);
    });

    it("a removed group's workspaces go last", () => {
        const grouped = applyChanges(world(), [
            {
                kind: 'group-upserted',
                id: 'g',
                group: { id: 'g', childOrder: ['w2'], isCollapsed: false },
            },
            {
                kind: 'order-changed',
                topLevelOrder: [
                    { kind: 'group', id: 'g' },
                    { kind: 'workspace', id: 'w1' },
                ],
            },
        ]);
        expect(sidebarOrder(grouped)).toEqual(['w2', 'w1']);
        expect(sidebarOrder(applyChanges(grouped, [{ kind: 'group-removed', id: 'g' }]))).toEqual([
            'w1',
            'w2',
        ]);
    });

    it('a workspace missing from the sidebar order goes last', () => {
        const next = applyChanges(world(), [
            {
                kind: 'workspace-upserted',
                id: 'w9',
                workspace: { id: 'w9', name: 'New', color: 'red', muted: false },
            },
        ]);
        expect(sidebarOrder(next)).toEqual(['w1', 'w2', 'w9']);
    });
});

describe('the visible order', () => {
    const lines = readFileSync('tests/fixtures/collapsed-group-run.jsonl', 'utf8')
        .trim()
        .split('\n');
    const snapshot = JSON.parse(lines[0]) as Snapshot;
    const collapse = (JSON.parse(lines[1]) as { event: { sequence: number; data: unknown[] } })
        .event;
    const names = (world: KelpiWorld, ids: string[]) => {
        const byId = new Map(world.workspaces.map((w) => [w.id, w.name]));
        return ids.map((id) => byId.get(id));
    };
    const all = ['Alpha', 'Charlie', 'Default', 'Bravo', 'Echo', 'Delta'];

    it("the visible order skips a collapsed group's workspaces", () => {
        expect(collapse.sequence).toBe(820);
        const before = worldFromSnapshot(snapshot.state);
        expect(names(before, visibleWorkspaceOrder(before))).toEqual(all);
        const after = applyChanges(before, collapse.data);
        expect(names(after, visibleWorkspaceOrder(after))).toEqual(['Alpha', 'Charlie', 'Default']);
        expect(names(after, sidebarOrder(after))).toEqual(all);
    });

    it('expanding a collapsed group gives its workspaces back', () => {
        const collapsed = applyChanges(worldFromSnapshot(snapshot.state), collapse.data);
        const change = collapse.data[0] as { group: Record<string, unknown> };
        const expanded = applyChanges(collapsed, [
            { ...change, group: { ...change.group, isCollapsed: false } },
        ]);
        expect(names(expanded, visibleWorkspaceOrder(expanded))).toEqual(all);
    });
});
