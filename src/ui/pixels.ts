/**
 * The highest pixel ratio the tank draws at. Measured in Kelpi's private instance on 16 Oct 2026
 * (`docs/prd.md` answer 3): at sidebar size a 2x canvas cost about the same CPU as a 1x one.
 */
export const MAX_PIXEL_RATIO = 2;

/** The tank canvas's size in CSS pixels and the pixel ratio it draws at. */
export interface CanvasSize {
    width: number;
    height: number;
    ratio: number;
}

/**
 * The size the canvas should draw at for a box of `clientWidth` x `clientHeight` CSS pixels on a
 * screen of `devicePixelRatio`, or null when that is `current` or the box is too small to draw.
 * The ratio counts as a change on its own: moving the window to a screen of another density keeps
 * the box's size but needs a new drawing buffer.
 */
export function nextCanvas(
    current: CanvasSize,
    clientWidth: number,
    clientHeight: number,
    devicePixelRatio: number,
): CanvasSize | null {
    const width = Math.round(clientWidth);
    const height = Math.round(clientHeight);
    if (width < 2 || height < 2) return null;
    const ratio = Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
    if (width === current.width && height === current.height && ratio === current.ratio)
        return null;
    return { width, height, ratio };
}
