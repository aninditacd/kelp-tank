import { describe, expect, it } from 'vitest';
// The repo has no @/ alias; every test imports from ../../src.
import { DEPTH } from '../../src/ui/layout'; // No @/ alias.
import {
    cameraFor,
    FIT_MARGIN,
    type Frame,
    fitView,
    MAX_ZOOM,
    relayView,
    scrollBy,
    visibleSize,
    type View,
    wheelAction,
    zoomAt,
} from '../../src/ui/view'; // No @/ alias in this repo.

// A 200 x 600 px view over a tank of 12 ledges at the minimum spacing (12 * 0.8 + 0.08 units),
// and the same view over a tank that fits it.
const TALL: Frame = {
    tankWidth: 200 / 140,
    tankHeight: 9.68,
    viewWidth: 200 / 140,
    viewHeight: 600 / 140,
};
const FITS: Frame = { ...TALL, tankHeight: 600 / 140 };
const TAN = Math.tan(Math.PI / 12);

/** The world point on the front glass under a pointer at `ndc`. */
function under(view: View, frame: Frame, ndc: { x: number; y: number }) {
    const seen = visibleSize(frame, view.zoom);
    return { x: view.x + (ndc.x * seen.width) / 2, y: view.y + (ndc.y * seen.height) / 2 };
}

function inside(view: View, frame: Frame) {
    const seen = visibleSize(frame, view.zoom);
    expect(view.y + seen.height / 2).toBeLessThanOrEqual(frame.tankHeight + 1e-9);
    expect(view.y - seen.height / 2).toBeGreaterThanOrEqual(-1e-9);
}

describe('the tank view', () => {
    it("the reset view fits the tank's width and shows its top ledge", () => {
        const tall = fitView(TALL);
        expect(tall.zoom).toBe(1);
        expect(tall.x).toBe(0);
        expect(tall.y + visibleSize(TALL, 1).height / 2).toBeCloseTo(TALL.tankHeight);
        const fits = fitView(FITS);
        expect(fits).toEqual({ zoom: 1, x: 0, y: FITS.tankHeight / 2 });
    });

    it('zooming keeps the point under the pointer still', () => {
        const before = fitView(TALL);
        const ndc = { x: 0.5, y: -0.3 };
        const after = zoomAt(before, TALL, 2, ndc);
        expect(after.zoom).toBe(2);
        const a = under(before, TALL, ndc);
        const b = under(after, TALL, ndc);
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
    });

    it('zoom stays between 1 and the maximum', () => {
        expect(zoomAt(fitView(TALL), TALL, 0.5, { x: 0, y: 0 }).zoom).toBe(1);
        expect(zoomAt(fitView(TALL), TALL, 10, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    });

    it('plain scrolling moves through a tall tank and never zooms', () => {
        const top = fitView(TALL);
        const down = scrollBy(top, TALL, 0, 140);
        expect(down.zoom).toBe(1);
        expect(down.y).toBeCloseTo(top.y - 1);
        const zoomed = zoomAt(top, TALL, 2, { x: 0, y: 0 });
        expect(scrollBy(zoomed, TALL, 0, 140).y).toBeCloseTo(zoomed.y - 0.5);
        for (const dy of [100000, -100000]) {
            const far = scrollBy(top, TALL, 0, dy);
            expect(far.zoom).toBe(1);
            inside(far, TALL);
        }
    });

    it('a pinch or Cmd-scroll zooms and a plain wheel scrolls', () => {
        const wheel = { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: false, metaKey: false };
        expect(wheelAction({ ...wheel, ctrlKey: true }, 600).kind).toBe('zoom');
        expect(wheelAction({ ...wheel, metaKey: true }, 600).kind).toBe('zoom');
        expect(wheelAction(wheel, 600)).toEqual({ kind: 'scroll', dx: 0, dy: -10 });
        expect(wheelAction({ ...wheel, deltaMode: 1, deltaY: 3 }, 600)).toEqual({
            kind: 'scroll',
            dx: 0,
            dy: 48,
        });
        expect(wheelAction({ ...wheel, deltaMode: 2, deltaY: 1 }, 600)).toEqual({
            kind: 'scroll',
            dx: 0,
            dy: 600,
        });
    });

    it('a re-laid tank keeps the same distance from its top in view', () => {
        // The tank first lays out empty, then grows when the live workspaces arrive: the top ledge,
        // Dita's first workspace, must stay in view rather than the old centre.
        const grown = relayView(fitView(FITS), FITS, TALL);
        expect(grown.zoom).toBe(1);
        expect(grown.y + visibleSize(TALL, 1).height / 2).toBeCloseTo(TALL.tankHeight);
        const scrolled = scrollBy(fitView(TALL), TALL, 0, 280);
        const shorter = { ...TALL, tankHeight: TALL.tankHeight - 0.8 };
        expect(relayView(scrolled, TALL, shorter).y).toBeCloseTo(scrolled.y - 0.8);
    });

    it('the camera at zoom 1 shows the tank at 140 pixels a unit', () => {
        const one = cameraFor(fitView(FITS), FITS);
        expect(2 * (one.distance - DEPTH / 2) * TAN).toBeCloseTo(FITS.viewHeight * FIT_MARGIN);
        const two = cameraFor(zoomAt(fitView(FITS), FITS, 2, { x: 0, y: 0 }), FITS);
        expect(2 * (two.distance - DEPTH / 2) * TAN).toBeCloseTo(
            (FITS.viewHeight * FIT_MARGIN) / 2,
        );
    });
});
