import { decideTank } from './decide-tank';
import type { PluginEvent, Snapshot, ViewApi } from './kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from './kelpi-world';
import { chordsFromKeymap, FALLBACK_CHORDS } from './shortcuts';
import type { TankState } from './tank-state';

export type LiveKelpi = Pick<ViewApi, 'snapshot' | 'events' | 'ui'>;

/**
 * Keeps a `TankState` current from Kelpi's pushed events, without polling, and jumps to a
 * session on request. Follows Kelpi's rule (docs/plugins.md): subscribe before the snapshot,
 * discard events at or before its sequence, and take a fresh snapshot on a `gap` event or a
 * new epoch. Every other event name, `daemon.notification` included, is ignored. Workspace
 * shortcuts come from Kelpi's live keymap through `ui.onChrome`; without one they stay ⌘1 to ⌘9.
 */
export function startLiveTank(
    kelpi: LiveKelpi,
    onState: (state: TankState) => void,
    onError: (error: Error) => void,
): { jump(paneId: string): Promise<void>; stop(): void } {
    let epoch: string | null = null;
    let sequence = -1;
    let world: KelpiWorld = { workspaces: [], panes: [], topLevelOrder: [], groups: {} };
    let tank: TankState = { workspaces: [], sessions: [] };
    let pending: PluginEvent[] | null = null;
    let chords: readonly (string | null)[] = FALLBACK_CHORDS;

    const needsResync = (event: PluginEvent) => event.name === 'gap' || event.epoch !== epoch;

    function apply(event: PluginEvent) {
        if (event.sequence <= sequence) return;
        sequence = event.sequence;
        if (event.name !== 'state.changed') return;
        world = applyChanges(world, event.data as unknown[]);
        tank = decideTank(world, tank, chords);
        onState(tank);
    }

    function resync() {
        const buffered: PluginEvent[] = [];
        pending = buffered;
        kelpi.snapshot().then(
            (snapshot: Snapshot) => {
                pending = null;
                epoch = snapshot.epoch;
                sequence = snapshot.sequence;
                world = worldFromSnapshot(snapshot.state);
                tank = decideTank(world, null, chords);
                onState(tank);
                for (const event of buffered) {
                    if (needsResync(event)) return resync();
                    apply(event);
                }
            },
            (error: unknown) => {
                pending = null;
                epoch = null; // so the next event retries the snapshot
                onError(error instanceof Error ? error : new Error(String(error)));
            },
        );
    }

    const off = kelpi.events.on('*', (event) => {
        if (pending) pending.push(event);
        else if (needsResync(event)) resync();
        else apply(event);
    });
    // A chrome error leaves the fallback chords in place; the tank carries on without a keymap.
    const offChrome = kelpi.ui.onChrome(
        (snapshot) => {
            const next = chordsFromKeymap(snapshot.keymap);
            if (JSON.stringify(next) === JSON.stringify(chords)) return;
            chords = next;
            if (epoch === null) return;
            tank = decideTank(world, tank, chords);
            onState(tank);
        },
        () => {},
    );
    resync();

    return {
        async jump(paneId) {
            const session = tank.sessions.find((candidate) => candidate.paneId === paneId);
            if (session) await kelpi.ui.focusPane(session.workspaceId, paneId);
        },
        stop() {
            off();
            offChrome();
        },
    };
}
