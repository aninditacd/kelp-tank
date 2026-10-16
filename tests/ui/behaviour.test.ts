import { describe, expect, it } from 'vitest';
import {
    type Box,
    bodyChanged,
    decideGoals,
    driftPoint,
    exitPoint,
    followPoint,
    glassSpot,
    isGone,
    nudgePoint,
    speedFor,
    swimPoint,
    TICK_FADE,
    TICK_HOLD,
    updatePose,
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
        const roles: SessionRole[] = ['day', 'conductor', 'rail', 'fish'];
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
