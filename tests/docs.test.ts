import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLAUDE.md', () => {
    it('CLAUDE.md names the real commands and no longer says there is no toolchain', () => {
        const text = readFileSync('CLAUDE.md', 'utf8');
        expect(text).toContain('pnpm check');
        expect(text).toContain('plugin dev dist');
        expect(text.toLowerCase()).not.toContain('no toolchain');
    });
});
