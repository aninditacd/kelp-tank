import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PluginEvent, Snapshot } from '../src/kelpi-api';
import { startLiveTank } from '../src/live-tank';
import type { SessionRole, SessionState, TankState } from '../src/tank-state';
import { buildToTemp } from './package/build-to-temp';

/**
 * The twelve-session run in Kelpi's private instance: twelve real Claude sessions across nine
 * workspaces, replayed through the real live tank. `tests/fixtures/README.md` says how it was
 * captured. The expected values below are the run table written while running it, not values
 * read back from the code.
 */
const lines = readFileSync('tests/fixtures/twelve-sessions-run.jsonl', 'utf8').trim().split('\n');
const snapshot = JSON.parse(lines[0]) as Snapshot;
const events = lines.slice(1).map((line) => (JSON.parse(line) as { event: PluginEvent }).event);

/** Each session's creature, from its name. */
const ROLES: Record<string, SessionRole> = {
    'wed-15-10-2026': 'day',
    'conducting-test': 'conductor',
    'rail-a': 'rail',
    'rail-b': 'rail',
    'kelp-tank': 'fish',
    'kelp-review': 'fish',
    lighthouse: 'fish',
    lagoon: 'fish',
    notes: 'fish',
    garden: 'fish',
    radio: 'fish',
    quiet: 'fish',
};

/** Where the run left each session that was still open. */
const FINAL: Record<string, SessionState> = {
    'kelp-tank': 'idle',
    'kelp-review': 'idle',
    'conducting-test': 'working',
    'rail-a': 'idle',
    'rail-b': 'wantsYou',
    'wed-15-10-2026': 'working',
    lighthouse: 'working',
    lagoon: 'idle',
    notes: 'working',
};
/** `radio` and `quiet` ran /exit, and the `garden` pane was closed. */
const ENDED = ['radio', 'quiet', 'garden'];

/** Ledges in Kelpi's sidebar order at the end: Lagoon was moved up to just below Default. */
const LEDGES = ['Lagoon', 'Kelp', 'Ops', 'Harbour', 'Lighthouse', 'Notes'];

async function replay(): Promise<TankState[]> {
    const states: TankState[] = [];
    let deliver: (event: PluginEvent) => void = () => {};
    startLiveTank(
        {
            snapshot: vi.fn(() => Promise.resolve(snapshot)),
            events: {
                on: (_name, listener) => {
                    deliver = listener;
                    return () => {};
                },
            },
            ui: { focusPane: () => Promise.resolve(), onChrome: () => () => {} },
        },
        (state) => states.push(state),
        (error) => {
            throw error;
        },
    );
    await Promise.resolve();
    await Promise.resolve();
    for (const event of events) deliver(event);
    return states;
}

describe('the twelve-session run with real sessions', () => {
    let states: TankState[];
    beforeAll(async () => {
        states = await replay();
    });

    it('twelve real sessions become the right creatures', () => {
        const seen = new Map<string, SessionRole>();
        for (const state of states)
            for (const s of state.sessions)
                if (s.displayName in ROLES) seen.set(s.displayName, s.role);
        expect(Object.fromEntries(seen)).toEqual(ROLES);
    });

    it('the last state of each real session is the one the run left it in', () => {
        const last = states[states.length - 1];
        const byName = new Map(last.sessions.map((s) => [s.displayName, s.state]));
        for (const [name, state] of Object.entries(FINAL))
            expect(byName.get(name), name).toBe(state);
        for (const name of ENDED) expect([undefined, 'closed'], name).toContain(byName.get(name));
    });

    it('every live workspace in the run has a ledge', () => {
        const last = states[states.length - 1];
        expect(last.workspaces.map((w) => w.name)).toEqual(LEDGES);
    });
});

describe('the built view', () => {
    it('the built view carries no demo data', () => {
        const app = readFileSync(path.join(buildToTemp(), 'ui', 'app.js'), 'utf8');
        // Positive control: this is the real bundle, which stores the hidden workspaces.
        expect(app).toContain('hiddenWorkspaces');
        // Session names and a pane id from the demo data that main had before the live feed replaced it.
        for (const demo of ['p-conductor', 'p-rail-c', 'p-review'])
            expect(app, demo).not.toContain(demo);
    });
});
