/**
 * Packs the built plugin into one shareable file: `kelpi plugin pack <dir> --out <file> --json`,
 * offline, with Kelpi's own CLI. `pnpm package` builds `dist/` first, then runs this with the
 * defaults, `dist` and `kelp-tank.kelpi-plugin`. The file is gitignored.
 *
 * The CLI is found as in validate.mjs: `$KELPI_CLI`, else the Kelpi checkout at ~/apps/kelpi.
 * It never uses the `kelpi` on PATH. The socket points nowhere and is required, so packing can
 * never reach a running Kelpi. Kelpi refuses to overwrite a package, so an old one is removed.
 *
 * tests/package/pack.test.ts runs this script as a child process, so coverage tools cannot see it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : 'kelp-tank.kelpi-plugin';
if (!out || out.startsWith('--')) {
    console.error('package: --out needs a file name, such as --out kelp-tank.kelpi-plugin.');
    process.exit(1);
}
const dir =
    args.find((arg, index) => !arg.startsWith('--') && (outIndex < 0 || index !== outIndex + 1)) ??
    'dist';
const cli =
    process.env.KELPI_CLI ?? path.join(os.homedir(), 'apps/kelpi/packages/cli/dist/kelpi.js');

if (!existsSync(cli)) {
    console.error(`package: Kelpi CLI not found at ${cli}. Build it, or set KELPI_CLI.`);
    process.exit(1);
}

rmSync(out, { force: true });
const run = spawnSync(process.execPath, [cli, 'plugin', 'pack', dir, '--out', out, '--json'], {
    stdio: 'inherit',
    env: { ...process.env, KELPI_SOCKET: 'tcp:127.0.0.1:1', KELPI_REQUIRE_SOCKET: '1' },
});
process.exit(run.status ?? 1);
