/**
 * The slice of Kelpi's plugin API this plugin calls.
 *
 * Kelpi's SDK (`@kelpi/plugin-sdk`) is not published to npm, so these types are copied from
 * `packages/plugin-sdk/domain.d.ts` and `docs/plugins.md` at Kelpi commit 897b5b8. Add to them
 * only when the plugin starts calling something new.
 */

export type WorkspaceColor =
    'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray' | 'black' | 'white';

export interface WorkspaceInfo {
    id: string;
    name: string;
    color: WorkspaceColor;
    paneCount: number;
    isActive: boolean;
    createdAt: string;
    lastAccessedAt: string;
    labels: string[];
    /** Muted: the workspace's agents raise no desktop notification, sound or dock bounce. */
    muted: boolean;
    icon?: string;
    lastActivityAt?: string;
    agentSessionID?: string;
    groupID?: string;
    groupName?: string;
}

/** The `api` object Kelpi passes to a backend's `activate`. */
export interface BackendApi {
    commands: {
        register(id: string, handler: (args?: unknown) => unknown): () => void;
    };
    workspaces: {
        list(options?: { groupID?: string }): Promise<WorkspaceInfo[]>;
    };
}

/** One event Kelpi pushes to `events.on`. A `gap` event means some were dropped. */
export interface PluginEvent {
    epoch: string;
    sequence: number;
    name: string;
    data: unknown;
}

/** Kelpi's live keyboard map, as Help draws it (`docs/plugin-chrome.md`, "The keyboard map"). */
export interface ChromeKeymap {
    sections: {
        category: string;
        actions: { action: string; title: string; shortcut: string | null }[];
    }[];
}

/** The window chrome snapshot a view watches through `ui.onChrome`. Kelpi sends more fields. */
export interface ChromeSnapshot {
    keymap: ChromeKeymap;
}

/** The `window.kelpi` object Kelpi injects into a view. It deliberately has no `notify`. */
export interface ViewApi {
    ready: Promise<void>;
    snapshot(): Promise<Snapshot>;
    events: {
        on(name: string, listener: (event: PluginEvent) => void): () => void;
    };
    /** Persistent JSON belonging to this plugin on this daemon; sidebar views keep preferences here. */
    storage: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<void>;
    };
    ui: {
        focusPane(workspaceID: string, paneID: string): Promise<void>;
        onChrome(
            listener: (snapshot: ChromeSnapshot) => void,
            onError?: (error: Error) => void,
        ): () => void;
    };
}

export type PaneStatus = 'idle' | 'running' | 'waitingForInput';
export type AgentKind = 'claude' | 'codex';

/** One pane in a state snapshot, or in a `pane-upserted` change. Kelpi sends more fields. */
export interface SnapshotPane {
    id: string;
    type: string;
    title: string | null;
    label: string | null;
    status: PaneStatus;
    agentKind: AgentKind | null;
    agentSessionID: string | null;
}

/** One workspace in a state snapshot. Kelpi sends more fields. */
export interface SnapshotWorkspace {
    id: string;
    name: string;
    color: WorkspaceColor;
    muted: boolean;
    panes: SnapshotPane[];
    parkedPanes: SnapshotPane[];
}

/** What `snapshot()` returns: the daemon state, anchored to an event epoch and sequence. */
/** One entry of Kelpi's sidebar: a top-level workspace, or a group. */
export interface SidebarId {
    kind: 'workspace' | 'group';
    id: string;
}

/** A workspace group. `childOrder` is its workspaces' ids in sidebar order. */
export interface SnapshotGroup {
    id: string;
    childOrder: string[];
    /** A collapsed group's workspaces get no ⌘1 to ⌘9 shortcut. */
    isCollapsed: boolean;
}

export interface Snapshot {
    epoch: string;
    sequence: number;
    state: { workspaces: SnapshotWorkspace[]; topLevelOrder: SidebarId[]; groups: SnapshotGroup[] };
}

/** The `state.changed` changes this plugin reads (Kelpi's `WsDeltaEvent`). Others are ignored. */
export type StateChange =
    | { kind: 'workspace-upserted'; id: string; workspace: Partial<SnapshotWorkspace> }
    | { kind: 'workspace-removed'; id: string }
    | { kind: 'pane-upserted'; workspaceID: string; paneID: string; pane: SnapshotPane }
    | { kind: 'pane-removed'; workspaceID: string; paneID: string }
    | { kind: 'group-upserted'; id: string; group: SnapshotGroup }
    | { kind: 'group-removed'; id: string }
    | { kind: 'order-changed'; topLevelOrder: SidebarId[] }
    | {
          kind: 'agent-status-changed';
          workspaceID: string;
          paneID: string;
          status: PaneStatus;
          agentSessionID: string | null;
          agentKind: AgentKind | null;
      };
