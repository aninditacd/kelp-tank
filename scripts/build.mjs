/**
 * Builds the installable plugin package: `dist/` by default, or `--outdir <dir>`.
 * Everything, Three.js included, is bundled, because a Kelpi plugin may not load code from
 * the network or from `node_modules`. `--watch` rebuilds on change for `kelpi plugin dev dist`.
 * `--probe` builds the throwaway probe plugin in `probes/tank-probe/` into its own `dist/`.
 *
 * The tests in tests/package/ run this script as a child process, so coverage tools cannot see it.
 * `--watch` has no test; it is a convenience for local development.
 */
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const root = probe ? 'probes/tank-probe' : '.';
const sources = probe
    ? { backend: 'src/backend.ts', app: 'src/view.ts', html: 'src/index.html' }
    : { backend: 'src/backend.ts', app: 'src/ui/app.ts', html: 'src/ui/index.html' };
const outdirIndex = args.indexOf('--outdir');
const outdir = path.resolve(outdirIndex >= 0 ? args[outdirIndex + 1] : path.join(root, 'dist'));
const watch = args.includes('--watch');
const from = (file) => path.join(root, file);

rmSync(outdir, { recursive: true, force: true });
mkdirSync(path.join(outdir, 'ui'), { recursive: true });
copyFileSync(from('kelpi.plugin.json'), path.join(outdir, 'kelpi.plugin.json'));
copyFileSync(from(sources.html), path.join(outdir, 'ui', 'index.html'));

const shared = { bundle: true, logLevel: 'warning', target: 'es2022' };
const builds = [
    {
        ...shared,
        entryPoints: [from(sources.backend)],
        outfile: path.join(outdir, 'backend.mjs'),
        platform: 'node',
        format: 'esm',
    },
    {
        ...shared,
        entryPoints: [from(sources.app)],
        outfile: path.join(outdir, 'ui', 'app.js'),
        platform: 'browser',
        format: 'iife',
    },
];

if (watch) {
    for (const options of builds) await (await esbuild.context(options)).watch();
    console.log(`watching, writing to ${outdir}`);
} else {
    await Promise.all(builds.map((options) => esbuild.build(options)));
}
