import { decideTank } from './decide-tank';
import type { AgentHookEvent, PluginEvent, Snapshot, ViewApi } from './kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from './kelpi-world';
import { quietAfter } from './quiet';
import { chordsFromKeymap, FALLBACK_CHORDS } from './shortcuts';
import type { TankState } from './tank-state';

export type LiveKelpi = Pick<ViewApi, 'snapshot' | 'events' | 'ui' | 'commands'>;

/** The backend command that lists the panes whose last reply ended `Awaiting you: 0`. */
const QUIET_COMMAND = 'dita.kelp-tank.quiet';

/**
 * Keeps a `TankState` current from Kelpi's pushed events, without polling, and jumps to a
 * session on request. Follows Kelpi's rule (docs/plugins.md): subscribe before the snapshot,
 * discard events at or before its sequence, and take a fresh snapshot on a `gap` event or a
 * new epoch. Every other event name, `daemon.notification` included, is ignored. Workspace
 * shortcuts come from Kelpi's live keymap through `ui.onChrome`; without one they stay ⌘1 to ⌘9.
 *
 * Kelpi's own `agent.event` events (those with no `pluginID`) mark a pane quiet after a reply that
 * ends `Awaiting you: 0` (src/quiet.ts). A rebuilt page missed those events, so every snapshot is
 * followed by a request to the backend, which kept the quiet panes, before buffered events apply.
 * A failed request leaves every waiting fish wanting the owner: the safe side.
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
    let quiet: ReadonlySet<string> = new Set();

    const needsResync = (event: PluginEvent) => event.name === 'gap' || event.epoch !== epoch;

    function apply(event: PluginEvent) {
        if (event.sequence <= sequence) return;
        sequence = event.sequence;
        if (event.name === 'agent.event' && event.pluginID === undefined) {
            quiet = quietAfter(quiet, event.data as AgentHookEvent);
            tank = decideTank(world, tank, chords, quiet);
            onState(tank);
            return;
        }
        if (event.name !== 'state.changed') return;
        world = applyChanges(world, event.data as unknown[]);
        tank = decideTank(world, tank, chords, quiet);
        onState(tank);
    }

    function resync() {
        const buffered: PluginEvent[] = [];
        pending = buffered;
        // Events stay buffered until the backend has answered too, so a live event always lands on
        // top of the answer and never under it.
        const quietPanes = (): Promise<string[]> =>
            kelpi.commands.execute<{ panes?: unknown }>(QUIET_COMMAND).then(
                (answer) =>
                    Array.isArray(answer?.panes)
                        ? answer.panes.filter((id): id is string => typeof id === 'string')
                        : [],
                () => [],
            );
        kelpi
            .snapshot()
            .then(async (snapshot: Snapshot) => ({ snapshot, panes: await quietPanes() }))
            .then(
                ({ snapshot, panes }) => {
                    pending = null;
                    epoch = snapshot.epoch;
                    sequence = snapshot.sequence;
                    world = worldFromSnapshot(snapshot.state);
                    quiet = new Set(panes);
                    tank = decideTank(world, null, chords, quiet);
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
            tank = decideTank(world, tank, chords, quiet);
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
