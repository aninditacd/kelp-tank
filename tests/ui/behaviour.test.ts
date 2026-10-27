import { describe, expect, it } from 'vitest';
import {
    type Box,
    bodyChanged,
    decideGoals,
    driftPoint,
    exitPoint,
    babyPoint,
    followPoint,
    glassSpot,
    isGone,
    heldActivity,
    isTired,
    nudgePoint,
    restPoint,
    speedFor,
    swimPoint,
    TICK_FADE,
    TICK_HOLD,
    PROP_HOLD_S,
    TIRED_AFTER_MS,
    updatePose,
    MIN_PROP_SCALE,
    propScale,
} from '../../src/ui/behaviour';
import type {
    SessionRole,
    SessionState,
    TankSession,
    TankState,
    TankWorkspace,
} from '../../src/tank-state';

const WS: TankWorkspace = {
    id: 'ws',
    name: 'Lagoon',
    color: 'blue',
    muted: false,
    shortcut: null,
};
const MUTED: TankWorkspace = {
    id: 'quiet',
    name: 'Lighthouse',
    color: 'purple',
    muted: true,
    shortcut: null,
};
const BOX: Box = { x0: -0.5, x1: 0.5, y0: 1, y1: 1.8, z0: -0.45, z1: 0.45 };
const FRONT_Z = 0.6;
const NOSE = 0.144;

function session(
    paneId: string,
    role: SessionRole,
    state: SessionState,
    extra: Partial<TankSession> = {},
): TankSession {
    return {
        paneId,
        workspaceId: 'ws',
        displayName: paneId,
        role,
        state,
        relaysTo: null,
        babies: [],
        activity: null,
        dozing: false,
        workingSince: null,
        ...extra,
    };
}
function makeState(sessions: TankSession[], workspaces = [WS, MUTED]): TankState {
    return { workspaces, sessions };
}
const goalOf = (state: TankState, paneId: string) => decideGoals(state).get(paneId);
const constant = (v: number) => () => v;

