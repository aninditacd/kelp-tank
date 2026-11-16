import { describe, expect, it } from 'vitest';
import { decideTank, roleForName } from '../src/decide-tank';
import type { KelpiWorld, WorldPane } from '../src/kelpi-world';
import { awaitingCount } from '../src/quiet';

/**
 * The daily-flow layout (docs/daily-flow-layout.md): a desk workspace holds three daily sessions,
 * log (`mon-16-11-2026`), comms (`comms-mon-16-11-2026`) and do (`do-mon-16-11-2026`), beside
 * document panes, and a Think workspace holds up to three think sessions named
 * `<work>-<project>-<detail>`. Workspace names here are made up.
 */

function pane(id: string, workspaceId: string, name: string | null): WorldPane {
    return {
        id,
        workspaceId,
        label: name,
        title: name === null ? 'notes.md' : '✳ ' + name,
        status: 'waitingForInput',
        agentKind: name === null ? null : 'claude',
        agentSessionId: name === null ? null : 'session-' + id,
        agentStartedAt: null,
    };
}

const world: KelpiWorld = {
    workspaces: [
        { id: 'desk', name: 'Desk', color: 'red', muted: false },
        { id: 'think', name: 'Think', color: 'green', muted: false },
        { id: 'build', name: 'Lighthouse', color: 'blue', muted: false },
    ],
    panes: [
        pane('log', 'desk', 'mon-16-11-2026'),
        pane('comms', 'desk', 'comms-mon-16-11-2026'),
        pane('do', 'desk', 'do-mon-16-11-2026'),
        pane('doc', 'desk', null),
        pane('t1', 'think', 'brainstorming-cx-rosters'),
        pane('t2', 'think', 'researching-cx-macros'),
        pane('t3', 'think', 'reviewing-cx-categorisation'),
        pane('b1', 'build', 'building-lighthouse-6a'),
    ],
    topLevelOrder: [
        { kind: 'workspace', id: 'desk' },
        { kind: 'workspace', id: 'think' },
        { kind: 'workspace', id: 'build' },
    ],
    groups: {},
    activity: {},
};

describe('the daily-flow layout', () => {
    it('the log, comms and do sessions are all daily turtles', () => {
        expect(roleForName('mon-16-11-2026')).toBe('day');
        expect(roleForName('comms-mon-16-11-2026')).toBe('day');
        expect(roleForName('do-mon-16-11-2026')).toBe('day');
    });

    it('a comms or do prefix without a date, or another prefix, is not a daily session', () => {
        expect(roleForName('comms-notes')).toBe('fish');
        expect(roleForName('do-list')).toBe('fish');
        expect(roleForName('todo-mon-16-11-2026')).toBe('fish');
        expect(roleForName('xcomms-mon-16-11-2026')).toBe('fish');
        expect(roleForName('comms-mon-16-11-2026-old')).toBe('fish');
        expect(roleForName('comms-do-mon-16-11-2026')).toBe('fish');
    });

    it('three daily sessions share one ledge, each its own creature', () => {
        const tank = decideTank(world, null);
        const desk = tank.sessions.filter((s) => s.workspaceId === 'desk');
        expect(desk.map((s) => [s.paneId, s.role])).toEqual([
            ['log', 'day'],
            ['comms', 'day'],
            ['do', 'day'],
        ]);
        expect(tank.workspaces.filter((w) => w.id === 'desk')).toHaveLength(1);
    });

    it('think sessions sit on their own Think ledge with their work creatures', () => {
        const tank = decideTank(world, null);
        expect(tank.workspaces.map((w) => w.name)).toEqual(['Desk', 'Think', 'Lighthouse']);
        const think = tank.sessions.filter((s) => s.workspaceId === 'think');
        expect(think.map((s) => s.role)).toEqual(['brainstorming', 'researching', 'reviewing']);
    });

    it('a daily session whose reply ends Awaiting you: 0 is a quiet update', () => {
        expect(awaitingCount('Done.\n\nAwaiting you: 0 - nothing')).toBe(0);
        expect(awaitingCount('Pick one.\n\nAwaiting you: 1 - a pick')).toBe(1);
        const tank = decideTank(world, null, undefined, new Set(['comms']));
        const state = (id: string) => tank.sessions.find((s) => s.paneId === id)?.state;
        expect(state('comms')).toBe('update');
        expect(state('do')).toBe('wantsYou');
    });
});
