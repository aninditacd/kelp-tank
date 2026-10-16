import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_TIMEOUT_MS, EMPTY_BOOK, type AgentBook } from '../src/agents';
import { decideTank } from '../src/decide-tank';
import type { ChromeSnapshot, PluginEvent, Snapshot } from '../src/kelpi-api';
import { worldFromSnapshot } from '../src/kelpi-world';
import { startLiveTank } from '../src/live-tank';
import type { TankState } from '../src/tank-state';
import {
    paneIdByLabel,
    recordedEvents,
    recordedSnapshot,
    replayTank,
    snapshotAt,
    workspaceIdByName,
} from './support/recorded-run';
import { footerEvents, footerPaneId, footerSnapshot, footerSnapshotAt } from './support/footer-run';

/** A fake `window.kelpi`: the test delivers events and resolves each snapshot itself. */
/**
 * `seed` is what the backend's quiet command answers: pane ids, or an Error to fail with.
 * `holdSeed` leaves each answer pending until the test calls `answerSeed`. `book` is what the
 * backend's agent book command answers, and `holdBook` holds it until `answerBook`.
 */
function fakeKelpi(
    options: {
        seed?: string[] | Error;
        holdSeed?: boolean;
        book?: AgentBook | Error;
        holdBook?: boolean;
    } = {},
) {
    const listeners: ((event: PluginEvent) => void)[] = [];
    const snapshots: { resolve(s: Snapshot): void; reject(e: Error): void }[] = [];
    const focusPane = vi.fn<(workspaceID: string, paneID: string) => Promise<void>>(async () => {});
    const states: TankState[] = [];
    const chrome: {
        listener?: (snapshot: ChromeSnapshot) => void;
        onError?: (error: Error) => void;
    } = {};
    const errors: Error[] = [];
    const seeds: { resolve(): void }[] = [];
    const books: { resolve(): void }[] = [];
    const execute = vi.fn(async (id: string) => {
        if (id === 'dita.kelp-tank.agent-book') {
            if (options.holdBook) await new Promise<void>((resolve) => books.push({ resolve }));
            if (options.book instanceof Error) throw options.book;
            return options.book ?? EMPTY_BOOK;
        }
        expect(id).toBe('dita.kelp-tank.quiet');
        if (options.holdSeed) await new Promise<void>((resolve) => seeds.push({ resolve }));
        if (options.seed instanceof Error) throw options.seed;
        return { panes: options.seed ?? [] };
    });
    const kelpi = {
        commands: { execute: execute as never },
        snapshot: vi.fn(
            () => new Promise<Snapshot>((resolve, reject) => snapshots.push({ resolve, reject })),
        ),
        events: {
            on: vi.fn((name: string, listener: (event: PluginEvent) => void) => {
                expect(name).toBe('*');
                listeners.push(listener);
                return () => listeners.splice(listeners.indexOf(listener), 1);
            }),
        },
        ui: {
            focusPane,
            onChrome: vi.fn(
                (
                    listener: (snapshot: ChromeSnapshot) => void,
                    onError?: (error: Error) => void,
                ) => {
                    chrome.listener = listener;
                    chrome.onError = onError;
                    return () => (chrome.listener = undefined);
                },
            ),
        },
    };
    const live = startLiveTank(
        kelpi,
        (state) => states.push(state),
        (error) => errors.push(error),
    );
    return {
        kelpi,
        live,
        states,
        errors,
        focusPane,
        chrome,
        deliver: (event: PluginEvent) => listeners.forEach((listener) => listener(event)),
        /** Resolves the oldest unresolved snapshot request, then lets its handler run. */
        execute,
        answerBook: async () => {
            books.shift()!.resolve();
            await new Promise((resolve) => setImmediate(resolve));
        },
        answerSeed: async () => {
            seeds.shift()!.resolve();
            await new Promise((resolve) => setImmediate(resolve));
        },
        resolveSnapshot: async (snapshot: Snapshot) => {
            snapshots.shift()!.resolve(snapshot);
            await new Promise((resolve) => setImmediate(resolve));
        },
        rejectSnapshot: async (error: Error) => {
            snapshots.shift()!.reject(error);
            await new Promise((resolve) => setImmediate(resolve));
        },
    };
}

