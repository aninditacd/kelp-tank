import type { Box, Goal, Vec3 } from './behaviour';
import { clampView, fitView, type Frame, type View } from './view';

/**
 * What the tank remembers across pages. Kelpi rebuilds a sidebar view's page on every workspace
 * switch and gives a sidebar no view state, so the tank keeps its creatures' positions and its
 * zoom and scroll in plugin storage instead (issue #15).
 */

/** The plugin storage key: `{ fish: { [paneId]: [x, y, z] }, view: [zoom, x, y] }`. */
export const MEMORY_KEY = 'tankMemory';

export type Remembered = ReadonlyMap<string, Vec3>;

export interface TankMemory {
    fish: Remembered;
    view: View | null;
}

/** What the tank holds now: each creature, and the view. */
export interface TankSnapshot {
    fish: { paneId: string; pos: Vec3; leaving: boolean }[];
    view: View;
}

/** Where a creature starts when it first appears on this page. */
export type Entrance =
    | { kind: 'glass'; glow: number; near: Vec3 | null }
    | { kind: 'at'; pos: Vec3 }
    | { kind: 'inLedge' }
    | { kind: 'swimIn' };

const isTriple = (value: unknown): value is [number, number, number] =>
    Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));

/**
 * Reads the stored memory. Null when nothing usable is stored, which the tank treats as its very
 * first open. Fish entries that are not three numbers are dropped; a bad view reads as none.
 */
export function readMemory(saved: unknown): TankMemory | null {
    if (typeof saved !== 'object' || saved === null) return null;
    const { fish, view } = saved as { fish?: unknown; view?: unknown };
    if (typeof fish !== 'object' || fish === null || Array.isArray(fish)) return null;
    const positions = new Map<string, Vec3>();
    for (const [paneId, at] of Object.entries(fish)) {
        if (isTriple(at)) positions.set(paneId, { x: at[0], y: at[1], z: at[2] });
    }
    return {
        fish: positions,
        view: isTriple(view) ? { zoom: view[0], x: view[1], y: view[2] } : null,
    };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The stored shape for `snapshot`, built from it alone, so a creature that has gone drops out. */
export function memoryOf(snapshot: TankSnapshot): {
    fish: Record<string, [number, number, number]>;
    view: [number, number, number];
} {
    const fish: Record<string, [number, number, number]> = {};
    for (const { paneId, pos, leaving } of snapshot.fish) {
        if (!leaving) fish[paneId] = [round(pos.x), round(pos.y), round(pos.z)];
    }
    const { zoom, x, y } = snapshot.view;
    return { fish, view: [round(zoom), round(x), round(y)] };
}

/**
 * The JSON to store next, or null when there is nothing to store: the tank has not shown a state
 * yet (so an empty page cannot wipe the memory), or nothing changed since `lastWritten`.
 */
export function nextSave(lastWritten: string | null, snapshot: TankSnapshot | null): string | null {
    if (snapshot === null) return null;
    const next = JSON.stringify(memoryOf(snapshot));
    return next === lastWritten ? null : next;
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/**
 * Where a session's creature starts. Once the page has shown a state, a new session swims in.
 * On the first showing, a waiting creature is already at the glass, glowing unless muted; a
 * remembered one is back where it was, kept inside its ledge (a waiting one taps the glass in
 * front of where it was); and with no memory at all every
 * creature starts on its ledge. Only a session the memory has not seen swims in.
 */
export function entranceFor(
    paneId: string,
    goal: Goal,
    firstShow: boolean,
    remembered: Remembered | null,
    box: Box,
    margin: number,
): Entrance {
    if (!firstShow) return { kind: 'swimIn' };
    const at = remembered?.get(paneId);
    const inside = at && {
        x: clamp(at.x, box.x0 + margin, box.x1 - margin),
        y: clamp(at.y, box.y0 + margin, box.y1 - margin),
        z: clamp(at.z, box.z0 + margin, box.z1 - margin),
    };
    if (goal.kind === 'glass')
        return { kind: 'glass', glow: goal.alert ? 1 : 0, near: inside ?? null };
    if (remembered === null) return { kind: 'inLedge' };
    if (!inside) return { kind: 'swimIn' };
    return { kind: 'at', pos: inside };
}

/** The view a new page opens at: the remembered one, kept inside this tank, or the fitted view. */
export function openingView(remembered: View | null, frame: Frame): View {
    return remembered ? clampView(remembered, frame) : fitView(frame);
}
