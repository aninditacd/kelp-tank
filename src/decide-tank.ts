import { activityForTool } from './activity';
import { liveAgents, type AgentBook } from './agents';
import { sidebarOrder, type KelpiWorld, type WorldPane } from './kelpi-world';
import { FALLBACK_CHORDS, workspaceShortcuts } from './shortcuts';
import type { SessionRole, SessionState, TankSession, TankState } from './tank-state';

/**
 * Decides what the tank shows from Kelpi's workspaces and panes. Pure logic: it never touches
 * the scene. The rules are in docs/prd.md.
 */

const STATUS_PREFIX = /^[^\p{L}\p{N}]\s+/u;
const DAY = /^(mon|tue|wed|thu|fri|sat|sun)-\d{2}-\d{2}-\d{4}$/i;
/**
 * A conductor's rail: `rail-a`, a batch-prefixed `lh-deps-1013-rail-a`, or a handover such as
 * `lh-deps-1013-rail-r2`. Never `guardrail-a`, `rail-ab` or `rail-2`.
 */
const RAIL = /(?:^|-)rail-[a-z]\d*$/i;

/** The session name from a pane title, without Kelpi's one-character status prefix. */
export function sessionName(title: string): string {
    return title.replace(STATUS_PREFIX, '');
}

export function roleForName(name: string): SessionRole {
    if (DAY.test(name)) return 'day';
    // Rails first, so a batch slug containing "conduct" still makes a rail.
    if (RAIL.test(name)) return 'rail';
    if (name.toLowerCase().includes('conduct')) return 'conductor';
    return 'fish';
}

const STATES = { running: 'working', waitingForInput: 'wantsYou', idle: 'idle' } as const;

function stateOf(pane: WorldPane): SessionState {
    return pane.agentSessionId === null ? 'closed' : STATES[pane.status];
}

/** Claude sets the title two events after the session starts; until then, use the pane label. */
function displayNameOf(pane: WorldPane): string {
    const name = pane.title === null ? '' : sessionName(pane.title);
    return name || pane.label || pane.agentKind || '';
}

/**
 * `chords` are Kelpi's nine workspace shortcuts, from its keymap. `previous` is the last decision. A session whose pane has gone, or no longer runs an agent, is
 * reported `closed` once from it, so the scene can swim it off, and dropped the time after.
 * `quiet` holds the panes whose last reply ended `Awaiting you: 0` (src/quiet.ts): such a pane
 * that is waiting shows `update`, except a rail, which keeps relaying as before.
 * `babies` is the agent book from Kelp Tank's Claude hook and the time to judge it at; a session's
 * baby fish are its pane's live agents of its own session id. Null, as without the hook, gives none.
 * `world.activity` gives a working session its `activity` and a waiting one its `dozing`
 * (src/activity.ts); a rail never has either.
 */
export function decideTank(
    world: KelpiWorld,
    previous: TankState | null,
    chords: readonly (string | null)[] = FALLBACK_CHORDS,
    quiet: ReadonlySet<string> = new Set(),
    babies: { book: AgentBook; now: number } | null = null,
): TankState {
    const live: TankSession[] = world.panes
        .filter((pane) => pane.agentKind !== null)
        .map((pane) => {
            const displayName = displayNameOf(pane);
            const role = roleForName(displayName);
            const state = stateOf(pane);
            const shown =
                state === 'wantsYou' && role !== 'rail' && quiet.has(pane.id) ? 'update' : state;
            // Tools and dozes recorded under another session id belong to an older session.
            const tracked = world.activity[pane.id];
            const own = tracked?.sessionId === pane.agentSessionId ? tracked : undefined;
            const newest = own?.tools.at(-1);
            return {
                paneId: pane.id,
                workspaceId: pane.workspaceId,
                displayName,
                role,
                state: shown,
                relaysTo: null,
                babies:
                    babies === null || pane.agentSessionId === null
                        ? []
                        : liveAgents(babies.book, pane.id, pane.agentSessionId, babies.now),
                activity:
                    shown === 'working' && role !== 'rail' && newest !== undefined
                        ? activityForTool(newest)
                        : null,
                dozing:
                    (shown === 'wantsYou' || shown === 'update') &&
                    role !== 'rail' &&
                    own?.dozing === true,
                workingSince: shown === 'working' ? pane.agentStartedAt : null,
            };
        });

    const sessions = live.map((session) => {
        if (session.role !== 'rail' || session.state !== 'wantsYou') return session;
        const conductor = live.find(
            (other) =>
                other.role === 'conductor' &&
                other.state !== 'closed' &&
                other.workspaceId === session.workspaceId,
        );
        return { ...session, relaysTo: conductor?.paneId ?? null };
    });

    const vanished = (previous?.sessions ?? [])
        .filter((old) => old.state !== 'closed' && !live.some((s) => s.paneId === old.paneId))
        .map((old) => ({
            ...old,
            state: 'closed' as const,
            relaysTo: null,
            babies: [],
            activity: null,
            dozing: false,
            workingSince: null,
        }));

    const ledges = new Set(sessions.filter((s) => s.state !== 'closed').map((s) => s.workspaceId));
    const shortcuts = workspaceShortcuts(world, chords);
    return {
        workspaces: sidebarOrder(world)
            .map((id) => world.workspaces.find((workspace) => workspace.id === id)!)
            .filter((workspace) => ledges.has(workspace.id))
            .map(({ id, name, color, muted }) => ({
                id,
                name,
                color,
                muted,
                shortcut: shortcuts.get(id) ?? null,
            })),
        sessions: [...sessions, ...vanished],
    };
}