describe('decideGoals', () => {
    it('a working session swims, an idle one drifts and a closed one leaves', () => {
        const state = makeState([
            session('w', 'fish', 'working'),
            session('i', 'fish', 'idle'),
            session('c', 'fish', 'closed'),
        ]);
        expect(goalOf(state, 'w')).toEqual({ kind: 'swim' });
        expect(goalOf(state, 'i')).toEqual({ kind: 'drift' });
        expect(goalOf(state, 'c')).toEqual({ kind: 'leave' });
    });

    it('a wants-you creature heads for the front glass with glow and bubble', () => {
        const state = makeState([session('f', 'fish', 'wantsYou')]);
        expect(goalOf(state, 'f')).toEqual({ kind: 'glass', alert: true });
        const spot = glassSpot(BOX, 0.156, NOSE, FRONT_Z, constant(0.5));
        expect(Math.abs(spot.z - (FRONT_Z - NOSE))).toBeLessThan(0.05);
        expect(spot.z).toBeLessThan(FRONT_Z - NOSE);
    });

    it("a muted workspace's wants-you creature goes to the glass without glow or bubble", () => {
        const state = makeState([
            session('quiet-fish', 'fish', 'wantsYou', { workspaceId: 'quiet' }),
            session('loud-fish', 'fish', 'wantsYou'),
        ]);
        expect(goalOf(state, 'quiet-fish')).toEqual({ kind: 'glass', alert: false });
        expect(goalOf(state, 'loud-fish')).toEqual({ kind: 'glass', alert: true });
    });

    it('an update creature heads for the glass with no glow or bubble', () => {
        const state = makeState([session('u', 'fish', 'update')]);
        expect(goalOf(state, 'u')).toEqual({ kind: 'update' });
        expect(speedFor('fish', { kind: 'update' })).toBe(
            speedFor('fish', { kind: 'glass', alert: false }),
        );
    });

    it("an update's tick holds, fades, then the creature rests like an idle one", () => {
        expect(updatePose(0)).toEqual({ at: 'glass', tick: 1 });
        expect(updatePose(TICK_HOLD - 0.1)).toEqual({ at: 'glass', tick: 1 });
        const half = updatePose(TICK_HOLD + TICK_FADE / 2);
        expect(half.at).toBe('glass');
        expect(half.tick).toBeCloseTo(0.5, 5);
        expect(updatePose(TICK_HOLD + TICK_FADE)).toEqual({ at: 'drift', tick: 0 });
        expect(updatePose(60)).toEqual({ at: 'drift', tick: 0 });
        expect(TICK_HOLD).toBe(3);
        expect(TICK_FADE).toBe(1.5);
    });

    it('a relaying rail swims beside its conductor with no glow', () => {
        const state = makeState([
            session('cond', 'conductor', 'working'),
            session('rail', 'rail', 'wantsYou', { relaysTo: 'cond' }),
        ]);
        expect(goalOf(state, 'rail')).toEqual({ kind: 'nudge', leader: 'cond', slot: 1 });
        const leader = { x: 1, y: 2, z: 0 };
        const p = nudgePoint(leader, 1, 0);
        const d = Math.hypot(p.x - leader.x, p.y - leader.y, p.z - leader.z);
        expect(d).toBeGreaterThan(0.05);
        expect(d).toBeLessThan(0.25);
    });

    it('a relaying rail whose conductor has left glows at the glass', () => {
        const gone = makeState([session('rail', 'rail', 'wantsYou', { relaysTo: 'cond' })]);
        expect(goalOf(gone, 'rail')).toEqual({ kind: 'glass', alert: true });
        const closed = makeState([
            session('cond', 'conductor', 'closed'),
            session('rail', 'rail', 'wantsYou', { relaysTo: 'cond' }),
        ]);
        expect(goalOf(closed, 'rail')).toEqual({ kind: 'glass', alert: true });
    });

    it('working rails follow a working conductor in their workspace, not an idle one', () => {
        const rails = [session('r1', 'rail', 'working'), session('r2', 'rail', 'working')];
        const busy = makeState([session('cond', 'conductor', 'working'), ...rails]);
        expect(goalOf(busy, 'r1')).toEqual({ kind: 'follow', leader: 'cond', slot: 1 });
        const resting = makeState([session('cond', 'conductor', 'idle'), ...rails]);
        expect(goalOf(resting, 'r1')).toEqual({ kind: 'swim' });
        const elsewhere = makeState([
            session('cond', 'conductor', 'working', { workspaceId: 'quiet' }),
            ...rails,
        ]);
        expect(goalOf(elsewhere, 'r1')).toEqual({ kind: 'swim' });
    });

    it('rails sharing a conductor take slots one, two and three in session order', () => {
        const state = makeState([
            session('cond', 'conductor', 'working'),
            session('r1', 'rail', 'working'),
            session('r2', 'rail', 'working'),
            session('r3', 'rail', 'working'),
        ]);
        const slots = ['r1', 'r2', 'r3'].map((id) => {
            const g = goalOf(state, id);
            return g && g.kind === 'follow' ? g.slot : -1;
        });
        expect(slots).toEqual([1, 2, 3]);
    });
});

