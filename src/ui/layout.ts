export const PX_PER_UNIT = 140;
export const DEPTH = 1.2;
/** The closest two ledges get: 112 px at 140 px a unit. Below this the tank scrolls instead. */
export const MIN_LEDGE_SPACING = 0.8;

export interface Ledge {
    side: -1 | 1;
    y: number;
    halfThickness: number;
    rockX0: number;
    rockX1: number;
    rockY0: number;
    rockY1: number;
    swim: { x0: number; x1: number; y0: number; y1: number };
    labelY: number;
    kelpHeight: number;
}

export interface TankLayout {
    width: number;
    height: number;
    ledges: Ledge[];
}

/**
 * Lays the tank out in world units: `PX_PER_UNIT` screen pixels to a unit, as in Dita's approved
 * preview, so a taller view gets more water and the creatures stay the size she approved.
 *
 * `ledges[i]` belongs to `workspaces[i]`. The first workspace gets the top ledge, the last gets
 * the bottom one, which is the sand floor. Ledges alternate sides, the bottom one on the left.
 * Above four workspaces the rocks get thinner. Ledges share the view's height down to
 * `MIN_LEDGE_SPACING`; past that the tank grows taller than the view, and the view scrolls it.
 */
export function layoutTank(widthPx: number, heightPx: number, count: number): TankLayout {
    const width = widthPx / PX_PER_UNIT;
    const view = heightPx / PX_PER_UNIT;
    const ledges: Ledge[] = [];
    if (count <= 0) return { width, height: view, ledges };

    const spacing = Math.max(MIN_LEDGE_SPACING, (view - 0.08) / count);
    const height = Math.max(view, count * spacing + 0.08);
    const halfThickness = count <= 4 ? 0.1 : (0.1 * 4) / count;
    const rockWidth = 2 * Math.min(0.34, width * 0.3);
    for (let i = 0; i < count; i++) {
        const k = count - 1 - i;
        const y = k * spacing;
        const side: -1 | 1 = k % 2 === 0 ? -1 : 1;
        ledges.push({
            side,
            y,
            halfThickness,
            rockX0: side < 0 ? -width / 2 : width / 2 - rockWidth,
            rockX1: side < 0 ? -width / 2 + rockWidth : width / 2,
            rockY0: k === 0 ? 0 : y - halfThickness,
            rockY1: k === 0 ? 2 * halfThickness : y + halfThickness,
            swim: {
                x0: side < 0 ? -width / 2 + 0.06 : -width / 2 + width * 0.2,
                x1: side < 0 ? width / 2 - width * 0.2 : width / 2 - 0.06,
                y0: y + 0.14,
                y1: y + spacing - 0.03,
            },
            labelY: y + spacing - 0.01,
            kelpHeight: Math.min(0.85, spacing * 0.85),
        });
    }
    return { width, height, ledges };
}
