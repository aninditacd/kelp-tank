import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Runs the real Claude hook script, `claude-hook/kelp-tank-hook.mjs`, as Claude Code does: one
 * `node` process with the payload on stdin. `PATH` holds only a fake `kelpi`, which writes the
 * pane id it saw and its argv to a file, NUL-separated, so nothing reaches a real Kelpi.
 */
const HOOK = path.resolve('claude-hook/kelp-tank-hook.mjs');
const PANE = 'D1EDDE77-C27D-4291-92DF-D15D1658B301';
const NAMES = ['subagent-start', 'subagent-stop', 'pre-tool-use', 'post-tool-use'] as const;

type Payload = Record<string, unknown>;
const payload = (name: (typeof NAMES)[number]): Payload =>
    JSON.parse(readFileSync(`tests/fixtures/hook-payloads/${name}.json`, 'utf8')) as Payload;

function fakeKelpi(options: { sleepSeconds?: number; missing?: boolean } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'kelp-tank-hook-'));
    const out = path.join(dir, 'calls');
    if (!options.missing) {
        const sleep = options.sleepSeconds ? `/bin/sleep ${options.sleepSeconds}\n` : '';
        writeFileSync(
            path.join(dir, 'kelpi'),
            `#!/bin/sh\n${sleep}printf '%s\\0' "pane=$KELPI_PANE_ID" "$@" > "${out}.part"\n/bin/mv "${out}.part" "${out}"\n`,
        );
        chmodSync(path.join(dir, 'kelpi'), 0o755);
    }
    return { dir, out };
}

function runHook(input: string, env: Record<string, string | undefined>, fake = fakeKelpi()) {
    const started = Date.now();
    const run = spawnSync(process.execPath, [HOOK], {
        input,
        encoding: 'utf8',
        env: { PATH: fake.dir, ...env },
        timeout: 10_000,
    });
    return { ...run, took: Date.now() - started, fake };
}

/** The fake's record, polled for up to `ms`: `pane=<id>` first, then kelpi's argv. Null if none came. */
async function calls(fake: { out: string }, ms = 5000): Promise<string[] | null> {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        if (existsSync(fake.out)) return readFileSync(fake.out, 'utf8').split('\0').slice(0, -1);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
}

describe('the Kelp Tank Claude hook', { timeout: 30_000 }, () => {
    it('the hook prints nothing and exits 0, for every event and for bad input', () => {
        const bad = { ...payload('subagent-start'), hook_event_name: 'Notification' };
        const inputs = [
            ...NAMES.map((name) => JSON.stringify(payload(name))),
            'not json',
            '{}',
            'null',
            JSON.stringify(bad),
        ];
        for (const input of inputs) {
            const run = runHook(input, { KELPI_PANE_ID: PANE });
            expect([run.status, run.stdout, run.stderr]).toEqual([0, '', '']);
        }
    });

    it('the hook passes only the event, session, agent and tool to kelpi kelp-tank', async () => {
        const expected = {
            'subagent-start': ['SubagentStart', '--session', 'S', '--agent', 'A'],
            'subagent-stop': ['SubagentStop', '--session', 'S', '--agent', 'A'],
            'pre-tool-use': ['PreToolUse', '--session', 'S', '--agent', 'A', '--tool', 'Bash'],
            'post-tool-use': ['PostToolUse', '--session', 'S', '--agent', 'A', '--tool', 'Bash'],
        };
        for (const name of NAMES) {
            const sent = payload(name);
            const run = runHook(JSON.stringify(sent), { KELPI_PANE_ID: PANE });
            const argv = await calls(run.fake);
            const ids = { S: sent.session_id as string, A: sent.agent_id as string };
            expect(argv).toEqual([
                `pane=${PANE}`,
                'kelp-tank',
                ...expected[name].map((arg) => (arg === 'S' || arg === 'A' ? ids[arg] : arg)),
            ]);
            // The made-up tool input, tool output, reply text and paths in the payloads.
            expect(argv!.join(' ')).not.toMatch(/mooring|tide|srv\/demo|general-purpose/);
        }
    });

    it("a parent session's own tool call is sent without an agent", async () => {
        const sent = { ...payload('pre-tool-use') };
        delete sent.agent_id;
        const run = runHook(JSON.stringify(sent), { KELPI_PANE_ID: PANE });
        expect(await calls(run.fake)).toEqual([
            `pane=${PANE}`,
            'kelp-tank',
            'PreToolUse',
            '--session',
            sent.session_id,
            '--tool',
            'Bash',
        ]);
    });

    it('an id with unexpected characters is left out', async () => {
        const sent = {
            ...payload('pre-tool-use'),
            session_id: 'a b\nc',
            agent_id: 'x'.repeat(129),
        };
        const run = runHook(JSON.stringify(sent), { KELPI_PANE_ID: PANE });
        expect(await calls(run.fake)).toEqual([
            `pane=${PANE}`,
            'kelp-tank',
            'PreToolUse',
            '--tool',
            'Bash',
        ]);
    });

    it('the hook returns before kelpi finishes', async () => {
        const fake = fakeKelpi({ sleepSeconds: 3 });
        const run = runHook(
            JSON.stringify(payload('subagent-start')),
            { KELPI_PANE_ID: PANE },
            fake,
        );
        expect(run.status).toBe(0);
        // Half-way through the fake's 3-second sleep at most, and the fake has not written yet.
        expect(run.took).toBeLessThan(1500);
        expect(existsSync(fake.out)).toBe(false);
        expect(await calls(fake, 8000)).not.toBeNull();
    });

    it('the hook exits 0 when kelpi is not installed', () => {
        const run = runHook(
            JSON.stringify(payload('subagent-start')),
            { KELPI_PANE_ID: PANE },
            fakeKelpi({ missing: true }),
        );
        expect([run.status, run.stdout, run.stderr]).toEqual([0, '', '']);
    });

    it('the hook does nothing outside a Kelpi pane', async () => {
        for (const pane of [undefined, '']) {
            const run = runHook(JSON.stringify(payload('subagent-start')), {
                KELPI_PANE_ID: pane,
            });
            expect([run.status, run.stdout, run.stderr]).toEqual([0, '', '']);
            expect(await calls(run.fake, 1000)).toBeNull();
        }
    });
});
