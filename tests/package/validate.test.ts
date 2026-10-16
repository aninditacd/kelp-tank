import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildToTemp } from './build-to-temp';

describe('the built package', () => {
    let outdir: string;
    beforeAll(() => {
        outdir = buildToTemp();
    });

    it('kelpi plugin validate accepts the built package and lists its entries', () => {
        const run = spawnSync(process.execPath, ['scripts/validate.mjs', outdir], {
            encoding: 'utf8',
        });
        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
        const report = JSON.parse(run.stdout) as { pluginID: string; files: { path: string }[] };
        expect(report.pluginID).toBe('dita.kelp-tank');
        expect(report.files.map((file) => file.path).sort()).toEqual([
            'backend.mjs',
            'kelpi.plugin.json',
            'ui/app.js',
            'ui/index.html',
        ]);
    });

    it("the built manifest keeps the scaffold's view and command ids", () => {
        const manifest = JSON.parse(
            readFileSync(path.join(outdir, 'kelpi.plugin.json'), 'utf8'),
        ) as {
            id: string;
            backend: string;
            contributes: {
                views: { id: string; entry: string; placements: string[]; stateVersion: number }[];
                commands: { id: string }[];
            };
        };
        expect(manifest.id).toBe('dita.kelp-tank');
        expect(manifest.backend).toBe('backend.mjs');
        expect(manifest.contributes.views).toEqual([
            expect.objectContaining({
                id: 'dita.kelp-tank.home',
                entry: 'ui/index.html',
                placements: ['pane', 'sidebar.primary', 'sidebar.secondary'],
                stateVersion: 1,
            }),
        ]);
        expect(manifest.contributes.commands.map((command) => command.id)).toEqual([
            'dita.kelp-tank.summary',
            'dita.kelp-tank.quiet',
        ]);
    });
});

describe('scripts/validate.mjs', () => {
    it('the validate script fails loudly when the Kelpi CLI is missing', () => {
        const run = spawnSync(process.execPath, ['scripts/validate.mjs', 'dist'], {
            encoding: 'utf8',
            env: { ...process.env, KELPI_CLI: '/nonexistent/kelpi.js' },
        });
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('/nonexistent/kelpi.js');
    });
});
