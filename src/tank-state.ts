import type { WorkspaceColor } from './kelpi-api';

/**
 * What the tank shows: one entry per workspace that can hold a ledge, and one per Claude or
 * Codex session that is a creature.
 *
 * `decide-tank.ts` produces it from Kelpi's panes and workspaces. The scene (`src/ui/tank.ts`)
 * draws a ledge for each of `workspaces` and a creature for each of `sessions`. Plain terminal
 * panes never appear here.
 */
export interface TankState {
    workspaces: TankWorkspace[];
    sessions: TankSession[];
}

/** A Kelpi workspace, from `WorkspaceInfo`. */
export interface TankWorkspace {
    id: string;
    name: string;
    /** The workspace's own Kelpi colour, used for its kelp and fish. */
    color: WorkspaceColor;
    /** Muted workspaces' fish go to the glass without the glow or bubble. */
    muted: boolean;
    /**
     * The chord Kelpi's sidebar gives this workspace, such as `⌘2`, numbered by Kelpi's visible
     * sidebar order and read from its live keymap. Null when Kelpi gives it none.
     */
    shortcut: string | null;
}

/** Which creature a session becomes, decided from its name. */
export type SessionRole = 'day' | 'conductor' | 'rail' | 'fish';

/**
 * Kelpi's `running` is `working`, `waitingForInput` is `wantsYou`, and `idle` is `idle`.
 * `update` is a waiting session whose last reply said nothing waits on the owner (its footer
 * is `Awaiting you: 0`); it never glows. `closed` means the pane closed or its Claude session ended. Kelpi leaves an ended session's pane
 * in `waitingForInput`, so read the ended session from its cleared session id (see docs/prd.md).
 */
export type SessionState = 'working' | 'wantsYou' | 'update' | 'idle' | 'closed';

/** One Claude or Codex session in a Kelpi pane. */
export interface TankSession {
    paneId: string;
    workspaceId: string;
    /** The session's name, without Kelpi's status symbol prefix. */
    displayName: string;
    role: SessionRole;
    state: SessionState;
    /**
     * For a waiting rail that relays instead of asking Dita: its conductor's pane id.
     * Null for every other session.
     */
    relaysTo: string | null;
    /**
     * The session's live background agents, oldest first, from Kelp Tank's Claude hook
     * (src/agents.ts). Each is a baby fish beside the creature. Empty for a closed session, and
     * for every session when the hook is not installed.
     */
    babies: string[];
}
