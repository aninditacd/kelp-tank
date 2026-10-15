import { describe, expect, it } from 'vitest';
// The repo has no @/ alias; every test imports from ../../src.
import type { Box, Goal, Vec3 } from '../../src/ui/behaviour'; // No @/ alias.
import {
    entranceFor,
    memoryOf,
    nextSave,
    openingView,
    readMemory,
    type TankSnapshot,
} from '../../src/ui/memory'; // No @/ alias in this repo.
import { clampView, fitView, type Frame, MAX_ZOOM } from '../../src/ui/view'; // No @/ alias.

const BOX: Box = { x0: -1, x1: 1, y0: 0.5, y1: 1.2, z0: -0.45, z1: 0.45 };
const MARGIN = 0.1;
const SWIM: Goal = { kind: 'swim' };
const remembered = (entries: [string, Vec3][]) => new Map(entries);
const AT: Vec3 = { x: 0.3, y: 0.8, z: 0.1 };

// A 280 x 600 px view over a tank taller than it, so scrolling has room.
const FRAME: Frame = { tankWidth: 2, tankHeight: 9.68, viewWidth: 2, viewHeight: 600 / 140 };

function snapshot(fish: [string, Vec3, boolean?][], view = { zoom: 1, x: 0, y: 5 }): TankSnapshot {
    return {
        fish: fish.map(([paneId, pos, leaving]) => ({ paneId, pos, leaving: !!leaving })),
        view,
    };
}

describe('where a creature starts on a new page', () => {
    it('a remembered fish comes back where it was', () => {
        expect(entranceFor('p1', SWIM, true, remembered([['p1', AT]]), BOX, MARGIN)).toEqual({
            kind: 'at',
            pos: AT,
        });
    });

    it('a remembered position outside its ledge is pulled inside it', () => {
        const outside: Vec3 = { x: 3, y: -2, z: 0.9 };
        expect(entranceFor('p1', SWIM, true, remembered([['p1', outside]]), BOX, MARGIN)).toEqual({
            kind: 'at',
            pos: { x: 0.9, y: 0.6, z: 0.35 },
        });
    });

    it('a session the tank has not seen swims in from the side', () => {
        expect(entranceFor('new', SWIM, true, remembered([['p1', AT]]), BOX, MARGIN)).toEqual({
            kind: 'swimIn',
        });
    });

    it('a waiting fish starts at the glass, new or remembered, muted or not', () => {
        const loud: Goal = { kind: 'glass', alert: true };
        const muted: Goal = { kind: 'glass', alert: false };
        const memory = remembered([['p1', AT]]);
        for (const [paneId, goal] of [
            ['p1', loud],
            ['new', loud],
            ['p1', muted],
            ['new', muted],
        ] as const) {
            expect(entranceFor(paneId, goal, true, memory, BOX, MARGIN).kind).toBe('glass');
        }
        expect(entranceFor('new', loud, true, null, BOX, MARGIN).kind).toBe('glass');
    });

    it('a waiting fish starts glowing at full strength, and a muted one does not glow', () => {
        const memory = remembered([]);
        expect(entranceFor('p', { kind: 'glass', alert: true }, true, memory, BOX, MARGIN)).toEqual(
            { kind: 'glass', glow: 1, near: null },
        );
        expect(
            entranceFor('p', { kind: 'glass', alert: false }, true, memory, BOX, MARGIN),
        ).toEqual({ kind: 'glass', glow: 0, near: null });
    });

    it('a remembered waiting fish taps the glass where it was, kept inside its ledge', () => {
        const loud: Goal = { kind: 'glass', alert: true };
        expect(entranceFor('p1', loud, true, remembered([['p1', AT]]), BOX, MARGIN)).toEqual({
            kind: 'glass',
            glow: 1,
            near: AT,
        });
        const outside: Vec3 = { x: 3, y: -2, z: 0.9 };
        expect(entranceFor('p1', loud, true, remembered([['p1', outside]]), BOX, MARGIN)).toEqual({
            kind: 'glass',
            glow: 1,
            near: { x: 0.9, y: 0.6, z: 0.35 },
        });
    });

    it('with nothing remembered, every fish starts on its ledge', () => {
        expect(entranceFor('p1', SWIM, true, null, BOX, MARGIN)).toEqual({ kind: 'inLedge' });
        expect(entranceFor('p1', { kind: 'drift' }, true, null, BOX, MARGIN)).toEqual({
            kind: 'inLedge',
        });
    });

    it('once the tank has shown, a new session swims in even if remembered', () => {
        const memory = remembered([['p1', AT]]);
        expect(entranceFor('p1', SWIM, false, memory, BOX, MARGIN)).toEqual({ kind: 'swimIn' });
        expect(
            entranceFor('p1', { kind: 'glass', alert: true }, false, memory, BOX, MARGIN),
        ).toEqual({ kind: 'swimIn' });
    });
});

