import { describe, expect, it } from 'vitest';
import { FRAME_RATE_CAP, paceFrame } from '../../src/ui/pacing'; // No @/ alias in this repo.

/**
 * Feeds `paceFrame` one second of animation frames from a display refreshing `hz` times a
 * second, each tick nudged by `jitter(i)` ms, and returns the times it drew.
 */
function drawsOver(hz: number, jitter: (i: number) => number = () => 0, seconds = 1): number[] {
    const draws: number[] = [];
    let last: number | null = null;
    for (let i = 0; i < hz * seconds; i++) {
        const now = 1000 + (i * 1000) / hz + jitter(i);
        const pace = paceFrame(now, last);
        if (pace.draw) draws.push(now);
        last = pace.lastDraw;
    }
    return draws;
}

describe('paceFrame', () => {
    it('caps the tank at 30 frames a second', () => {
        expect(FRAME_RATE_CAP).toBe(30);
    });

    it('draws the first frame', () => {
        expect(paceFrame(5000, null)).toEqual({ draw: true, lastDraw: 5000 });
    });

    it('draws every other frame on a 60 Hz display', () => {
        const draws = drawsOver(60);
        expect(draws).toHaveLength(30);
        // Evenly spaced: never two frames in a row, never a gap of three.
        for (let i = 1; i < draws.length; i++)
            expect(draws[i] - draws[i - 1]).toBeCloseTo(1000 / 30, 5);
    });

    it('draws every fourth frame on a 120 Hz display', () => {
        const draws = drawsOver(120);
        expect(draws).toHaveLength(30);
        for (let i = 1; i < draws.length; i++)
            expect(draws[i] - draws[i - 1]).toBeCloseTo(1000 / 30, 5);
    });

    it('keeps 30 frames a second when a 60 Hz display ticks a little early or late', () => {
        // Real vsync times wander by a fraction of a millisecond either way.
        const draws = drawsOver(60, (i) => (i % 2 ? -0.6 : 0.6));
        expect(draws).toHaveLength(30);
    });

    it('draws every frame on a display slower than the cap', () => {
        expect(drawsOver(24)).toHaveLength(24);
    });

    it('skips a frame that comes too soon, and keeps measuring from the last draw', () => {
        expect(paceFrame(1016.7, 1000)).toEqual({ draw: false, lastDraw: 1000 });
    });

    it('draws from nine tenths of the 30 fps interval (30 ms), and skips just before it', () => {
        expect(paceFrame(1030.01, 1000).draw).toBe(true);
        expect(paceFrame(1029.99, 1000).draw).toBe(false);
    });

    it('draws at once after a long pause and does not try to catch up', () => {
        // A hidden window gets no frames; when it shows again the next frame draws, then the
        // pace carries on from that frame rather than drawing a burst for the missed time.
        const back = paceFrame(9000, 1000);
        expect(back).toEqual({ draw: true, lastDraw: 9000 });
        expect(paceFrame(9016.7, back.lastDraw).draw).toBe(false);
    });
});
