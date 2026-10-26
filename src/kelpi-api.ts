/**
 * The slice of Kelpi's plugin API this plugin calls.
 *
 * Kelpi's SDK (`@kelpi/plugin-sdk`) is not published to npm, so these types are copied from
 * `packages/plugin-sdk/domain.d.ts`, `packages/plugin-sdk/index.d.ts` and `docs/plugins.md` at
 * Kelpi tag v0.2.19. Add to them only when the plugin starts calling something new.
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

/** Who ran a command. `paneID` and `workspaceID` come from the caller's `KELPI_PANE_ID` for a CLI verb. */
export interface CommandContext {
    daemonID: string;
    workspaceID?: string;
    paneID?: string;
}

/** The args a command gets when it runs as a `kelpi <verb>` from the manifest's `contributes.cli`. */
export interface CliInvocation {
    argv: string[];
    cwd: string;
    isTTY: boolean;
    json: boolean;
}

/** What a `contributes.cli` command returns. The CLI prints `stderr` to standard error, then `text`. */
export interface CliResult {
    text?: string;
    json?: unknown;
    exitCode?: number;
    stderr?: string;
}

/** The `api` object Kelpi passes to a backend's `activate`. */
export interface BackendApi {
    commands: {
        register(
            id: string,
            handler: (args: unknown, context: CommandContext) => unknown,
        ): () => void;
    };
    /** Sends a plugin event to every view and backend, named `<plugin id>.<name>`. */
    emit(name: string, data?: unknown): Promise<PluginEvent>;
    /** Persistent JSON belonging to this plugin on this daemon. */
    storage: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<void>;
    };
    workspaces: {
        list(options?: { groupID?: string }): Promise<WorkspaceInfo[]>;
    };
    /** Daemon state with its event epoch and sequence. */
    snapshot(): Promise<Snapshot>;
    /**
     * Kelpi's command router (its docs/wire-protocol.md). Kelp Tank sends only `workspace-move`.
     * A reply carries `ok`; a fire-and-forget verb answers `{ ok: true }` once it is queued.
     */
    command(payload: Record<string, unknown>): Promise<unknown>;
    events: {
        /** Subscribe to a named event, such as `state.changed`. Returns an unsubscribe. */
        on(name: string, listener: (event: PluginEvent) => void | Promise<void>): () => void;
    };
    agents: {
        /** One call per agent hook Kelpi handles (`agent.event`). Returns an unsubscribe. */
        onEvent(
            listener: (event: AgentHookEvent, raw: PluginEvent) => void | Promise<void>,
        ): () => void;
    };
}

/**
 * One event Kelpi pushes to `events.on`. A `gap` event means some were dropped. `pluginID` is set
 * on events a plugin emitted itself; Kelpi's own events carry none.
 */
export interface PluginEvent {
    epoch: string;
    sequence: number;
    name: string;
    data: unknown;
    pluginID?: string;
}

/** The wire verb an agent hook arrived as (Kelpi `docs/agent-lifecycle.md` section 7.7). */
export type AgentHookEventType =
    | 'start'
    | 'stop'
    | 'notification'
    | 'error'
    | 'session-start'
    | 'session-end'
    | 'permission-request';

/** The `agent.event` payload. Optional fields are present only when the hook carried them. */
export interface AgentHookEvent {
    type: AgentHookEventType;
    paneID: string;
    workspaceID: string;
    /** The pane's agent kind after the event; `claude` when none is recorded. */
    agent: AgentKind;
    /** The session the pane is bound to after the event. */
    sessionID?: string;
    /** The pane's status after Kelpi applied the event. */
    status: PaneStatus;
    /** Claude Notification only: `permission_prompt`, `idle_prompt`, `elicitation_dialog`, ... */
    notificationType?: string;
    /** `notification` only. */
    title?: string;
    body?: string;
    /** `error`, and a `permission-request` deny when the provider gave one. */
    message?: string;
    /** Claude Stop only: the final reply's text, capped at 64 KiB of UTF-8. */
    lastAssistantMessage?: string;
    /** Present (true) only when `lastAssistantMessage` was cut to the cap. */
    lastAssistantMessageTruncated?: true;
    transcriptPath?: string;
    /** `stop` / `notification`, only when more than 0. */
    backgroundTasks?: number;
    /** Codex PermissionRequest (`notification`), and every `permission-request`. */
    toolName?: string;
    /** `permission-request` only: the decision Kelpi answered Claude with. */
    behavior?: 'allow' | 'deny' | 'abstain';
    /** `permission-request` only: the provider that was asked. */
    provider?: string;
    /** The pane's workspace is muted: honour it. */
    muted?: true;
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
    /** Invokes a command this plugin declares, which its backend registered. */
    commands: {
        execute<T = unknown>(id: string, args?: Record<string, unknown>): Promise<T>;
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
    /** When the agent's current turn began, in epoch milliseconds; null when it is not running. */
    agentStartedAt?: number | null;
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
          agentStartedAt?: number | null;
      };