describe('reading the memory', () => {
    it('anything that is not saved positions reads as nothing remembered', () => {
        expect(readMemory(null)).toBeNull();
        expect(readMemory(undefined)).toBeNull();
        expect(readMemory([])).toBeNull();
        expect(readMemory({ fish: 'x' })).toBeNull();
        expect(readMemory({ fish: [] })).toBeNull();
        const mixed = readMemory({ fish: { good: [0.1, 0.2, 0.3], bad: [1, 'x', 2], short: [1] } });
        expect(mixed?.fish).toEqual(new Map([['good', { x: 0.1, y: 0.2, z: 0.3 }]]));
        expect(mixed?.view).toBeNull();
        expect(readMemory({ fish: {}, view: [2, 'x', 1] })?.view).toBeNull();
    });
});

describe('saving the memory', () => {
    it("saves each fish's position to two decimals and reads it back", () => {
        const saved = memoryOf(snapshot([['p1', { x: 0.123456, y: 1.987654, z: -0.333333 }]]));
        expect(saved.fish).toEqual({ p1: [0.12, 1.99, -0.33] });
        expect(readMemory(JSON.parse(JSON.stringify(saved)))?.fish).toEqual(
            new Map([['p1', { x: 0.12, y: 1.99, z: -0.33 }]]),
        );
    });

    it('the zoom and scroll are saved and read back', () => {
        const saved = memoryOf(snapshot([], { zoom: 2.3456, x: -0.4321, y: 6.789 }));
        expect(saved.view).toEqual([2.35, -0.43, 6.79]);
        expect(readMemory(JSON.parse(JSON.stringify(saved)))?.view).toEqual({
            zoom: 2.35,
            x: -0.43,
            y: 6.79,
        });
    });

    it('a creature swimming away is not remembered', () => {
        const saved = memoryOf(
            snapshot([
                ['stay', AT],
                ['going', AT, true],
            ]),
        );
        expect(Object.keys(saved.fish)).toEqual(['stay']);
    });

    it('nothing is saved before the tank has shown a state', () => {
        expect(nextSave(null, null)).toBeNull();
        expect(nextSave('{"fish":{"p1":[0,0,0]},"view":[1,0,5]}', null)).toBeNull();
    });

    it('nothing is saved when no fish has moved', () => {
        const first = nextSave(null, snapshot([['p1', AT]]));
        expect(first).not.toBeNull();
        expect(nextSave(first, snapshot([['p1', AT]]))).toBeNull();
        expect(nextSave(first, snapshot([['p1', { ...AT, x: 0.5 }]]))).not.toBeNull();
    });

    it('a pane that has gone from the tank is dropped from memory', () => {
        const both = nextSave(
            null,
            snapshot([
                ['p1', AT],
                ['p2', AT],
            ]),
        );
        const next = nextSave(both, snapshot([['p1', AT]]));
        expect(Object.keys(JSON.parse(next!).fish)).toEqual(['p1']);
    });
});

describe('the view a new page opens at', () => {
    it('the tank reopens at the remembered zoom and scroll', () => {
        const view = { zoom: 2, x: 0.2, y: 4 };
        expect(openingView(view, FRAME)).toEqual(clampView(view, FRAME));
        expect(openingView(view, FRAME)).toEqual(view);
    });

    it('a remembered view beyond the new tank is pulled back inside it', () => {
        const opened = openingView({ zoom: 5, x: 40, y: 4 }, FRAME);
        expect(opened.zoom).toBe(MAX_ZOOM);
        expect(opened.x).toBeLessThan(FRAME.tankWidth / 2);
    });

    it('with no remembered view, the tank opens fitted', () => {
        expect(openingView(null, FRAME)).toEqual(fitView(FRAME));
    });
});
