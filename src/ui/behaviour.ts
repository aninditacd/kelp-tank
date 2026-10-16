import type { SessionRole, TankState } from '../tank-state';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface Box {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    z0: number;
    z1: number;
}
export type Goal =
    | { kind: 'swim' }
    | { kind: 'drift' }
    | { kind: 'glass'; alert: boolean }
    | { kind: 'update' }
    | { kind: 'nudge'; leader: string; slot: number }
    | { kind: 'follow'; leader: string; slot: number }
    | { kind: 'leave' };

/** Swim speeds in world units a second, from Dita's approved preview. */
const SPEED: Record<SessionRole, number> = { day: 0.22, conductor: 0.28, rail: 0.4, fish: 0.34 };

/** The most a drifting creature rises above its ledge floor. */
const DRIFT_RISE = 0.12;

/**
 * Decides where each session's creature is heading, keyed by pane id.
 *
 * Relaying is read from `relaysTo` and never worked out here. A wants-you rail whose `relaysTo`
 * names a session that is missing or closed has lost its conductor, so it glows like any fish.
 * Muting lives on the workspace, so a muted workspace's wants-you creature taps the glass with
 * no glow or bubble. Rails attached to one leader, following or nudging, take slots 1, 2, 3 in
 * session order.
 */
export function decideGoals(state: TankState): Map<string, Goal> {
    const goals = new Map<string, Goal>();
    const byPane = new Map(state.sessions.map((s) => [s.paneId, s]));
    const workspaces = new Map(state.workspaces.map((w) => [w.id, w]));
    const slots = new Map<string, number>();
    const nextSlot = (leader: string) => {
        const slot = (slots.get(leader) ?? 0) + 1;
        slots.set(leader, slot);
        return slot;
    };

    for (const s of state.sessions) {
        if (s.state === 'closed') {
            goals.set(s.paneId, { kind: 'leave' });
        } else if (s.state === 'idle') {
            goals.set(s.paneId, { kind: 'drift' });
        } else if (s.state === 'update') {
            goals.set(s.paneId, { kind: 'update' });
        } else if (s.state === 'wantsYou') {
            const leader = s.relaysTo === null ? undefined : byPane.get(s.relaysTo);
            if (leader && leader.state !== 'closed') {
                goals.set(s.paneId, {
                    kind: 'nudge',
                    leader: leader.paneId,
                    slot: nextSlot(leader.paneId),
                });
            } else {
                const muted = workspaces.get(s.workspaceId)?.muted ?? false;
                goals.set(s.paneId, { kind: 'glass', alert: !muted });
            }
        } else {
            const leader =
                s.role === 'rail'
                    ? state.sessions.find(
                          (q) =>
                              q.workspaceId === s.workspaceId &&
                              q.role === 'conductor' &&
                              q.state === 'working',
                      )
                    : undefined;
            goals.set(
                s.paneId,
                leader
                    ? { kind: 'follow', leader: leader.paneId, slot: nextSlot(leader.paneId) }
                    : { kind: 'swim' },
            );
        }
    }
    return goals;
}

export function speedFor(role: SessionRole, goal: Goal): number {
    switch (goal.kind) {
        case 'drift':
            return 0.07;
        case 'swim':
            return SPEED[role];
        case 'glass':
        case 'update':
            return SPEED[role] * 1.5;
        case 'nudge':
            return 0.6;
        case 'follow':
            return 0.55;
        case 'leave':
            return 0.5;
    }
}

/** How long an update creature's tick shows at full strength, then how long it takes to fade. */
export const TICK_HOLD = 3;
export const TICK_FADE = 1.5;

/**
 * Where an update creature is `elapsed` seconds after its update began: at the glass with its
 * tick fading in the last `TICK_FADE` seconds, then resting like an idle creature. It never has
 * a glow or a "!".
 */
export function updatePose(elapsed: number): { at: 'glass' | 'drift'; tick: number } {
    if (elapsed < TICK_HOLD) return { at: 'glass', tick: 1 };
    if (elapsed < TICK_HOLD + TICK_FADE) {
        return { at: 'glass', tick: 1 - (elapsed - TICK_HOLD) / TICK_FADE };
    }
    return { at: 'drift', tick: 0 };
}

/** `a + (b - a) * t`, or the midpoint when the range is inverted (a box smaller than its margins). */
function between(a: number, b: number, t: number): number {
    return a > b ? (a + b) / 2 : a + (b - a) * t;
}

/** A point inside the box, kept `margin` from its side and back walls. */
export function swimPoint(box: Box, margin: number, rand: () => number): Vec3 {
    return {
        x: between(box.x0 + margin, box.x1 - margin, rand()),
        y: between(box.y0 + margin * 0.6, box.y1 - margin * 0.6, rand()),
        z: between(box.z0 + margin, box.z1 - margin, rand()),
    };
}

/** Like `swimPoint`, but never more than `DRIFT_RISE` above the ledge floor. */
export function driftPoint(box: Box, margin: number, rand: () => number): Vec3 {
    const p = swimPoint(box, margin, rand);
    return { ...p, y: box.y0 + rand() * DRIFT_RISE };
}

/** A spot on the front glass, nose just off it, in the lower half of the ledge's area. */
export function glassSpot(
    box: Box,
    margin: number,
    nose: number,
    frontZ: number,
    rand: () => number,
): Vec3 {
    return {
        x: between(box.x0 + margin, box.x1 - margin, rand()),
        y: between(box.y0 + margin, (box.y0 + box.y1) / 2 + 0.1, rand()),
        z: frontZ - nose - 0.035,
    };
}

/** Beside the leader, alternating sides by slot. `wobble` (0 to 0.05) is the nudge itself. */
export function nudgePoint(leader: Vec3, slot: number, wobble: number): Vec3 {
    return {
        x: leader.x + (slot % 2 ? 1 : -1) * (0.14 - wobble),
        y: leader.y + 0.06 * slot - 0.06,
        z: leader.z + 0.12,
    };
}

/** Behind the leader along its `heading`, staggered by slot. */
export function followPoint(leader: Vec3, heading: Vec3, slot: number): Vec3 {
    const back = 0.2 + slot * 0.12;
    return {
        x: leader.x - heading.x * back,
        y: leader.y - heading.y * back + (slot % 2 ? 0.06 : -0.06),
        z: leader.z - heading.z * back + (slot % 2 ? -0.05 : 0.05),
    };
}

/** Straight out past the nearer side wall. It does not depend on the ledge still existing. */
export function exitPoint(pos: Vec3, worldWidth: number): Vec3 {
    const side = pos.x >= 0 ? 1 : -1;
    return { x: side * (worldWidth / 2 + 0.8), y: pos.y, z: pos.z };
}

/** Far enough past a side wall to remove. */
export function isGone(pos: Vec3, worldWidth: number): boolean {
    return Math.abs(pos.x) > worldWidth / 2 + 0.45;
}

/**
 * Whether a creature already in the tank needs a new body: its session's role (title) resolved to
 * something else, or its workspace's colour changed. The mesh, speed and tint are fixed when a
 * creature is built, so a change has to rebuild it.
 */
export function bodyChanged(
    current: { role: SessionRole; colorHex: string },
    next: { role: SessionRole; colorHex: string },
): boolean {
    return current.role !== next.role || current.colorHex !== next.colorHex;
}
