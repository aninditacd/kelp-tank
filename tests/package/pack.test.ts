import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildToTemp } from './build-to-temp';

/** Runs `scripts/package.mjs <dist> --out <file>`, the second half of `pnpm package`. */
function pack(dist: string, out: string) {
    return spawnSync(process.execPath, ['scripts/package.mjs', dist, '--out', out], {
        encoding: 'utf8',
    });
}

describe('scripts/package.mjs', () => {
    let dist: string;
    let scratch: string;
    beforeAll(() => {
        dist = buildToTemp();
        scratch = mkdtempSync(path.join(tmpdir(), 'kelp-tank-pack-'));
    });

    it('pnpm package packs dist into a valid kelp-tank package, offline', () => {
        const out = path.join(scratch, 'kelp-tank.kelpi-plugin');
        const run = pack(dist, out);
        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
        expect(existsSync(out)).toBe(true);
        // Read the packed file back with Kelpi's own validator, not the pack output.
        const check = spawnSync(process.execPath, ['scripts/validate.mjs', out], {
            encoding: 'utf8',
        });
        expect(check.status).toBe(0);
        const report = JSON.parse(check.stdout) as { format: string; pluginID: string };
        expect(report).toMatchObject({ format: 'kelpi-plugin', pluginID: 'dita.kelp-tank' });
    });

    it('pnpm package replaces an old package instead of failing', () => {
        const out = path.join(scratch, 'again.kelpi-plugin');
        expect(pack(dist, out).status).toBe(0);
        const second = pack(dist, out);
        expect(second.stderr).toBe('');
        expect(second.status).toBe(0);
    });

    it('the package script fails loudly when the Kelpi CLI is missing', () => {
        const out = path.join(scratch, 'missing-cli.kelpi-plugin');
        const run = spawnSync(process.execPath, ['scripts/package.mjs', dist, '--out', out], {
            encoding: 'utf8',
            env: { ...process.env, KELPI_CLI: '/nonexistent/kelpi.js' },
        });
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('/nonexistent/kelpi.js');
        expect(existsSync(out)).toBe(false);
    });

    it('the package script packs the directory it is given, with the default file name', () => {
        // Run from an empty folder, so a script that ignored the directory and fell back to
        // `dist` would find nothing there and fail.
        const cwd = mkdtempSync(path.join(tmpdir(), 'kelp-tank-default-'));
        const run = spawnSync(process.execPath, [path.resolve('scripts/package.mjs'), dist], {
            encoding: 'utf8',
            cwd,
        });
        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
        expect(existsSync(path.join(cwd, 'kelp-tank.kelpi-plugin'))).toBe(true);
    });

    it('the package script refuses --out with no file name', () => {
        const run = spawnSync(process.execPath, ['scripts/package.mjs', dist, '--out'], {
            encoding: 'utf8',
        });
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('--out needs a file name');
    });

    it('the package script never reaches a running Kelpi', () => {
        const script = readFileSync('scripts/package.mjs', 'utf8');
        expect(script).toContain("KELPI_SOCKET: 'tcp:127.0.0.1:1'");
        expect(script).toContain("KELPI_REQUIRE_SOCKET: '1'");
        // The CLI is run as a script with node, never as the `kelpi` command on PATH.
        expect(script).not.toMatch(/spawnSync\(\s*['"]kelpi['"]/);
    });
});
