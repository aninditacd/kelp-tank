/**
 * The most frames a second the tank draws, whatever the display's refresh rate. Measured in
 * Kelpi's private instance on 16 Oct 2026: the tank drew every display frame (60 a second on a
 * 60 Hz screen, 120 on a 120 Hz one), and that roughly doubled Kelpi's CPU while it was visible.
 */
export const FRAME_RATE_CAP = 30;

/**
 * A frame draws once this share of the cap's interval has passed. Frame times wander by a
 * fraction of a millisecond, so waiting for the whole interval would sometimes miss a frame on
 * a 60 Hz display and fall to 20 frames a second.
 */
const EARLY = 0.9;

/** Whether this animation frame draws, and the time the next decision measures from. */
export interface Pace {
    draw: boolean;
    lastDraw: number;
}

/**
 * Decides, at each animation frame, whether the tank draws. `now` and `lastDraw` are
 * `requestAnimationFrame` times in milliseconds; `lastDraw` is null before the first draw.
 * After a long pause (a hidden window gets no frames) it draws at once and never catches up.
 */
export function paceFrame(now: number, lastDraw: number | null, cap = FRAME_RATE_CAP): Pace {
    if (lastDraw !== null && now - lastDraw < (1000 / cap) * EARLY)
        return { draw: false, lastDraw };
    return { draw: true, lastDraw: now };
}
