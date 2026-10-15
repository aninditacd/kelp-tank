import type { WorkspaceColor } from '../kelpi-api';

/**
 * Kelpi's workspace colours, the dark-theme column of `WORKSPACE_COLOR_HEX` in
 * `packages/client/src/chrome/theme.ts` at Kelpi commit 897b5b8. The brighter set reads better
 * in dark water.
 */
const HEX: Record<WorkspaceColor, string> = {
    red: '#F0655C',
    orange: '#E8994A',
    yellow: '#E0C245',
    green: '#5FBE89',
    blue: '#6F9BD8',
    purple: '#A98BE8',
    pink: '#E683B4',
    gray: '#9A9AA0',
    black: '#7A7A82',
    white: '#E6E6EA',
};

const KELP_BASE = '#3fa66b';
const TINT = 0.38;

export function workspaceHex(color: WorkspaceColor): string {
    return HEX[color] ?? HEX.gray;
}

/** The preview's kelp green, mixed 38% towards the workspace colour. */
export function kelpTint(color: WorkspaceColor): string {
    const from = parseInt(KELP_BASE.slice(1), 16);
    const to = parseInt(workspaceHex(color).slice(1), 16);
    const channel = (shift: number) => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * TINT);
    };
    const rgb = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    return '#' + rgb.toString(16).padStart(6, '0');
}
