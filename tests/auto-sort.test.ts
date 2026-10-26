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

describe('the order the sidebar should have', () => {
    it('ranks needs you, then working, then update, then idle, then no session', () => {
        const panes = [
            pane('pIdle', 'idle', { status: 'idle' }),
            pane('pNone', 'none', { agentKind: null, agentSessionId: null }),
            pane('pUpdate', 'update'),
            pane('pWorking', 'working', { status: 'running' }),
            pane('pNeeds', 'needs'),
        ];
        const order = ['pinned', 'none', 'idle', 'update', 'working', 'needs'];
        expect(sortTarget(world(order, panes), new Set(['pUpdate']))).toEqual([
            'pinned',
            'needs',
            'working',
            'update',
            'idle',
            'none',
        ]);
    });

    it('keeps the first workspace first, even when it is idle and another needs its owner', () => {
        const panes = [pane('p1', 'vault', { status: 'idle' }), pane('p2', 'b')];
        expect(sortTarget(world(['vault', 'b'], panes), new Set())).toEqual(['vault', 'b']);
    });

    it('ranks a workspace by its most urgent session', () => {
        const panes = [
            pane('p1', 'a', { status: 'running' }),
            pane('p2', 'b'),
            pane('p3', 'b', { status: 'idle' }),
        ];
        expect(sortTarget(world(['pinned', 'a', 'b'], panes), new Set())).toEqual([
            'pinned',
            'b',
            'a',
        ]);
    });

    it('ranks a closed session, with its pane still open, as no session', () => {
        const panes = [
            pane('p1', 'closed', { agentSessionId: null }),
            pane('p2', 'idle', { status: 'idle' }),
        ];
        expect(sortTarget(world(['pinned', 'closed', 'idle'], panes), new Set())).toEqual([
            'pinned',
            'idle',
            'closed',
        ]);
    });

    it('keeps the current order between workspaces of the same rank', () => {
        const panes = [pane('p1', 'c'), pane('p2', 'a'), pane('p3', 'b')];
        expect(sortTarget(world(['pinned', 'c', 'a', 'b'], panes), new Set())).toEqual([
            'pinned',
            'c',
            'a',
            'b',
        ]);
    });

    it('leaves out a nested workspace, which moves with its parent', () => {
        // Kelpi lists a nested workspace in its parent's own child order only.
        const panes = [pane('p1', 'nested')];
        const w = world(['pinned', 'parent', 'nested'], panes, [ws('pinned'), ws('parent')]);
        expect(sortTarget(w, new Set())).toEqual(['pinned', 'parent']);
    });
});

describe('the moves that get it there', () => {
    it('sends nothing when the sidebar is already sorted and flat', () => {
        const panes = [pane('p1', 'b'), pane('p2', 'c', { status: 'idle' })];
        expect(sortMoves(world(['a', 'b', 'c'], panes), new Set())).toEqual([]);
    });

    it('sends nothing for an empty or one-workspace sidebar', () => {
        expect(sortMoves(world([], []), new Set())).toEqual([]);
        expect(sortMoves(world(['a'], [pane('p', 'a')]), new Set())).toEqual([]);
    });

    it('moves a workspace up when its session starts needing its owner', () => {
        const panes = [pane('p1', 'b', { status: 'idle' }), pane('p2', 'c')];
        const start = world(['a', 'b', 'c'], panes);
        const moves = sortMoves(start, new Set());
        expect(moves).toEqual([{ id: 'c', index: 1 }]);
        expect(sidebarOrder(applyMoves(start, moves))).toEqual(['a', 'c', 'b']);
    });

    it('takes every workspace out of its group, collapsed or not, into one sorted list', () => {
        const panes = [
            pane('p1', 'vault', { status: 'idle' }),
            pane('p2', 'x', { status: 'idle' }),
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
        const after = applyMoves(start, sortMoves(start, new Set()));
        const expected = ['vault', 'z', 'y', 'x', 'loose'];
        expect(after.topLevelOrder.slice(0, 5)).toEqual(expected.map(ws));
        expect(after.groups.ops.childOrder).toEqual([]);
        expect(after.groups.queue.childOrder).toEqual([]);
        // Sorted and flat now, so the next run sends nothing.
        expect(sortMoves(after, new Set())).toEqual([]);
    });

    it('never moves a nested workspace', () => {
        const panes = [pane('p1', 'nested'), pane('p2', 'parent', { status: 'idle' })];
        const start = world(['pinned', 'parent', 'nested'], panes, [grp('g')], {
            g: { childOrder: ['pinned', 'parent'], isCollapsed: false },
        });
        const moves = sortMoves(start, new Set());
        expect(moves.map((move) => move.id)).not.toContain('nested');
        expect(moves).toEqual([
            { id: 'pinned', index: 0 },
            { id: 'parent', index: 1 },
        ]);
    });
});
