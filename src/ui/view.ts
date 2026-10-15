import { DEPTH, PX_PER_UNIT } from './layout';

/** The closest the view zooms in. Zoom 1 is the tank as wide as the view, its approved size. */
export const MAX_ZOOM = 3;
/** The share of extra water shown around the tank at zoom 1, as before zooming existed. */
export const FIT_MARGIN = 1.02;
const HALF_FOV = Math.PI / 12;

/** The tank and the view, in world units at zoom 1 (`PX_PER_UNIT` pixels a unit). */
export interface Frame {
    tankWidth: number;
    tankHeight: number;
    viewWidth: number;
    viewHeight: number;
}

/** How close the view is, and the centre of what it shows on the front glass. */
export interface View {
    zoom: number;
    x: number;
    y: number;
}

export type WheelAction =
    { kind: 'zoom'; factor: number } | { kind: 'scroll'; dx: number; dy: number };

export interface WheelInput {
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    metaKey: boolean;
}

/** The size of the front glass the view shows at `zoom`. */
export function visibleSize(frame: Frame, zoom: number): { width: number; height: number } {
    return {
        width: (frame.viewWidth * FIT_MARGIN) / zoom,
        height: (frame.viewHeight * FIT_MARGIN) / zoom,
    };
}

/** Centres the window on an axis where it is wider than the tank, else keeps it inside. */
function clampAxis(centre: number, seen: number, low: number, high: number): number {
    if (seen >= high - low) return (low + high) / 2;
    return Math.min(high - seen / 2, Math.max(low + seen / 2, centre));
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom));

/** Keeps the zoom between 1 and `MAX_ZOOM`, and the window inside the tank. */
export function clampView(view: View, frame: Frame): View {
    const zoom = clampZoom(view.zoom);
    const seen = visibleSize(frame, zoom);
    return {
        zoom,
        x: clampAxis(view.x, seen.width, -frame.tankWidth / 2, frame.tankWidth / 2),
        y: clampAxis(view.y, seen.height, 0, frame.tankHeight),
    };
}

/**
 * The reset view: zoom 1, the tank as wide as the view, scrolled to the top so the first
 * workspace shows. A tank taller than the view is never shrunk to fit, so its creatures keep
 * their approved size.
 */
export function fitView(frame: Frame): View {
    return clampView({ zoom: 1, x: 0, y: frame.tankHeight }, frame);
}

/**
 * The view after the tank is laid out again (a workspace came or went, or the view resized). It
 * keeps the same distance from the top of the tank, where Dita's first workspace is.
 */
export function relayView(view: View, before: Frame, after: Frame): View {
    return clampView({ ...view, y: after.tankHeight - (before.tankHeight - view.y) }, after);
}

/** Zooms by `factor`, keeping the point under the pointer (`ndc`, -1 to 1) still. */
export function zoomAt(
    view: View,
    frame: Frame,
    factor: number,
    ndc: { x: number; y: number },
): View {
    const before = visibleSize(frame, view.zoom);
    const pointX = view.x + (ndc.x * before.width) / 2;
    const pointY = view.y + (ndc.y * before.height) / 2;
    const zoom = clampZoom(view.zoom * factor);
    const after = visibleSize(frame, zoom);
    return clampView(
        { zoom, x: pointX - (ndc.x * after.width) / 2, y: pointY - (ndc.y * after.height) / 2 },
        frame,
    );
}

/** Scrolls by a wheel's pixels: down the tank for a positive `dyPx`, right for a positive `dxPx`. */
export function scrollBy(view: View, frame: Frame, dxPx: number, dyPx: number): View {
    const unit = PX_PER_UNIT * view.zoom;
    return clampView({ ...view, x: view.x + dxPx / unit, y: view.y - dyPx / unit }, frame);
}

/**
 * A trackpad pinch arrives as a wheel event with `ctrlKey`, and Cmd-scroll carries `metaKey`:
 * both zoom. Every other wheel event scrolls, in pixels.
 */
export function wheelAction(event: WheelInput, pageHeightPx: number): WheelAction {
    if (event.ctrlKey || event.metaKey)
        return { kind: 'zoom', factor: Math.exp(-event.deltaY * 0.01) };
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeightPx : 1;
    return { kind: 'scroll', dx: event.deltaX * scale, dy: event.deltaY * scale };
}

/** Where the camera sits for `view`: straight in front of its centre, at the distance that shows it. */
export function cameraFor(view: View, frame: Frame): { x: number; y: number; distance: number } {
    const seen = visibleSize(frame, view.zoom);
    return { x: view.x, y: view.y, distance: seen.height / 2 / Math.tan(HALF_FOV) + DEPTH / 2 };
}
