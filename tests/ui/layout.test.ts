import { describe, expect, it } from 'vitest';
import { SIZE } from '../../src/ui/creatures';
import { MIN_LEDGE_SPACING, PX_PER_UNIT, layoutTank } from '../../src/ui/layout';

const WIDTHS = [150, 520];
const HEIGHTS = [300, 1000];
const COUNTS = [1, 2, 3, 4, 5, 6];

describe('layoutTank', () => {
    it('sizes the world at 140 pixels a unit, so the tank fills the view', () => {
        const a = layoutTank(280, 560, 4);
        expect(PX_PER_UNIT).toBe(140);
        expect(a.width).toBeCloseTo(2);
        expect(a.height).toBeCloseTo(4);
        const b = layoutTank(520, 300, 1);
        expect(b.width).toBeCloseTo(520 / 140);
        expect(b.height).toBeCloseTo(300 / 140);
    });

    it('puts the first workspace on the top ledge and zig-zags down', () => {
        const { ledges } = layoutTank(200, 560, 4);
        expect(ledges).toHaveLength(4);
        for (let i = 1; i < ledges.length; i++) {
            expect(ledges[i].y).toBeLessThan(ledges[i - 1].y);
            expect(ledges[i].side).toBe(-ledges[i - 1].side);
        }
        expect(ledges[3].y).toBe(0);
        expect(ledges[0].y).toBeGreaterThan(ledges[1].y);
    });

    it('keeps every ledge inside the tank at 150 and 520 pixels for one to six workspaces', () => {
        for (const w of WIDTHS)
            for (const h of HEIGHTS)
                for (const n of COUNTS) {
                    const t = layoutTank(w, h, n);
                    expect(t.ledges, `${w}x${h} n=${n}`).toHaveLength(n);
                    for (const l of t.ledges) {
                        const ctx = `${w}x${h} n=${n}`;
                        expect(l.rockX0, ctx).toBeGreaterThanOrEqual(-t.width / 2);
                        expect(l.rockX1, ctx).toBeLessThanOrEqual(t.width / 2);
                        expect(l.rockY0, ctx).toBeGreaterThanOrEqual(0);
                        expect(l.rockY1, ctx).toBeLessThanOrEqual(t.height);
                        expect(l.swim.x0, ctx).toBeGreaterThanOrEqual(-t.width / 2);
                        expect(l.swim.x1, ctx).toBeLessThanOrEqual(t.width / 2);
                        expect(l.swim.x0, ctx).toBeLessThan(l.swim.x1);
                        expect(l.swim.y0, ctx).toBeGreaterThanOrEqual(0);
                        expect(l.swim.y1, ctx).toBeLessThanOrEqual(t.height);
                        expect(l.swim.y0, ctx).toBeLessThan(l.swim.y1);
                    }
                }
    });

    it('never lets two ledges overlap', () => {
        for (const w of WIDTHS)
            for (const h of HEIGHTS)
                for (const n of COUNTS) {
                    const { ledges } = layoutTank(w, h, n);
                    expect(ledges, `${w}x${h} n=${n}`).toHaveLength(n);
                    for (let a = 0; a < ledges.length; a++)
                        for (let b = a + 1; b < ledges.length; b++) {
                            const ctx = `${w}x${h} n=${n} ${a}/${b}`;
                            const A = ledges[a];
                            const B = ledges[b];
                            expect(A.rockY0 < B.rockY1 && B.rockY0 < A.rockY1, ctx).toBe(false);
                            expect(A.swim.y0 < B.swim.y1 && B.swim.y0 < A.swim.y1, ctx).toBe(false);
                        }
                }
    });

    it('makes ledges thinner when more than four workspaces have fish', () => {
        const t = (n: number) => layoutTank(200, 800, n).ledges[0].halfThickness;
        expect(t(1)).toBe(t(4));
        expect(t(2)).toBe(t(4));
        expect(t(5)).toBeLessThan(t(4));
        expect(t(6)).toBeLessThan(t(5));
    });

    it('fits ledges down to the minimum height, then grows the tank so it scrolls', () => {
        for (const h of [300, 600, 1000])
            for (let n = 1; n <= 12; n++) {
                const ctx = `200x${h} n=${n}`;
                const t = layoutTank(200, h, n);
                const view = h / PX_PER_UNIT;
                if (n * MIN_LEDGE_SPACING + 0.08 <= view) expect(t.height, ctx).toBeCloseTo(view);
                else expect(t.height, ctx).toBeGreaterThan(view);
                for (let i = 1; i < n; i++) {
                    const gap = t.ledges[i - 1].y - t.ledges[i].y;
                    expect(gap, ctx).toBeGreaterThanOrEqual(MIN_LEDGE_SPACING - 1e-9);
                }
                for (const l of t.ledges) {
                    expect(l.rockY0, ctx).toBeGreaterThanOrEqual(0);
                    expect(l.rockY1, ctx).toBeLessThanOrEqual(t.height);
                    expect(l.swim.y0, ctx).toBeGreaterThanOrEqual(0);
                    expect(l.swim.y1, ctx).toBeLessThanOrEqual(t.height);
                }
            }
    });

    it('every ledge has room for the largest creature', () => {
        // The tank's swim margin is scale * 1.3, and swimPoint keeps margin * 0.6 clear above and
        // below, so a band shorter than this squeezes the conductor.
        const largest = Math.max(...Object.values(SIZE));
        for (const h of [300, 600, 1000])
            for (let n = 1; n <= 12; n++)
                for (const l of layoutTank(200, h, n).ledges)
                    expect(l.swim.y1 - l.swim.y0, `200x${h} n=${n}`).toBeGreaterThanOrEqual(
                        2 * 0.6 * 1.3 * largest,
                    );
    });

    it('lays out no ledges when no workspace has fish', () => {
        const t = layoutTank(200, 800, 0);
        expect(t.ledges).toEqual([]);
        expect(t.width).toBeCloseTo(200 / 140);
    });
});
