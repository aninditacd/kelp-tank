import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Builds the plugin into a fresh temp directory, so a stale `dist/` can never satisfy a test. */
export function buildToTemp(): string {
    const outdir = path.join(mkdtempSync(path.join(tmpdir(), 'kelp-tank-build-')), 'dist');
    execFileSync(process.execPath, ['scripts/build.mjs', '--outdir', outdir], { stdio: 'pipe' });
    return outdir;
}
