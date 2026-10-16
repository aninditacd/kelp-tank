import { applyAgentEvent, applyToolEvent, readActivity, seedActivity } from './activity';
import { dropExpired, EMPTY_BOOK, hasAgents, readBook, type AgentBook } from './agents';
import { decideTank } from './decide-tank';
import type { AgentHookEvent, PluginEvent, Snapshot, ViewApi } from './kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from './kelpi-world';
import { quietAfter } from './quiet';
import { chordsFromKeymap, FALLBACK_CHORDS } from './shortcuts';
import type { TankState } from './tank-state';

export type LiveKelpi = Pick<ViewApi, 'snapshot' | 'events' | 'ui' | 'commands'>;

/** The backend command that lists the panes whose last reply ended `Awaiting you: 0`. */
const QUIET_COMMAND = 'dita.kelp-tank.quiet';
/** The backend command that answers the agent book, and the event that carries each change to it. */
const BOOK_COMMAND = 'dita.kelp-tank.agent-book';
const BOOK_EVENT = 'dita.kelp-tank.agents';
/** The event the backend sends for each hook call: a tool or subagent starting or finishing. */
const HOOK_EVENT = 'dita.kelp-tank.hook';
/** The backend command that answers each pane's running tools and doze. */
const ACTIVITY_COMMAND = 'dita.kelp-tank.activity';
/** How long a snapshot waits for the backend's answers before going on without them. */
const QUIET_WAIT_MS = 3000;
/** While any agent is in the book, the tank re-decides this often, so a timed-out baby fish leaves. */
const BABY_CHECK_MS = 30 * 1000;

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
 *
 * Baby fish come from the agent book the backend keeps from Kelp Tank's Claude hook
 * (src/agents.ts). A snapshot asks the backend for it beside the quiet panes, and each
 * `dita.kelp-tank.agents` event replaces it as it arrives, whatever the snapshot is doing; the
 * higher `revision` wins. A failed request gives no baby fish and no error: the hook is optional.
 *
 * Each `dita.kelp-tank.hook` event, and Kelpi's own `agent.event`, updates what a creature is
 * doing and whether it dozes (src/activity.ts). The backend keeps the same record, so a snapshot
 * seeds the world from its answer. The answer names the last event it covers; a buffered event at
 * or before that, in the same epoch, is already in it and does not change the activity again.
 */
export function startLiveTank(
    kelpi: LiveKelpi,
    onState: (state: TankState) => void,
    onError: (error: Error) => void,
): { jump(paneId: string): Promise<void>; stop(): void } {
    let epoch: string | null = null;
    let sequence = -1;
    let world: KelpiWorld = {
        workspaces: [],
        panes: [],
        topLevelOrder: [],
        groups: {},
        activity: {},
    };
    let tank: TankState = { workspaces: [], sessions: [] };
    let pending: PluginEvent[] | null = null;
    let chords: readonly (string | null)[] = FALLBACK_CHORDS;
    let quiet: ReadonlySet<string> = new Set();
    let book: AgentBook = EMPTY_BOOK;
    let babyCheck: ReturnType<typeof setInterval> | null = null;
    // The last event sequence the backend's activity answer already includes; -1 for none.
    let activityCovered = -1;
    // Set by `stop`, so a snapshot still on its way afterwards starts no timer and draws nothing.
    let stopped = false;

    const decide = (previous: TankState | null) =>
        decideTank(world, previous, chords, quiet, { book, now: Date.now() });

    /** Takes `next` if it is newer, and re-decides then, or every `BABY_CHECK_MS` while any agent is left. */
    function takeBook(next: AgentBook) {
        if (next.revision <= book.revision) return;
        book = next;
        watchBabies();
        if (epoch === null) return;
        tank = decide(tank);
        onState(tank);
    }

    function watchBabies() {
        if (hasAgents(book)) {
            babyCheck ??= setInterval(() => {
                book = dropExpired(book, Date.now());
                watchBabies();
                if (epoch === null) return;
                tank = decide(tank);
                onState(tank);
            }, BABY_CHECK_MS);
        } else if (babyCheck !== null) {
            clearInterval(babyCheck);
            babyCheck = null;
        }
    }

    const needsResync = (event: PluginEvent) => event.name === 'gap' || event.epoch !== epoch;

    function apply(event: PluginEvent) {
        if (event.sequence <= sequence) return;
        sequence = event.sequence;
        if (event.name === 'agent.event' && event.pluginID === undefined) {
            const data = event.data as AgentHookEvent;
            quiet = quietAfter(quiet, data);
            if (event.sequence > activityCovered) world = applyAgentEvent(world, data);
            tank = decide(tank);
            onState(tank);
            return;
        }
        if (event.name === HOOK_EVENT && event.pluginID === 'dita.kelp-tank') {
            if (event.sequence <= activityCovered) return;
            const next = applyToolEvent(world, event.data);
            if (next === world) return;
            world = next;
            tank = decide(tank);
            onState(tank);
            return;
        }
        if (event.name !== 'state.changed') return;
        world = applyChanges(world, event.data as unknown[]);
        tank = decide(tank);
        onState(tank);
    }

    function resync() {
        const buffered: PluginEvent[] = [];
        pending = buffered;
        // Events stay buffered until the backend has answered too, so a live event always lands on
        // top of the answer and never under it.
        // The wait is bounded and a throw is caught: the tank is the plugin's one job, so a backend
        // that is slow to start, silent or missing must cost the quiet marks and nothing else.
        const ask = <T>(command: string, read: (answer: unknown) => T, fallback: T): Promise<T> => {
            const answered = new Promise<T>((resolve) => {
                try {
                    kelpi.commands.execute(command).then(
                        (answer) => resolve(read(answer)),
                        () => resolve(fallback),
                    );
                } catch {
                    resolve(fallback);
                }
            });
            const waited = new Promise<T>((resolve) =>
                setTimeout(() => resolve(fallback), QUIET_WAIT_MS),
            );
            return Promise.race([answered, waited]);
        };
        const quietPanes = () =>
            ask(
                QUIET_COMMAND,
                (answer) => {
                    const panes = (answer as { panes?: unknown } | undefined)?.panes;
                    return Array.isArray(panes)
                        ? panes.filter((id): id is string => typeof id === 'string')
                        : [];
                },
                [] as string[],
            );
        kelpi
            .snapshot()
            .then(async (snapshot: Snapshot) => {
                const [panes, answeredBook, activity] = await Promise.all([
                    quietPanes(),
                    ask(BOOK_COMMAND, readBook, EMPTY_BOOK),
                    ask(ACTIVITY_COMMAND, readActivity, readActivity(undefined)),
                ]);
                return { snapshot, panes, answeredBook, activity };
            })
            .then(
                ({ snapshot, panes, answeredBook, activity }) => {
                    if (stopped) return;
                    pending = null;
                    epoch = snapshot.epoch;
                    sequence = snapshot.sequence;
                    world = seedActivity(worldFromSnapshot(snapshot.state), activity.panes);
                    activityCovered = activity.epoch === snapshot.epoch ? activity.sequence : -1;
                    quiet = new Set(panes);
                    if (answeredBook.revision > book.revision) book = answeredBook;
                    watchBabies();
                    tank = decide(null);
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
        if (event.name === BOOK_EVENT && event.pluginID === 'dita.kelp-tank') {
            takeBook(readBook(event.data));
            return;
        }
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
            tank = decide(tank);
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
            stopped = true;
            off();
            offChrome();
            if (babyCheck !== null) clearInterval(babyCheck);
            babyCheck = null;
        },
    };
}
