import { describe, expect, it } from 'vitest';
import { type CanvasSize, nextCanvas } from '../../src/ui/pixels'; // No @/ alias in this repo.

// A sidebar tank as measured in Kelpi's private instance: 529 x 740 CSS px on a 2x screen.
const retina: CanvasSize = { width: 529, height: 740, ratio: 2 };

describe('nextCanvas', () => {
    it('gives a new size when only the pixel ratio changed', () => {
        // The window moved to a 1x screen: same box, new ratio.
        expect(nextCanvas(retina, 529, 740, 1)).toEqual({ width: 529, height: 740, ratio: 1 });
        expect(nextCanvas({ ...retina, ratio: 1 }, 529, 740, 2)).toEqual(retina);
    });

    it('returns null when nothing changed', () => {
        expect(nextCanvas(retina, 529, 740, 2)).toBeNull();
    });

    it('gives a new size when the box changed, at the current ratio', () => {
        expect(nextCanvas(retina, 600, 740, 2)).toEqual({ width: 600, height: 740, ratio: 2 });
        expect(nextCanvas(retina, 529, 500, 2)).toEqual({ width: 529, height: 500, ratio: 2 });
    });

    it('caps the pixel ratio at 2', () => {
        expect(nextCanvas(retina, 529, 740, 3)).toBeNull();
        expect(nextCanvas({ ...retina, ratio: 1 }, 529, 740, 3)?.ratio).toBe(2);
        expect(nextCanvas(retina, 529, 740, 1.5)?.ratio).toBe(1.5);
    });

    it('counts a missing pixel ratio as 1', () => {
        expect(nextCanvas(retina, 529, 740, 0)?.ratio).toBe(1);
    });

    it('returns null for a box under 2 px, and sizes a 2 px box', () => {
        expect(nextCanvas(retina, 1, 740, 2)).toBeNull();
        expect(nextCanvas(retina, 529, 1, 2)).toBeNull();
        expect(nextCanvas(retina, 2, 740, 2)).toEqual({ width: 2, height: 740, ratio: 2 });
        expect(nextCanvas(retina, 529, 2, 2)).toEqual({ width: 529, height: 2, ratio: 2 });
    });

    it('rounds the box to whole pixels', () => {
        expect(nextCanvas(retina, 529.4, 740.6, 2)).toEqual({ width: 529, height: 741, ratio: 2 });
    });

    it('sizes a canvas that has never been sized', () => {
        expect(nextCanvas({ width: 0, height: 0, ratio: 0 }, 529, 740, 2)).toEqual(retina);
    });
});
