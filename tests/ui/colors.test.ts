import { describe, expect, it } from 'vitest';
import { kelpTint, workspaceHex } from '../../src/ui/colors';

// Expected values are copied from Kelpi's own table, WORKSPACE_COLOR_HEX (dark column) in
// packages/client/src/chrome/theme.ts at commit 897b5b8, not from colors.ts.
describe('workspace colours', () => {
    it("uses Kelpi's own dark-theme colour for each workspace", () => {
        expect(workspaceHex('purple')).toBe('#A98BE8');
        expect(workspaceHex('green')).toBe('#5FBE89');
        expect(workspaceHex('red')).toBe('#F0655C');
    });

    it("tints each ledge's kelp towards its workspace colour", () => {
        const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
        expect(channel(kelpTint('red'), 0)).toBeGreaterThan(channel(kelpTint('blue'), 0));
        expect(kelpTint('red').toLowerCase()).not.toBe('#3fa66b');
        expect(kelpTint('blue').toLowerCase()).not.toBe('#3fa66b');
    });
});
