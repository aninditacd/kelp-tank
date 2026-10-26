import type { SidebarId } from './kelpi-api';
import type { KelpiWorld } from './kelpi-world';

/**
 * Sorts Kelpi's sidebar (issue #25), so the workspaces with a Claude session sit under the ⌘1 to
 * ⌘9 shortcuts. Pure logic; the backend sends the moves.
 *
 * The first workspace in the sidebar stays first. A workspace with a live Claude session moves up
 * past the workspaces without one, to just under the last one with a session. Workspaces with
 * sessions never reorder among themselves, whatever their sessions are doing, and neither do
 * the ones without. So a workspace whose session ended falls below the ones still active. The
 * result is one flat list: grouped workspaces are taken out of their groups. Nested workspaces
 * are never moved, because Kelpi keeps them under their parent.
 */

/** How long the backend waits after a change before it sorts, so a session that only blinks moves nothing. */
export const SORT_DELAY_MS = 2000;

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

/** The flat order the sidebar should have: the first workspace, then those with a session, then the rest. */
export function sortTarget(world: KelpiWorld): string[] {
    const [pinned, ...rest] = movable(world);
    if (pinned === undefined) return [];
    const live = new Set(
        world.panes
            .filter((pane) => pane.agentKind !== null && pane.agentSessionId !== null)
            .map((pane) => pane.workspaceId),
    );
    return [pinned, ...rest.filter((id) => live.has(id)), ...rest.filter((id) => !live.has(id))];
}

/** The moves that turn the sidebar into `sortTarget`'s order, at the top level. Empty when it is already. */
export function sortMoves(world: KelpiWorld): SortMove[] {
    const target = sortTarget(world);
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
