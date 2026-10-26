import { decideTank } from './decide-tank';
import type { SidebarId } from './kelpi-api';
import type { KelpiWorld } from './kelpi-world';
import type { SessionState } from './tank-state';

/**
 * Sorts Kelpi's sidebar by Claude session state (issue #25), so the sessions that need the owner
 * sit under the ⌘1 to ⌘9 shortcuts. Pure logic; the backend sends the moves.
 *
 * The first workspace in the sidebar stays first. Every other one is ranked by its most urgent
 * session, as the tank shows it: needs you, working, update, idle, then no live session. Ties
 * keep their current order, so nothing moves until a workspace's rank changes. The result is
 * one flat list: grouped workspaces are taken out of their groups. Nested workspaces are never
 * moved, because Kelpi keeps them under their parent.
 */

/** How long the backend waits after a change before it sorts, so a flicker moves nothing. */
export const SORT_DELAY_MS = 2000;

const RANK: Record<SessionState, number> = {
    wantsYou: 0,
    working: 1,
    update: 2,
    idle: 3,
    closed: 4,
};
const NO_SESSION = 4;

/** One `workspace-move` to the top level, at an index read after the workspace is detached. */
export interface SortMove {
    id: string;
    index: number;
}

/** The workspaces the sorter may move, in sidebar order: top-level ones and group members. */
function movable(world: KelpiWorld): string[] {
    const known = new Set(world.workspaces.map((workspace) => workspace.id));
    return world.topLevelOrder
        .flatMap((entry) =>
            entry.kind === 'group' ? (world.groups[entry.id]?.childOrder ?? []) : [entry.id],
        )
        .filter((id) => known.has(id));
}

/** The flat order the sidebar should have: the first workspace, then the rest by rank. */
export function sortTarget(world: KelpiWorld, quiet: ReadonlySet<string>): string[] {
    const [pinned, ...rest] = movable(world);
    if (pinned === undefined) return [];
    const rank = new Map<string, number>();
    for (const session of decideTank(world, null, undefined, quiet).sessions) {
        const best = rank.get(session.workspaceId) ?? NO_SESSION;
        rank.set(session.workspaceId, Math.min(best, RANK[session.state]));
    }
    const sorted = rest
        .map((id) => ({ id, rank: rank.get(id) ?? NO_SESSION }))
        .sort((a, b) => a.rank - b.rank) // stable, so ties keep their order
        .map(({ id }) => id);
    return [pinned, ...sorted];
}

/** The moves that turn the sidebar into `sortTarget`'s order, at the top level. Empty when it is already. */
export function sortMoves(world: KelpiWorld, quiet: ReadonlySet<string>): SortMove[] {
    const target = sortTarget(world, quiet);
    let top: SidebarId[] = [...world.topLevelOrder];
    const moves: SortMove[] = [];
    target.forEach((id, index) => {
        const here = top[index];
        if (here?.kind === 'workspace' && here.id === id) return;
        top = top.filter((entry) => !(entry.kind === 'workspace' && entry.id === id));
        top.splice(index, 0, { kind: 'workspace', id });
        moves.push({ id, index });
    });
    return moves;
}
