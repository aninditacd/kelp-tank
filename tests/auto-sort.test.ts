import { describe, expect, it } from 'vitest';
import { sortMoves, sortTarget, type SortMove } from '../src/auto-sort';
import type { SidebarId } from '../src/kelpi-api';
import type { KelpiWorld, WorldPane } from '../src/kelpi-world';
import { sidebarOrder } from '../src/kelpi-world';

const ws = (id: string): SidebarId => ({ kind: 'workspace', id });
const grp = (id: string): SidebarId => ({ kind: 'group', id });

/** A Claude pane in workspace `workspaceId`; waiting for its owner unless told otherwise. */
function pane(id: string, workspaceId: string, overrides: Partial<WorldPane> = {}): WorldPane {
    return {
        id,
        workspaceId,
        label: null,
        title: '✳ fish-' + id,
        status: 'waitingForInput',
        agentKind: 'claude',
        agentSessionId: 'session-' + id,
        agentStartedAt: null,
        ...overrides,
    };
}

function world(
    ids: string[],
    panes: WorldPane[],
    topLevelOrder: SidebarId[] = ids.map(ws),
    groups: KelpiWorld['groups'] = {},
): KelpiWorld {
    return {
        workspaces: ids.map((id) => ({ id, name: id, color: 'blue', muted: false })),
        panes,
        topLevelOrder,
        groups,
        activity: {},
    };
}

/**
 * Applies moves the way Kelpi's `workspace-move` with no group does (its
 * docs/app-state-core.md section 4.8): detach the workspace from the top level or its group,
 * then insert it into the top level at the clamped index.
 */
function applyMoves(start: KelpiWorld, moves: readonly SortMove[]): KelpiWorld {
    let top = [...start.topLevelOrder];
    const groups = structuredClone(start.groups);
    for (const { id, index } of moves) {
        top = top.filter((entry) => !(entry.kind === 'workspace' && entry.id === id));
        for (const group of Object.values(groups)) {
            group.childOrder = group.childOrder.filter((child) => child !== id);
        }
        top.splice(Math.min(Math.max(index, 0), top.length), 0, ws(id));
    }
    return { ...start, topLevelOrder: top, groups };
}

const NONE = { agentKind: null, agentSessionId: null } as const;

describe('the order the sidebar should have', () => {
    it('brings a new session up past the workspaces with none, to just under the last active one', () => {
        // Vault and timekeep have sessions; a kelp session starts at 9, past six without one.
        const ids = ['vault', 'timekeep', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'kelp'];
        const panes = [
            pane('p1', 'vault', { status: 'idle' }),
            pane('p2', 'timekeep', { status: 'running' }),
            ...['n3', 'n4', 'n5', 'n6', 'n7', 'n8'].map((id) => pane('x' + id, id, NONE)),
            pane('p9', 'kelp', { status: 'running' }),
        ];
        expect(sortTarget(world(ids, panes))).toEqual([
            'vault',
            'timekeep',
            'kelp',
            'n3',
            'n4',
            'n5',
            'n6',
            'n7',
            'n8',
        ]);
    });

    it('never reorders workspaces with sessions among themselves, whatever their states', () => {
        // An idle one above a working one above one that needs its owner stays as it is.
        const panes = [
            pane('p1', 'idle', { status: 'idle' }),
            pane('p2', 'working', { status: 'running' }),
            pane('p3', 'needs'),
        ];
        expect(sortTarget(world(['pinned', 'idle', 'working', 'needs'], panes))).toEqual([
            'pinned',
            'idle',
            'working',
            'needs',
        ]);
    });

    it('keeps the first workspace first, even with no session', () => {
        const panes = [pane('p1', 'vault', NONE), pane('p2', 'b')];
        expect(sortTarget(world(['vault', 'a', 'b'], panes))).toEqual(['vault', 'b', 'a']);
    });

    it('counts a closed session, with its pane still open, as no session', () => {
        const panes = [
            pane('p1', 'closed', { agentSessionId: null }),
            pane('p2', 'live', { status: 'idle' }),
        ];
        expect(sortTarget(world(['pinned', 'closed', 'live'], panes))).toEqual([
            'pinned',
            'live',
            'closed',
        ]);
    });

    it('keeps the order among workspaces with no session', () => {
        expect(sortTarget(world(['pinned', 'c', 'a', 'b'], []))).toEqual(['pinned', 'c', 'a', 'b']);
    });

    it('leaves out a nested workspace, which moves with its parent', () => {
        // Kelpi lists a nested workspace in its parent's own child order only.
        const panes = [pane('p1', 'nested')];
        const w = world(['pinned', 'parent', 'nested'], panes, [ws('pinned'), ws('parent')]);
        expect(sortTarget(w)).toEqual(['pinned', 'parent']);
    });
});

