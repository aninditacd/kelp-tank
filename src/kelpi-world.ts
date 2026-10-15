import type {
    AgentKind,
    PaneStatus,
    SidebarId,
    Snapshot,
    SnapshotPane,
    StateChange,
    WorkspaceColor,
} from './kelpi-api';

/**
 * The part of Kelpi's state the tank decides from: workspaces and their panes, kept current by
 * applying `state.changed` events to a snapshot. Pure data; `decide-tank.ts` reads it.
 */
export interface KelpiWorld {
    workspaces: WorldWorkspace[];
    panes: WorldPane[];
    /** Kelpi's sidebar: top-level entries, and each group's workspace ids in order. */
    topLevelOrder: SidebarId[];
    groups: Record<string, { childOrder: string[]; isCollapsed: boolean }>;
}

export interface WorldWorkspace {
    id: string;
    name: string;
    color: WorkspaceColor;
    muted: boolean;
}

export interface WorldPane {
    id: string;
    workspaceId: string;
    label: string | null;
    title: string | null;
    status: PaneStatus;
    agentKind: AgentKind | null;
    agentSessionId: string | null;
}

function worldPane(pane: SnapshotPane, workspaceId: string): WorldPane {
    return {
        id: pane.id,
        workspaceId,
        label: pane.label,
        title: pane.title,
        status: pane.status,
        agentKind: pane.agentKind,
        agentSessionId: pane.agentSessionID,
    };
}

/** Parked panes count: they are still live sessions. */
export function worldFromSnapshot(state: Snapshot['state']): KelpiWorld {
    return {
        workspaces: state.workspaces.map(({ id, name, color, muted }) => ({
            id,
            name,
            color,
            muted,
        })),
        panes: state.workspaces.flatMap((workspace) =>
            [...workspace.panes, ...workspace.parkedPanes].map((pane) =>
                worldPane(pane, workspace.id),
            ),
        ),
        topLevelOrder: state.topLevelOrder,
        groups: Object.fromEntries(
            state.groups.map((group) => [
                group.id,
                { childOrder: group.childOrder, isCollapsed: group.isCollapsed },
            ]),
        ),
    };
}

/**
 * Workspace ids in Kelpi's sidebar order: the top level, with each group's workspaces in place.
 * The snapshot's own `workspaces` array is creation order, not this. A workspace the order does
 * not mention yet goes last.
 */
export function sidebarOrder(world: KelpiWorld): string[] {
    const ordered = world.topLevelOrder.flatMap((entry) =>
        entry.kind === 'group' ? (world.groups[entry.id]?.childOrder ?? []) : [entry.id],
    );
    const known = new Set(world.workspaces.map((workspace) => workspace.id));
    const listed = ordered.filter((id) => known.has(id));
    const rest = world.workspaces
        .map((workspace) => workspace.id)
        .filter((id) => !listed.includes(id));
    return [...listed, ...rest];
}

/**
 * Kelpi's `visibleWorkspaceOrder` (its docs/app-state-core.md, section 2.2): the sidebar order,
 * without a collapsed group's workspaces. Kelpi's ⌘1 to ⌘9 index into this order.
 */
export function visibleWorkspaceOrder(world: KelpiWorld): string[] {
    const known = new Set(world.workspaces.map((workspace) => workspace.id));
    return world.topLevelOrder
        .flatMap((entry) => {
            if (entry.kind === 'workspace') return [entry.id];
            const group = world.groups[entry.id];
            return group && !group.isCollapsed ? group.childOrder : [];
        })
        .filter((id) => known.has(id));
}

/** Returns a new world with the changes applied in order. Change kinds it does not read are ignored. */
export function applyChanges(world: KelpiWorld, changes: readonly unknown[]): KelpiWorld {
    let { workspaces, panes } = world;
    let { topLevelOrder, groups } = world;
    for (const change of changes as StateChange[]) {
        switch (change.kind) {
            case 'pane-upserted': {
                const next = worldPane(change.pane, change.workspaceID);
                panes = panes.some((pane) => pane.id === next.id)
                    ? panes.map((pane) => (pane.id === next.id ? next : pane))
                    : [...panes, next];
                break;
            }
            case 'pane-removed':
                panes = panes.filter((pane) => pane.id !== change.paneID);
                break;
            case 'agent-status-changed':
                panes = panes.map((pane) =>
                    pane.id === change.paneID
                        ? {
                              ...pane,
                              status: change.status,
                              agentSessionId: change.agentSessionID,
                              agentKind: change.agentKind,
                          }
                        : pane,
                );
                break;
            case 'workspace-upserted': {
                const { name, color, muted } = change.workspace;
                const known = workspaces.find((workspace) => workspace.id === change.id);
                const next: WorldWorkspace = {
                    id: change.id,
                    name: name ?? known?.name ?? '',
                    color: color ?? known?.color ?? 'gray',
                    muted: muted ?? known?.muted ?? false,
                };
                workspaces = known
                    ? workspaces.map((workspace) => (workspace.id === next.id ? next : workspace))
                    : [...workspaces, next];
                break;
            }
            case 'order-changed':
                topLevelOrder = change.topLevelOrder;
                break;
            case 'group-upserted':
                groups = {
                    ...groups,
                    [change.id]: {
                        childOrder: change.group.childOrder,
                        isCollapsed: change.group.isCollapsed,
                    },
                };
                break;
            case 'group-removed':
                groups = Object.fromEntries(
                    Object.entries(groups).filter(([id]) => id !== change.id),
                );
                break;
            case 'workspace-removed':
                workspaces = workspaces.filter((workspace) => workspace.id !== change.id);
                panes = panes.filter((pane) => pane.workspaceId !== change.id);
                break;
        }
    }
    return { workspaces, panes, topLevelOrder, groups };
}