function eventsBetween(from: number, to: number): PluginEvent[] {
    return recordedEvents.filter((e) => e.sequence >= from && e.sequence <= to);
}

function sessionOf(state: TankState | undefined, label: string) {
    return state?.sessions.find((s) => s.paneId === paneIdByLabel(label));
}

afterEach(() => vi.useRealTimers());

describe('the live tank', () => {
    it('a state change updates the tank as the event arrives', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        expect(fake.states.at(-1)).toEqual(replayTank(253));
    });

    it('the tank never polls Kelpi', async () => {
        // Only the clock the tank could poll with is faked, before the tank starts.
        vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout'] });
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        const statesSoFar = fake.states.length;
        vi.advanceTimersByTime(10 * 60 * 1000);
        expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(1);
        expect(fake.states).toHaveLength(statesSoFar);
    });

    it('a gap triggers a fresh snapshot and the state matches it', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 252).forEach(fake.deliver);
        fake.deliver({ epoch: recordedSnapshot.epoch, sequence: 253, name: 'gap', data: null });
        expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(2);
        await fake.resolveSnapshot(snapshotAt(253));
        const expected = decideTank(worldFromSnapshot(snapshotAt(253).state), null);
        expect(fake.states.at(-1)).toEqual(expected);
        expect(sessionOf(fake.states.at(-1), 'fish')?.state).toBe('wantsYou');
    });

    it('a new epoch triggers a fresh snapshot', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 200).forEach(fake.deliver);
        fake.deliver({
            ...recordedEvents.find((e) => e.sequence === 241)!,
            epoch: 'restarted',
            sequence: 5,
        });
        expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(2);
        await fake.resolveSnapshot(snapshotAt(253, 'restarted'));
        expect(fake.states.at(-1)).toEqual(
            decideTank(worldFromSnapshot(snapshotAt(253).state), null),
        );
    });

    it("events at or before the snapshot's sequence are discarded", async () => {
        const fake = fakeKelpi();
        eventsBetween(241, 250).forEach(fake.deliver);
        await fake.resolveSnapshot(snapshotAt(272));
        expect(sessionOf(fake.states.at(-1), 'day')?.state).toBe('idle');
    });

    it('a gap during a snapshot triggers another snapshot', async () => {
        const fake = fakeKelpi();
        fake.deliver({ epoch: recordedSnapshot.epoch, sequence: 150, name: 'gap', data: null });
        await fake.resolveSnapshot(recordedSnapshot);
        expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(2);
    });

    it('a Kelpi notification leaves the tank unchanged', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        const statesSoFar = fake.states.length;
        const notification = recordedEvents.find((e) => e.sequence === 254)!;
        expect(notification.name).toBe('daemon.notification');
        fake.deliver(notification);
        expect(fake.states).toHaveLength(statesSoFar);
    });

    it('a failed snapshot is reported', async () => {
        const fake = fakeKelpi();
        await fake.rejectSnapshot(new Error('offline'));
        expect(fake.errors.map((e) => e.message)).toEqual(['offline']);
    });

    it('clicking a fish focuses its pane in its workspace', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        await fake.live.jump(paneIdByLabel('rail-a'));
        expect(fake.focusPane.mock.calls).toEqual([
            [workspaceIdByName('Kelp'), paneIdByLabel('rail-a')],
        ]);
    });

    it('clicking an unknown pane does nothing', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        await fake.live.jump('no-such-pane');
        expect(fake.focusPane).not.toHaveBeenCalled();
    });

    it('a new keymap updates the shortcuts live', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        fake.chrome.listener!({
            keymap: {
                sections: [
                    {
                        category: 'Workspaces',
                        actions: [
                            {
                                action: 'switch_to_workspace_2',
                                title: 'Workspace 2',
                                shortcut: '⌃2',
                            },
                        ],
                    },
                ],
            },
        });
        expect(fake.states.at(-1)?.workspaces.find((w) => w.name === 'Kelp')?.shortcut).toBe('⌃2');
    });

    it('a chrome error keeps the fallback shortcuts', async () => {
        const fake = fakeKelpi();
        fake.chrome.onError!(new Error('no chrome'));
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 253).forEach(fake.deliver);
        expect(fake.states.at(-1)).toEqual(replayTank(253));
        expect(fake.states.at(-1)?.workspaces.find((w) => w.name === 'Kelp')?.shortcut).toBe('⌘2');
    });

    it('a collapsed group loses its shortcuts live', async () => {
        const lines = readFileSync('tests/fixtures/collapsed-group-run.jsonl', 'utf8')
            .trim()
            .split('\n');
        const snapshot = JSON.parse(lines[0]) as Snapshot;
        const collapse = (JSON.parse(lines[1]) as { event: PluginEvent }).event;
        const bravo = snapshot.state.workspaces.find((w) => w.name === 'Bravo')!;
        const fake = fakeKelpi();
        await fake.resolveSnapshot(snapshot);
        // The run holds no Claude session, so give Bravo one, to give it a ledge.
        fake.deliver({
            epoch: snapshot.epoch,
            sequence: snapshot.sequence + 1,
            name: 'state.changed',
            data: [
                {
                    kind: 'pane-upserted',
                    workspaceID: bravo.id,
                    paneID: 'claude-pane',
                    pane: {
                        id: 'claude-pane',
                        type: 'shell',
                        title: '✳ kelp-tank',
                        label: null,
                        status: 'idle',
                        agentKind: 'claude',
                        agentSessionID: 'session',
                    },
                },
            ],
        });
        expect(fake.states.at(-1)?.workspaces).toMatchObject([{ name: 'Bravo', shortcut: '⌘4' }]);
        fake.deliver(collapse);
        expect(fake.states.at(-1)?.workspaces).toMatchObject([{ name: 'Bravo', shortcut: null }]);
    });

    it('a snapshot that fails with a non-Error is reported as an Error', async () => {
        const fake = fakeKelpi();
        await fake.rejectSnapshot('offline' as unknown as Error);
        expect(fake.errors.map((e) => [e instanceof Error, e.message])).toEqual([
            [true, 'offline'],
        ]);
    });

    it('an unchanged keymap, or one before the snapshot, emits no new state', async () => {
        const fake = fakeKelpi();
        const keymap = { keymap: { sections: [] } };
        fake.chrome.listener!(keymap);
        expect(fake.states).toHaveLength(0);
        await fake.resolveSnapshot(recordedSnapshot);
        const statesSoFar = fake.states.length;
        fake.chrome.listener!(keymap);
        expect(fake.states).toHaveLength(statesSoFar);
        expect(fake.states.at(-1)?.workspaces.every((w) => w.shortcut === null)).toBe(true);
    });

    it('stop unsubscribes from events and chrome', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        fake.live.stop();
        eventsBetween(173, 253).forEach(fake.deliver);
        expect(fake.states).toHaveLength(1);
        expect(fake.chrome.listener).toBeUndefined();
    });

    it('a failed snapshot after a gap is retried on the next event', async () => {
        const fake = fakeKelpi();
        await fake.resolveSnapshot(recordedSnapshot);
        eventsBetween(173, 200).forEach(fake.deliver);
        fake.deliver({ epoch: recordedSnapshot.epoch, sequence: 201, name: 'gap', data: null });
        await fake.rejectSnapshot(new Error('busy'));
        fake.deliver(recordedEvents.find((e) => e.sequence === 241)!);
        expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(3);
    });

    describe('quiet sessions', () => {
        const eventsUpTo = (sequence: number) => footerEvents.filter((e) => e.sequence <= sequence);
        const stateOf = (fake: ReturnType<typeof fakeKelpi>, label: string) =>
            fake.states.at(-1)?.sessions.find((s) => s.paneId === footerPaneId(label))?.state;

        it('a footer-0 stop turns a waiting fish to update as the event arrives', async () => {
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshot);
            eventsUpTo(136).forEach(fake.deliver);
            expect(stateOf(fake, 'update-fish')).toBe('wantsYou');
            fake.deliver(footerEvents.find((e) => e.sequence === 137)!);
            expect(stateOf(fake, 'update-fish')).toBe('update');
        });

        it('a footer-2 stop leaves the fish wanting you', async () => {
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshot);
            eventsUpTo(155).forEach(fake.deliver);
            expect(stateOf(fake, 'ask-fish')).toBe('wantsYou');
        });

        it('an agent event sent by a plugin is ignored', async () => {
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshot);
            eventsUpTo(136).forEach(fake.deliver);
            fake.deliver({
                ...footerEvents.find((e) => e.sequence === 137)!,
                pluginID: 'someone.else',
            });
            expect(stateOf(fake, 'update-fish')).toBe('wantsYou');
        });

        it('a new page takes the quiet panes from the backend', async () => {
            // A page opened just after the stop at 137: it never heard the stop.
            const fake = fakeKelpi({ seed: [footerPaneId('update-fish')] });
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(
                fake.execute.mock.calls.filter(([id]) => id === 'dita.kelp-tank.quiet'),
            ).toHaveLength(1);
            expect(stateOf(fake, 'update-fish')).toBe('update');
            const bare = fakeKelpi();
            await bare.resolveSnapshot(footerSnapshotAt(137));
            expect(stateOf(bare, 'update-fish')).toBe('wantsYou');
        });

        it('a live event newer than the seed beats the seed', async () => {
            const fake = fakeKelpi({ seed: [footerPaneId('perm-fish')], holdSeed: true });
            await fake.resolveSnapshot(footerSnapshot);
            // The page hears the run's events while the backend's answer is still on its way.
            eventsUpTo(292).forEach(fake.deliver);
            await fake.answerSeed();
            expect(stateOf(fake, 'perm-fish')).toBe('wantsYou');
        });

        it('a failed seed leaves waiting fish wanting you and shows no error', async () => {
            const fake = fakeKelpi({ seed: new Error('no backend') });
            await fake.resolveSnapshot(footerSnapshot);
            eventsUpTo(136).forEach(fake.deliver);
            expect(stateOf(fake, 'update-fish')).toBe('wantsYou');
            expect(fake.errors).toEqual([]);
        });

        it('a seed that never answers still draws the tank after the wait', async () => {
            vi.useFakeTimers({ toFake: ['setTimeout'] });
            const fake = fakeKelpi({ holdSeed: true });
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(fake.states).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(3000);
            expect(stateOf(fake, 'update-fish')).toBe('wantsYou');
            expect(fake.errors).toEqual([]);
        });

        it('a Kelpi without commands still draws the tank', async () => {
            const fake = fakeKelpi();
            (fake.kelpi as { commands?: unknown }).commands = undefined;
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(stateOf(fake, 'update-fish')).toBe('wantsYou');
            expect(fake.errors).toEqual([]);
        });

        it('the live tank never writes to storage', () => {
            const source = readFileSync('src/live-tank.ts', 'utf8');
            expect(source).not.toMatch(/storage/);
        });
    });

    describe('baby fish', () => {
        const T0 = 1_760_000_000_000;
        const PANE = footerPaneId('update-fish');
        const SESSION = footerSnapshotAt(137)
            .state.workspaces.flatMap((w) => w.panes)
            .find((p) => p.id === PANE)!.agentSessionID!;
        const bookOf = (revision: number, agents: string[], at = T0): AgentBook => ({
            revision,
            panes: agents.length
                ? {
                      [PANE]: {
                          sessionId: SESSION,
                          agents: Object.fromEntries(
                              agents.map((id) => [id, { startedAt: at, lastSeen: at }]),
                          ),
                      },
                  }
                : {},
        });
        const agentsEvent = (book: AgentBook, pluginID = 'dita.kelp-tank'): PluginEvent => ({
            epoch: footerSnapshot.epoch,
            sequence: 10_000 + book.revision,
            name: 'dita.kelp-tank.agents',
            data: book,
            pluginID,
        });
        const babiesOf = (fake: ReturnType<typeof fakeKelpi>) =>
            fake.states.at(-1)?.sessions.find((s) => s.paneId === PANE)?.babies;

        it('an agents event updates the baby fish without a new snapshot', async () => {
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(babiesOf(fake)).toEqual([]);
            fake.deliver(agentsEvent(bookOf(1, ['a1'], Date.now())));
            expect(babiesOf(fake)).toEqual(['a1']);
            expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(1);
        });

        it('a new page takes the baby fish from the backend', async () => {
            const fake = fakeKelpi({ book: bookOf(4, ['a1', 'a2'], Date.now()) });
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(babiesOf(fake)).toEqual(['a1', 'a2']);
        });

        it('an agents event from another plugin is ignored', async () => {
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshotAt(137));
            const statesSoFar = fake.states.length;
            fake.deliver(agentsEvent(bookOf(1, ['a1'], Date.now()), 'someone.else'));
            expect(fake.states).toHaveLength(statesSoFar);
            expect(babiesOf(fake)).toEqual([]);
        });

        it('an older answered book does not undo a newer agents event', async () => {
            const fake = fakeKelpi({ book: bookOf(3, []), holdBook: true });
            await fake.resolveSnapshot(footerSnapshotAt(137));
            // The hook ran while the backend's answer was still on its way.
            fake.deliver(agentsEvent(bookOf(5, ['a1'], Date.now())));
            await fake.answerBook();
            expect(babiesOf(fake)).toEqual(['a1']);
            fake.deliver(agentsEvent(bookOf(4, [])));
            expect(babiesOf(fake)).toEqual(['a1']);
        });

        it('the tank still shows sessions when the agent book cannot be read', async () => {
            const fake = fakeKelpi({ book: new Error('no backend') });
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(fake.errors).toEqual([]);
            expect(fake.states.at(-1)?.sessions.length).toBeGreaterThan(0);
            expect(fake.states.at(-1)?.sessions.every((s) => s.babies.length === 0)).toBe(true);
        });

        it('a timed-out baby fish leaves without a new event', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
            vi.setSystemTime(T0);
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshotAt(137));
            fake.deliver(agentsEvent(bookOf(1, ['a1'], T0)));
            expect(babiesOf(fake)).toEqual(['a1']);
            await vi.advanceTimersByTimeAsync(AGENT_TIMEOUT_MS);
            expect(babiesOf(fake)).toEqual(['a1']);
            await vi.advanceTimersByTimeAsync(31_000);
            expect(babiesOf(fake)).toEqual([]);
            expect(fake.kelpi.snapshot).toHaveBeenCalledTimes(1);
            // With no agent left, the tank stops re-deciding.
            const statesSoFar = fake.states.length;
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
            expect(fake.states).toHaveLength(statesSoFar);
        });

        it('stop during a snapshot leaves no baby fish re-decide running', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
            vi.setSystemTime(T0);
            const fake = fakeKelpi({ book: bookOf(1, ['a1'], T0) });
            fake.live.stop();
            await fake.resolveSnapshot(footerSnapshotAt(137));
            expect(fake.states).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(AGENT_TIMEOUT_MS + 60_000);
            expect(fake.states).toHaveLength(0);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('stop ends the baby fish re-decide', async () => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
            vi.setSystemTime(T0);
            const fake = fakeKelpi();
            await fake.resolveSnapshot(footerSnapshotAt(137));
            fake.deliver(agentsEvent(bookOf(1, ['a1'], T0)));
            fake.live.stop();
            const statesSoFar = fake.states.length;
            await vi.advanceTimersByTimeAsync(AGENT_TIMEOUT_MS + 60_000);
            expect(fake.states).toHaveLength(statesSoFar);
        });
    });
});
