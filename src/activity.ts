import type { AgentHookEvent } from './kelpi-api';
import type { KelpiWorld } from './kelpi-world';

/**
 * What a working Claude session is doing, from Kelp Tank's Claude hook (`dita.kelp-tank.hook`
 * events, see src/backend.ts) and whether a waiting one dozes, from Kelpi's own `agent.event`.
 * Pure logic over `KelpiWorld.activity`; `decide-tank.ts` turns it into each session's
 * `activity` and `dozing`. Only tool names are read: never tool input, output or reply text.
 */

/** The prop a working creature shows. */
export type Activity = 'read' | 'edit' | 'command' | 'web' | 'agent';

/** One pane's running tools, oldest start first, for the Claude session `sessionId`. */
export interface PaneActivity {
    sessionId: string | null;
    tools: string[];
    dozing: boolean;
}

const GROUPS: Record<string, Activity> = {
    Read: 'read',
    Grep: 'read',
    Glob: 'read',
    Edit: 'edit',
    Write: 'edit',
    MultiEdit: 'edit',
    NotebookEdit: 'edit',
    Bash: 'command',
    WebSearch: 'web',
    WebFetch: 'web',
    Agent: 'agent',
    Task: 'agent',
};

/** The group a tool belongs to, or null for any tool not listed. */
export function activityForTool(tool: string): Activity | null {
    return Object.hasOwn(GROUPS, tool) ? GROUPS[tool] : null;
}

const FINISHES = new Set(['PostToolUse', 'PostToolUseFailure']);

/**
 * The world after one `dita.kelp-tank.hook` event's `data`. A parent session's `PreToolUse`
 * records its tool; a `PostToolUse` or `PostToolUseFailure` removes the latest start of that
 * tool. A subagent's call (`agentId` set), a session id other than the pane's, an unknown pane,
 * a subagent start or stop, and anything malformed return `world` itself.
 */
export function applyToolEvent(world: KelpiWorld, data: unknown): KelpiWorld {
    if (typeof data !== 'object' || data === null) return world;
    const { paneID, event, sessionId, agentId, toolName } = data as Record<string, unknown>;
    if (typeof paneID !== 'string' || typeof sessionId !== 'string') return world;
    if (typeof toolName !== 'string' || agentId !== null) return world;
    if (event !== 'PreToolUse' && !FINISHES.has(event as string)) return world;
    const pane = world.panes.find((candidate) => candidate.id === paneID);
    if (!pane || pane.agentSessionId !== sessionId) return world;

    const known = world.activity[paneID];
    const current: PaneActivity =
        known?.sessionId === sessionId ? known : { sessionId, tools: [], dozing: false };
    let tools: string[];
    if (event === 'PreToolUse') {
        tools = [...current.tools, toolName];
    } else {
        const index = current.tools.lastIndexOf(toolName);
        if (index < 0) return world;
        tools = current.tools.filter((_, i) => i !== index);
    }
    return { ...world, activity: { ...world.activity, [paneID]: { ...current, tools } } };
}

/** Kelpi's agent events that end or begin a turn: no tool can still be running after one. */
const TURN_EDGES = new Set(['stop', 'start', 'session-end', 'error']);

/**
 * The world after one of Kelpi's own `agent.event` events. A turn edge forgets the pane's tools;
 * `start` and `session-end` also wake it. Claude's `idle_prompt` reminder dozes a pane that is
 * waiting for input. Anything else, or an unknown pane, returns `world` itself.
 */
export function applyAgentEvent(world: KelpiWorld, event: AgentHookEvent): KelpiWorld {
    const pane = world.panes.find((candidate) => candidate.id === event.paneID);
    if (!pane) return world;
    const known = world.activity[pane.id];
    const current: PaneActivity =
        known?.sessionId === pane.agentSessionId
            ? known
            : { sessionId: pane.agentSessionId, tools: [], dozing: false };
    let next: PaneActivity;
    if (TURN_EDGES.has(event.type)) {
        const wakes = event.type === 'start' || event.type === 'session-end';
        next = { ...current, tools: [], dozing: wakes ? false : current.dozing };
    } else if (
        event.type === 'notification' &&
        event.notificationType === 'idle_prompt' &&
        event.status === 'waitingForInput'
    ) {
        next = { ...current, dozing: true };
    } else {
        return world;
    }
    return { ...world, activity: { ...world.activity, [pane.id]: next } };
}

/** `activity` with the pane's doze cleared, or `activity` itself when it was not dozing. */
export function wake(
    activity: Record<string, PaneActivity>,
    paneId: string,
): Record<string, PaneActivity> {
    const known = activity[paneId];
    if (!known?.dozing) return activity;
    return { ...activity, [paneId]: { ...known, dozing: false } };
}
