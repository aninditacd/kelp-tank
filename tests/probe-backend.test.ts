import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('probe backend', () => {
    it('the probe backend listens for pushed events and never polls', () => {
        const source = readFileSync('probes/tank-probe/src/backend.ts', 'utf8');
        expect(source).toContain("events.on('*'");
        for (const polling of ['setInterval', 'setTimeout', 'workspaces.list', 'panes.list']) {
            expect(source, polling).not.toContain(polling);
        }
    });
});
