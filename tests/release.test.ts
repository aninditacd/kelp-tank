import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** What a stranger needs to get Kelp Tank: a release with the package, a licence, a README. */
describe('the public release', () => {
    it('a version tag builds the package and attaches it to a release', () => {
        const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
        expect(workflow).toMatch(/^\s*tags:\s*\['v\*'\]\s*$/m);
        expect(workflow).toMatch(/^\s*contents:\s*write\s*$/m);
        // The same Kelpi CLI CI builds, so the package is packed by the version it was tested on.
        expect(workflow).toContain('KELPI_COMMIT: 897b5b8');
        expect(workflow).toMatch(/^\s*- run: pnpm check\s*$/m);
        expect(workflow).toMatch(/^\s*- run: pnpm package\s*$/m);
        expect(workflow).toMatch(/gh release create "\$GITHUB_REF_NAME" kelp-tank\.kelpi-plugin/);
    });

    it('the repo is MIT licensed', () => {
        const licence = readFileSync('LICENSE', 'utf8');
        expect(licence.startsWith('MIT License')).toBe(true);
        expect(licence).toContain('Copyright (c) 2026 aninditacd');
        const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
            license?: string;
            private?: boolean;
        };
        expect(pkg).toMatchObject({ license: 'MIT', private: true });
    });

    it('the README tells a stranger how to install and credits Kelpi', () => {
        const readme = readFileSync('README.md', 'utf8');
        for (const text of [
            'Releases',
            'Settings → Plugins',
            'kelpi plugin install kelp-tank.kelpi-plugin --trust',
            'pnpm package',
            'github.com/benfriebe/kelpi',
            '`src/kelpi-api.ts`',
        ])
            expect(readme, text).toContain(text);
        // The screenshot the README shows must exist.
        const image = /!\[[^\]]*\]\((docs\/screenshots\/[^)]+\.png)\)/.exec(readme);
        expect(image?.[1]).toBe('docs/screenshots/kelp-tank.png');
        expect(existsSync(image![1])).toBe(true);
    });
});
