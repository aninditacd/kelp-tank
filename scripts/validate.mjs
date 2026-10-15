/**
 * Runs `kelpi plugin validate <dir> --json` with Kelpi's own CLI, offline.
 *
 * The CLI is `$KELPI_CLI`, else the Kelpi checkout at ~/apps/kelpi. It never uses the `kelpi`
 * on PATH, which talks to Dita's live app. The socket points nowhere and is required, so even a
 * command that did reach for a daemon would fail rather than find the live one.
 *
 * tests/package/validate.test.ts runs this script as a child process, so coverage tools cannot see it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = process.argv[2] ?? 'dist';
const cli =
    process.env.KELPI_CLI ?? path.join(os.homedir(), 'apps/kelpi/packages/cli/dist/kelpi.js');

if (!existsSync(cli)) {
    console.error(`validate: Kelpi CLI not found at ${cli}. Build it, or set KELPI_CLI.`);
    process.exit(1);
}

const run = spawnSync(process.execPath, [cli, 'plugin', 'validate', dir, '--json'], {
    stdio: 'inherit',
    env: { ...process.env, KELPI_SOCKET: 'tcp:127.0.0.1:1', KELPI_REQUIRE_SOCKET: '1' },
});
process.exit(run.status ?? 1);
