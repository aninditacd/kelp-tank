import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideTank, roleForName, sessionName } from '../src/decide-tank';
import type { KelpiWorld, WorldPane } from '../src/kelpi-world';
import type { TankSession, TankState } from '../src/tank-state';
import {
    paneIdByLabel,
    recordedEvents,
    replayTank,
    workspaceIdByName,
    worldAt,
} from './support/recorded-run';

// Recorded sessions are found by pane id, never by display name: from sequence 318 the `fish`
// pane has no title, so its name falls back to its label.
function session(tank: TankState, label: string): TankSession | undefined {
    const paneId = paneIdByLabel(label);
    return tank.sessions.find((candidate) => candidate.paneId === paneId);
}

function livePane(
    id: string,
    workspaceId: string,
    name: string,
    overrides: Partial<WorldPane> = {},
): WorldPane {
    return {
        id,
        workspaceId,
        label: null,
        title: '✳ ' + name,
        status: 'waitingForInput',
        agentKind: 'claude',
        agentSessionId: 'session-' + id,
        ...overrides,
    };
}

function handBuilt(panes: WorldPane[]): KelpiWorld {
    return {
        workspaces: [
            { id: 'A', name: 'A', color: 'green', muted: false },
            { id: 'B', name: 'B', color: 'blue', muted: false },
        ],
        panes,
        topLevelOrder: [],
        groups: {},
    };
}

describe('roles from session names', () => {
    it('roleForName gives day, conductor, rail and fish', () => {
        expect(roleForName('wed-14-10-2026')).toBe('day');
        expect(roleForName('conducting-kelp-tank')).toBe('conductor');
        expect(roleForName('kelp-conductor')).toBe('conductor');
        expect(roleForName('rail-a')).toBe('rail');
        expect(roleForName('rail-b')).toBe('rail');
        expect(roleForName('wednesday-notes')).toBe('fish');
        expect(roleForName('kelp-tank')).toBe('fish');
    });

    it('a batch-prefixed rail is a rail', () => {
        // Batch-prefixed rail names in the shape issue #16 reported, Kelp Tank's own, and a slug containing "conduct".
        // Compared as one object, so every misread name shows in the diff, not just the first.
        const names = [
            'lh-deps-1013-rail-a',
            'lh-deps-1013-rail-b',
            'lh-deps-1013-rail-c',
            'lh-deps-1013-rail-d',
            'kelp-tank-rail-d',
            'conduct-tools-rail-a',
            'rail-a',
        ];
        expect(Object.fromEntries(names.map((n) => [n, roleForName(n)]))).toEqual(
            Object.fromEntries(names.map((n) => [n, 'rail'])),
        );
    });

    it('a handover rail with a trailing number is a rail', () => {
        // A conductor hands a rail that ran out of context to a fresh session named rail-<x>2, 3 and so on.
        const names = ['rail-r2', 'rail-a3', 'lh-deps-1013-rail-r2', 'lh-deps-1013-rail-b12'];
        expect(Object.fromEntries(names.map((n) => [n, roleForName(n)]))).toEqual(
            Object.fromEntries(names.map((n) => [n, 'rail'])),
        );
    });

    it('a trailing number does not make a non-rail a rail', () => {
        const names = [
            'guardrail-a2',
            'guardrail-r2',
            'rail-ab',
            'rail-ab2',
            'rail-2',
            'rail-r2-notes',
            'trail-b2',
        ];
        expect(Object.fromEntries(names.map((n) => [n, roleForName(n)]))).toEqual(
            Object.fromEntries(names.map((n) => [n, 'fish'])),
        );
    });

    it('a name with rail elsewhere is not a rail', () => {
        const names = [
            'guardrail-tuning',
            'guard-rail-tuning',
            'guardrail-a',
            'rail-a-notes',
            'trail-b',
            'conducting-lighthouse',
        ];
        expect(Object.fromEntries(names.map((n) => [n, roleForName(n)]))).toEqual({
            'guardrail-tuning': 'fish',
            'guard-rail-tuning': 'fish',
            'guardrail-a': 'fish',
            'rail-a-notes': 'fish',
            'trail-b': 'fish',
            'conducting-lighthouse': 'conductor',
        });
    });

    it('a day-like prefix such as wednesday-notes is a fish', () => {
        expect(roleForName('wednesday-notes')).toBe('fish');
        expect(roleForName('wed-14-10-2026')).toBe('day');
    });

    it("sessionName strips Kelpi's status prefix", () => {
        expect(sessionName('✳ wed-14-10-2026')).toBe('wed-14-10-2026');
        expect(sessionName('◐ rail-a')).toBe('rail-a');
        expect(sessionName('kelp-tank')).toBe('kelp-tank');
    });
});