describe('where creatures head', () => {
    it("a working creature's swim point stays inside its own ledge", () => {
        const margin = 0.156;
        for (const r of [0, 0.5, 0.999]) {
            const p = swimPoint(BOX, margin, constant(r));
            expect(p.x).toBeGreaterThanOrEqual(BOX.x0 + margin - 1e-9);
            expect(p.x).toBeLessThanOrEqual(BOX.x1 - margin + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(BOX.y0);
            expect(p.y).toBeLessThanOrEqual(BOX.y1);
            expect(p.z).toBeGreaterThanOrEqual(BOX.z0 + margin - 1e-9);
            expect(p.z).toBeLessThanOrEqual(BOX.z1 - margin + 1e-9);
        }
    });

    it('an idle creature drifts within 0.12 of its ledge floor', () => {
        for (const r of [0, 0.5, 0.999]) {
            const p = driftPoint(BOX, 0.156, constant(r));
            expect(p.y).toBeGreaterThanOrEqual(BOX.y0);
            expect(p.y).toBeLessThanOrEqual(BOX.y0 + 0.12 + 1e-9);
        }
        expect(driftPoint(BOX, 0.156, constant(0.999)).y).toBeLessThan(
            swimPoint(BOX, 0.156, constant(0.999)).y,
        );
    });

    it('an idle creature drifts slower than any working one', () => {
        const roles: SessionRole[] = [
            'day',
            'conductor',
            'rail',
            'fish',
            'brainstorming',
            'building',
            'researching',
            'reviewing',
        ];
        for (const role of roles) {
            expect(speedFor(role, { kind: 'drift' })).toBeGreaterThan(0);
            expect(speedFor(role, { kind: 'drift' })).toBeLessThan(
                speedFor(role, { kind: 'swim' }),
            );
        }
    });

    it('a closed creature heads past the nearer wall and is gone beyond it', () => {
        const W = 1.4;
        const right = exitPoint({ x: 0.2, y: 1, z: 0 }, W);
        const left = exitPoint({ x: -0.2, y: 1, z: 0 }, W);
        expect(right.x).toBeGreaterThan(W / 2);
        expect(left.x).toBeLessThan(-W / 2);
        expect(isGone({ x: W / 2, y: 1, z: 0 }, W)).toBe(false);
        expect(isGone({ x: W / 2 + 0.44, y: 1, z: 0 }, W)).toBe(false);
        expect(isGone({ x: W / 2 + 0.46, y: 1, z: 0 }, W)).toBe(true);
        expect(isGone({ x: -W / 2 - 0.46, y: 1, z: 0 }, W)).toBe(true);
    });

    it('a following rail trails behind its conductor', () => {
        const leader = { x: 1, y: 2, z: 0 };
        const p = followPoint(leader, { x: 1, y: 0, z: 0 }, 1);
        expect(p.x).toBeLessThan(leader.x);
        expect(Math.hypot(p.x - leader.x, p.y - leader.y, p.z - leader.z)).toBeLessThan(0.5);
    });
});

describe('bodyChanged', () => {
    it('a creature needs a new body when its role or its workspace colour changes', () => {
        const fish = { role: 'fish' as const, colorHex: '#5FBE89' };
        expect(bodyChanged(fish, { ...fish })).toBe(false);
        expect(bodyChanged(fish, { ...fish, role: 'rail' })).toBe(true);
        expect(bodyChanged(fish, { ...fish, colorHex: '#A98BE8' })).toBe(true);
    });
});

describe('babyPoint', () => {
    it('baby fish keep close to their parent and do not overlap', () => {
        const parent = { x: 1, y: 2, z: 0.1 };
        for (const heading of [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0.6, y: 0, z: -0.8 },
        ]) {
            for (const t of [0, 0.4, 7.3]) {
                const spots = [0, 1, 2, 3, 4, 5].map((i) => babyPoint(parent, heading, i, t));
                for (const [i, p] of spots.entries()) {
                    const d = { x: p.x - parent.x, y: p.y - parent.y, z: p.z - parent.z };
                    expect(Math.hypot(d.x, d.y, d.z), `baby ${i}`).toBeLessThan(0.5);
                    // Beside and behind: never ahead of the parent's nose.
                    expect(d.x * heading.x + d.y * heading.y + d.z * heading.z).toBeLessThan(0);
                    for (const q of spots.slice(i + 1)) {
                        const gap = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
                        expect(gap, `babies ${i} and a later one`).toBeGreaterThan(0.08);
                    }
                }
            }
        }
    });
});