describe('the moves that get it there', () => {
    it('sends nothing when every session is already above every workspace without one', () => {
        const panes = [pane('p1', 'b'), pane('p2', 'c', { status: 'idle' }), pane('p3', 'd', NONE)];
        expect(sortMoves(world(['a', 'b', 'c', 'd'], panes))).toEqual([]);
    });

    it('sends nothing for an empty or one-workspace sidebar', () => {
        expect(sortMoves(world([], []))).toEqual([]);
        expect(sortMoves(world(['a'], [pane('p', 'a')]))).toEqual([]);
    });

    it('moves one workspace up when its session starts', () => {
        const start = world(['a', 'b', 'c'], [pane('p1', 'c')]);
        const moves = sortMoves(start);
        expect(moves).toEqual([{ id: 'c', index: 1 }]);
        expect(sidebarOrder(applyMoves(start, moves))).toEqual(['a', 'c', 'b']);
    });

    it('lets a workspace whose session ended fall below the ones still active', () => {
        const panes = [pane('p1', 'a'), pane('p2', 'b', NONE), pane('p3', 'c'), pane('p4', 'd')];
        const start = world(['pinned', 'a', 'b', 'c', 'd'], panes);
        expect(sidebarOrder(applyMoves(start, sortMoves(start)))).toEqual([
            'pinned',
            'a',
            'c',
            'd',
            'b',
        ]);
    });

    it('takes every workspace out of its group, collapsed or not, into one list', () => {
        const panes = [
            pane('p1', 'vault', { status: 'idle' }),
            pane('p2', 'x', NONE),
            pane('p3', 'y', { status: 'running' }),
            pane('p4', 'z'),
        ];
        const start = world(
            ['vault', 'x', 'y', 'z', 'loose'],
            panes,
            [grp('ops'), grp('queue'), ws('loose')],
            {
                ops: { childOrder: ['vault', 'x'], isCollapsed: false },
                queue: { childOrder: ['y', 'z'], isCollapsed: true },
            },
        );
        const after = applyMoves(start, sortMoves(start));
        const expected = ['vault', 'y', 'z', 'x', 'loose'];
        expect(after.topLevelOrder.slice(0, 5)).toEqual(expected.map(ws));
        expect(after.groups.ops.childOrder).toEqual([]);
        expect(after.groups.queue.childOrder).toEqual([]);
        // Flat and in order now, so the next run sends nothing.
        expect(sortMoves(after)).toEqual([]);
    });

    it('never moves a nested workspace', () => {
        const panes = [pane('p1', 'nested'), pane('p2', 'parent', { status: 'idle' })];
        const start = world(['pinned', 'parent', 'nested'], panes, [grp('g')], {
            g: { childOrder: ['pinned', 'parent'], isCollapsed: false },
        });
        const moves = sortMoves(start);
        expect(moves.map((move) => move.id)).not.toContain('nested');
        expect(moves).toEqual([
            { id: 'pinned', index: 0 },
            { id: 'parent', index: 1 },
        ]);
    });
});
