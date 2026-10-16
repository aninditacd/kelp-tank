import { describe, expect, it } from 'vitest';
import { glassTap } from '../../src/ui/behaviour'; // No @/ alias in this repo.

/** The ripples drawn over `cycles` tap cycles when frames come every `gapMs` at 0.75 cycles a second. */
function ripplesAt(gapMs: number, cycles = 20): number {
    let lastTap = Number.NaN;
    let count = 0;
    const step = (gapMs / 1000) * 0.75;
    for (let cycle = 0.003; cycle < cycles; cycle += step) {
        const tap = glassTap(cycle);
        if (tap.ripple && tap.key !== lastTap) {
            lastTap = tap.key;
            count++;
        }
    }
    return count;
}

describe('glassTap', () => {
    it('rings once for each of the two taps a cycle at 60 frames a second', () => {
        expect(ripplesAt(1000 / 60)).toBe(40);
    });

    it('still rings for every tap when a 30 fps tank drops a frame and draws 50 ms apart', () => {
        expect(ripplesAt(50)).toBe(40);
    });

    it('rings from the peak of a tap, not on the way in, and never between taps', () => {
        expect(glassTap(0.04).ripple).toBe(false);
        // The peaks are at 0.05 and 0.21 of a cycle.
        expect(glassTap(0.051).ripple).toBe(true);
        expect(glassTap(0.099).ripple).toBe(true);
        expect(glassTap(0.13).ripple).toBe(false);
        expect(glassTap(0.2).ripple).toBe(false);
        expect(glassTap(0.211).ripple).toBe(true);
        expect(glassTap(0.5).bump).toBe(0);
    });

    it('gives the two taps of a cycle, and the next cycle, different keys', () => {
        expect(glassTap(3.05).key).not.toBe(glassTap(3.21).key);
        expect(glassTap(3.05).key).not.toBe(glassTap(4.05).key);
    });
});
