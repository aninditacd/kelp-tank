import type { WorkspaceColor } from './kelpi-api';

/**
 * What the tank shows: one entry per workspace that can hold a ledge, and one per Claude or
 * Codex session that is a creature.
 *
 * Issue #3's decider produces it from Kelpi's panes and workspaces. Issue #5 draws the ledges
 * from `workspaces`, and issue #6 draws a creature for each of `sessions`. Plain terminal panes
 * never appear here.
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
 * `closed` means the pane closed or its Claude session ended. Kelpi leaves an ended session's pane
 * in `waitingForInput`, so read the ended session from its cleared session id (see docs/prd.md).
 */
export type SessionState = 'working' | 'wantsYou' | 'idle' | 'closed';

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
}