describe('the decider over the recorded run', () => {
    it("the recorded run's sessions get their roles from their titles", () => {
        const tank = replayTank(183);
        const expected: [string, string, string][] = [
            ['day', 'day', 'wed-14-10-2026'],
            ['conductor', 'conductor', 'conducting-kelp-tank'],
            ['rail-a', 'rail', 'rail-a'],
            ['focus-target', 'fish', 'focus-target'],
            ['fish', 'fish', 'kelp-tank'],
        ];
        for (const [label, role, displayName] of expected) {
            expect(session(tank, label), label).toMatchObject({ role, displayName });
        }
    });

    it('a session with no title yet takes its pane label', () => {
        expect(session(replayTank(177), 'fish')).toMatchObject({
            displayName: 'fish',
            role: 'fish',
        });
    });

    it('panes with no agent are never fish', () => {
        const noAgent = new Set([
            paneIdByLabel('shell'),
            paneIdByLabel('Kelp Tank'),
            'F6B579C0-E355-4F9F-BFB2-2ADF42946619', // the Default workspace's unlabelled shell
            'AB7A76B0-C0FD-491C-9F7B-FE6553E6152C', // the probe's plugin pane, added at sequence 265
        ]);
        for (const event of recordedEvents) {
            const paneIds = replayTank(event.sequence).sessions.map((s) => s.paneId);
            expect(
                paneIds.filter((paneId) => noAgent.has(paneId)),
                `at ${event.sequence}`,
            ).toEqual([]);
        }
    });

    it('a workspace gets a ledge only while it has a live fish', () => {
        const kelp = workspaceIdByName('Kelp');
        const ops = workspaceIdByName('Ops');
        expect(replayTank(183).workspaces.map((w) => w.id)).toEqual([kelp, ops]);
        expect(replayTank(319).workspaces.map((w) => w.id)).toEqual([kelp]);
    });

    it("each ledge carries its workspace's colour", () => {
        const colours = Object.fromEntries(
            replayTank(183).workspaces.map((w) => [w.name, w.color]),
        );
        expect(colours).toEqual({ Kelp: 'green', Ops: 'purple' });
    });

    it('Kelpi statuses become working, wantsYou and idle', () => {
        expect(session(replayTank(183), 'day')?.state).toBe('idle');
        expect(session(replayTank(192), 'day')?.state).toBe('working');
        expect(session(replayTank(241), 'day')?.state).toBe('wantsYou');
        expect(session(replayTank(272), 'day')?.state).toBe('idle');
    });

    it('a session whose id cleared is closed', () => {
        expect(session(replayTank(318), 'fish')?.state).toBe('wantsYou');
        expect(session(replayTank(319), 'fish')?.state).toBe('closed');
    });

    it('an ended session stays closed while its pane is open, and goes when the pane closes', () => {
        // The fish pane's session ended at 319 and its pane closed at 328. It was already
        // reported closed, so the pane closing has nothing new to report.
        expect(session(replayTank(327), 'fish')?.state).toBe('closed');
        expect(session(replayTank(328), 'fish')).toBeUndefined();
    });

    it('a waiting rail relays to a live conductor in its workspace', () => {
        const tank = replayTank(253);
        expect(session(tank, 'rail-a')).toMatchObject({
            state: 'wantsYou',
            relaysTo: paneIdByLabel('conductor'),
        });
        expect(session(tank, 'day')?.relaysTo).toBeNull();
    });

    it('each ledge carries its shortcut', () => {
        const byName = (tank: TankState) =>
            Object.fromEntries(tank.workspaces.map((w) => [w.name, w.shortcut]));
        expect(byName(replayTank(183))).toEqual({ Kelp: '⌘2', Ops: '⌘3' });
        const chords = ['⌃1', null, '⌃3', null, null, null, null, null, null];
        expect(byName(decideTank(worldAt(183), null, chords))).toEqual({ Kelp: null, Ops: '⌃3' });
    });

    it("a muted workspace's waiting fish still wants Dita", () => {
        const tank = replayTank(253);
        expect(tank.workspaces.find((w) => w.name === 'Ops')?.muted).toBe(true);
        expect(tank.workspaces.find((w) => w.name === 'Kelp')?.muted).toBe(false);
        expect(session(tank, 'fish')).toMatchObject({ state: 'wantsYou', relaysTo: null });
    });
});

