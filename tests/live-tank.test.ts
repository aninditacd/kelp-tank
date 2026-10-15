import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** A fake `window.kelpi`: the test delivers events and resolves each snapshot itself. */
function fakeKelpi() {
    const listeners: ((event: PluginEvent) => void)[] = [];
    const snapshots: { resolve(s: Snapshot): void; reject(e: Error): void }[] = [];
    const focusPane = vi.fn<(workspaceID: string, paneID: string) => Promise<void>>(async () => {});
    const states: TankState[] = [];
    const chrome: {
        listener?: (snapshot: ChromeSnapshot) => void;
        onError?: (error: Error) => void;
    } = {};
    const errors: Error[] = [];
    const kelpi = {
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
});
