import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PROBES = {
    'src/lint-probe.ts': 'export const unused = () => { let x = 1; };\n',
    'src/clean-probe.ts': 'export const ok = 1;\n',
    'src/type-probe.ts': "export const n: number = 'x';\n",
    'src/format-probe.ts': 'export const   a=1',
};
type Probe = keyof typeof PROBES;

/** Git variables a surrounding hook sets would point the copy at this worktree's own index. */
function cleanEnv(): NodeJS.ProcessEnv {
    return Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
}

/** Copies the repo into a scratch git repo, writes the probes, stages `staged`, runs the hook. */
function runHook(written: Probe[], staged: Probe[]) {
    const env = cleanEnv();
    const dir = mkdtempSync(path.join(tmpdir(), 'kelp-tank-hook-'));
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
        encoding: 'utf8',
        env,
    })
        .split('\n')
        .filter(Boolean);
    for (const file of files) {
        mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        cpSync(file, path.join(dir, file));
    }
    symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' });
    git('init', '-q');
    git('add', '--', ...files.filter((file) => !file.startsWith('src/') || file.endsWith('.html')));
    git(
        '-c',
        'user.name=probe',
        '-c',
        'user.email=probe@test',
        'commit',
        '-qm',
        'base',
        '--no-verify',
    );
    git('add', '--', ...files);
    for (const probe of written) writeFileSync(path.join(dir, probe), PROBES[probe]);
    if (staged.length > 0) git('add', '--', ...staged);
    const run = spawnSync('sh', ['.husky/pre-commit'], { cwd: dir, env, encoding: 'utf8' });
    return { dir, status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe('pre-commit hook', { timeout: 120_000 }, () => {
    it('the pre-commit hook refuses a staged file with a lint error', () => {
        const run = runHook(['src/lint-probe.ts'], ['src/lint-probe.ts']);
        expect(run.status).not.toBe(0);
        expect(run.output).toMatch(/prefer-const|no-unused-vars/);
    });

    it('the pre-commit hook ignores a lint error in an unstaged file', () => {
        const run = runHook(['src/lint-probe.ts', 'src/clean-probe.ts'], ['src/clean-probe.ts']);
        expect(run.output).not.toMatch(/prefer-const|no-unused-vars/);
        expect(run.status).toBe(0);
    });

    it('the pre-commit hook refuses a staged file with a type error', () => {
        const run = runHook(['src/type-probe.ts'], ['src/type-probe.ts']);
        expect(run.status).not.toBe(0);
        expect(run.output).toContain('TS2322');
    });

    it('the pre-commit hook formats staged files', () => {
        const run = runHook(['src/format-probe.ts'], ['src/format-probe.ts']);
        expect(run.status).toBe(0);
        expect(readFileSync(path.join(run.dir, 'src/format-probe.ts'), 'utf8')).toBe(
            'export const a = 1;\n',
        );
    });

    it('the pre-commit hook runs only the tests related to staged files', () => {
        const config = readFileSync('.lintstagedrc.json', 'utf8');
        const hook = readFileSync('.husky/pre-commit', 'utf8');
        expect(config).toContain('vitest related --run');
        expect(`${config}\n${hook}`).not.toMatch(/vitest run|pnpm test/);
    });
});