describe('the decider on hand-built worlds', () => {
    it('a live fish whose pane closes is reported closed once, then dropped', () => {
        const previous = decideTank(handBuilt([livePane('p1', 'A', 'kelp-tank')]), null);
        expect(previous.sessions[0].state).toBe('wantsYou');
        const next = decideTank(handBuilt([]), previous);
        expect(next.sessions).toMatchObject([{ paneId: 'p1', state: 'closed', relaysTo: null }]);
        expect(next.workspaces).toEqual([]);
        expect(decideTank(handBuilt([]), next).sessions).toEqual([]);
    });

    it('a session with no title or label takes its agent kind as its name', () => {
        const tank = decideTank(
            handBuilt([livePane('p', 'A', 'x', { title: null, agentKind: 'codex' })]),
            null,
        );
        expect(tank.sessions[0]).toMatchObject({ displayName: 'codex', role: 'fish' });
    });

    it('a waiting prefixed rail relays to its conductor', () => {
        const tank = decideTank(
            handBuilt([
                livePane('c', 'A', 'conducting-lighthouse', { status: 'running' }),
                livePane('r', 'A', 'lh-deps-1013-rail-a'),
            ]),
            null,
        );
        expect(tank.sessions.find((s) => s.paneId === 'r')).toMatchObject({
            role: 'rail',
            state: 'wantsYou',
            relaysTo: 'c',
        });
    });

    it('a waiting handover rail relays to its conductor', () => {
        const tank = decideTank(
            handBuilt([
                livePane('c', 'A', 'conducting-harbour', { status: 'running' }),
                livePane('r', 'A', 'lh-deps-1013-rail-r2'),
            ]),
            null,
        );
        expect(tank.sessions.find((s) => s.paneId === 'r')).toMatchObject({
            role: 'rail',
            state: 'wantsYou',
            relaysTo: 'c',
        });
    });

    it('a waiting rail with no conductor in its workspace relays to nobody', () => {
        const tank = decideTank(handBuilt([livePane('r', 'A', 'rail-b')]), null);
        expect(tank.sessions).toMatchObject([{ role: 'rail', state: 'wantsYou', relaysTo: null }]);
    });

    it('a waiting rail whose conductor closed relays to nobody', () => {
        const tank = decideTank(
            handBuilt([
                livePane('c', 'A', 'conducting-x', { agentSessionId: null }),
                livePane('r', 'A', 'rail-a'),
            ]),
            null,
        );
        expect(tank.sessions.find((s) => s.paneId === 'c')?.state).toBe('closed');
        expect(tank.sessions.find((s) => s.paneId === 'r')?.relaysTo).toBeNull();
    });

    it('a conductor in another workspace does not take the relay', () => {
        const tank = decideTank(
            handBuilt([livePane('c', 'B', 'conducting-x'), livePane('r', 'A', 'rail-a')]),
            null,
        );
        expect(tank.sessions.find((s) => s.paneId === 'r')?.relaysTo).toBeNull();
    });

    it('a working rail relays to nobody', () => {
        const tank = decideTank(
            handBuilt([
                livePane('c', 'A', 'conducting-x'),
                livePane('r', 'A', 'rail-a', { status: 'running' }),
            ]),
            null,
        );
        expect(tank.sessions.find((s) => s.paneId === 'r')).toMatchObject({
            state: 'working',
            relaysTo: null,
        });
    });

    it("ledges follow Kelpi's sidebar order, not the snapshot's", () => {
        const world: KelpiWorld = {
            ...handBuilt([livePane('a', 'A', 'kelp-tank'), livePane('b', 'B', 'other')]),
            topLevelOrder: [{ kind: 'group', id: 'G' }],
            groups: { G: { childOrder: ['B', 'A'], isCollapsed: false } },
        };
        expect(decideTank(world, null).workspaces.map((w) => w.id)).toEqual(['B', 'A']);
    });

    it('the decider never imports the scene', () => {
        for (const file of ['src/decide-tank.ts', 'src/kelpi-world.ts']) {
            const source = readFileSync(file, 'utf8');
            expect(source, file).not.toContain("from 'three'");
            expect(source, file).not.toMatch(/import[^;]*'three'/);
            expect(source, file).not.toContain('/ui/');
        }
    });
});
