import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CI workflow', () => {
    it('CI runs format, lint, typecheck, tests, build and validate on pull requests', () => {
        const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
        expect(workflow).toMatch(/^\s*pull_request:/m);
        for (const step of ['format:check', 'lint', 'typecheck', 'test', 'build', 'validate']) {
            expect(workflow, step).toMatch(new RegExp(`run: pnpm ${step}\\s*$`, 'm'));
        }
    });
});