describe('tired and dozing', () => {
    const NOW = 50_000_000;
    const working = (startedMsAgo: number | null, role: SessionRole = 'fish') =>
        session('p1', role, 'working', {
            workingSince: startedMsAgo === null ? null : NOW - startedMsAgo,
        });

    it('the tired threshold is ten minutes', () => {
        expect(TIRED_AFTER_MS).toBe(600_000);
    });

    it('a session is tired from exactly ten minutes, never before', () => {
        expect(isTired(working(600_000), NOW)).toBe(true);
        expect(isTired(working(599_999), NOW)).toBe(false);
        expect(isTired(working(45 * 60_000), NOW)).toBe(true);
    });

    it('a session with no start time is never tired', () => {
        expect(isTired(working(null), NOW)).toBe(false);
    });

    it('a session that is not working is never tired', () => {
        const idle = session('p1', 'fish', 'idle', { workingSince: NOW - 30 * 60_000 });
        expect(isTired(idle, NOW)).toBe(false);
    });

    it('a wants-you or update session is never tired, however long ago its turn began', () => {
        for (const state of ['wantsYou', 'update'] as const) {
            const waiting = session('p1', 'fish', state, { workingSince: NOW - 30 * 60_000 });
            expect(isTired(waiting, NOW), state).toBe(false);
        }
    });

    it('a rail is never tired', () => {
        expect(isTired(working(30 * 60_000, 'rail'), NOW)).toBe(false);
        expect(isTired(working(30 * 60_000, 'conductor'), NOW)).toBe(true);
    });

    it('dozing changes no goal: a dozing wants-you creature keeps its glass alert', () => {
        for (const dozing of [false, true]) {
            const goals = decideGoals(makeState([session('p1', 'fish', 'wantsYou', { dozing })]));
            expect(goals.get('p1'), `dozing ${dozing}`).toEqual({ kind: 'glass', alert: true });
        }
    });

    it('dozing changes no goal: a dozing update creature keeps its update goal', () => {
        for (const dozing of [false, true]) {
            const goals = decideGoals(makeState([session('p1', 'fish', 'update', { dozing })]));
            expect(goals.get('p1'), `dozing ${dozing}`).toEqual({ kind: 'update' });
        }
    });

    describe('restPoint', () => {
        const box: Box = { x0: -1, x1: 1, y0: 0.5, y1: 1.5, z0: -0.5, z1: 0.5 };

        it('rests on its own ledge floor, never below it, even from under the tank floor', () => {
            expect(restPoint(box, 0.1, { x: 0.2, y: -3, z: 0.1 })).toEqual({
                x: 0.2,
                y: 0.5,
                z: 0.1,
            });
            expect(restPoint(box, 0.1, { x: 0.2, y: 1.4, z: 0.1 }).y).toBe(0.5);
        });

        it('keeps the resting spot inside the side margins', () => {
            expect(restPoint(box, 0.1, { x: 5, y: 1, z: 0 }).x).toBeCloseTo(0.9);
            expect(restPoint(box, 0.1, { x: -5, y: 1, z: 0 }).x).toBeCloseTo(-0.9);
        });
    });
});

describe('heldActivity', () => {
    it('a new activity shows at once and holds for one second', () => {
        expect(PROP_HOLD_S).toBe(1);
        expect(heldActivity({ activity: 'read', until: 0 }, 'command', 10)).toEqual({
            activity: 'command',
            until: 11,
        });
    });

    it('a finished tool keeps its prop until the hold runs out, then drops it', () => {
        const shown = { activity: 'edit' as const, until: 11 };
        expect(heldActivity(shown, null, 10.9)).toBe(shown);
        expect(heldActivity(shown, null, 11)).toEqual({ activity: null, until: 11 });
    });

    it('nothing shown and nothing running stays empty', () => {
        expect(heldActivity({ activity: null, until: 0 }, null, 5)).toEqual({
            activity: null,
            until: 0,
        });
    });
});

describe('prop size on small fish', () => {
    // Creature sizes from src/ui/creatures.ts: fish 0.12, rail 0.055, a baby two thirds of a rail.
    const FISH = 0.12;
    const RAIL = 0.055;
    const BABY = RAIL * 0.67;

    it("propScale keeps a fish's size and raises a rail's and a baby's to the floor", () => {
        expect(propScale(FISH)).toBe(FISH);
        expect(propScale(0.17)).toBe(0.17);
        expect(propScale(RAIL)).toBe(MIN_PROP_SCALE);
        expect(propScale(BABY)).toBe(MIN_PROP_SCALE);
        expect(propScale(MIN_PROP_SCALE)).toBe(MIN_PROP_SCALE);
    });

    it("MIN_PROP_SCALE sits between a rail's size and a fish's", () => {
        expect(MIN_PROP_SCALE).toBeGreaterThan(RAIL);
        expect(MIN_PROP_SCALE).toBeLessThan(FISH);
    });
});
