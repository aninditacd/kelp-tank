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
    /** Each background agent's running tools, oldest start first, by agent id. */
    agents: Record<string, string[]>;
}

const fresh = (sessionId: string | null): PaneActivity => ({
    sessionId,
    tools: [],
    dozing: false,
    agents: {},
});

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
 * The world after one `dita.kelp-tank.hook` event's `data`. A `PreToolUse` records its tool; a
 * `PostToolUse` or `PostToolUseFailure` removes the latest start of that tool. A call with an
 * `agentId` does this for that agent's tools, never the parent's, and a `SubagentStop` forgets
 * that agent's tools. A session id other than the pane's, an unknown pane, a subagent start and
 * anything malformed return `world` itself.
 */
export function applyToolEvent(world: KelpiWorld, data: unknown): KelpiWorld {
    if (typeof data !== 'object' || data === null) return world;
    const { paneID, sessionId } = data as Record<string, unknown>;
    const pane = world.panes.find((candidate) => candidate.id === paneID);
    if (!pane || pane.agentSessionId !== sessionId) return world;
    const activity = recordTool(world.activity, data);
    return activity === world.activity ? world : { ...world, activity };
}

/**
 * `activity` after one hook event's `data`, with no world to check the pane against: the backend
 * keeps this for a new page. The rules are `applyToolEvent`'s; a tool call under a session id
 * other than the pane's recorded one starts it afresh. Returns `activity` itself when nothing changes.
 */
export function recordTool(
    activity: Record<string, PaneActivity>,
    data: unknown,
): Record<string, PaneActivity> {
    if (typeof data !== 'object' || data === null) return activity;
    const { paneID, event, sessionId, agentId, toolName } = data as Record<string, unknown>;
    if (typeof paneID !== 'string' || typeof sessionId !== 'string') return activity;
    if (agentId !== null && typeof agentId !== 'string') return activity;

    const known = activity[paneID];
    const current = known?.sessionId === sessionId ? known : fresh(sessionId);
    if (event === 'SubagentStop' && agentId !== null) {
        if (!Object.hasOwn(current.agents, agentId)) return activity;
        const agents = { ...current.agents };
        delete agents[agentId];
        return { ...activity, [paneID]: { ...current, agents } };
    }
    if (typeof toolName !== 'string') return activity;
    if (event !== 'PreToolUse' && !FINISHES.has(event as string)) return activity;

    const running = agentId === null ? current.tools : (current.agents[agentId] ?? []);
    let tools: string[];
    if (event === 'PreToolUse') {
        tools = [...running, toolName];
    } else {
        const index = running.lastIndexOf(toolName);
        if (index < 0) return activity;
        tools = running.filter((_, i) => i !== index);
    }
    const next: PaneActivity =
        agentId === null
            ? { ...current, tools }
            : { ...current, agents: { ...current.agents, [agentId]: tools } };
    return { ...activity, [paneID]: next };
}

/** Kelpi's agent events that end or begin a turn: no tool can still be running after one. */
const TURN_EDGES = new Set(['stop', 'start', 'session-end', 'error']);

/**
 * The world after one of Kelpi's own `agent.event` events. A turn edge forgets the pane's own
 * tools; `start` and `session-end` also wake it. Background agents outlive their parent's turn,
 * so only `session-end` forgets their tools. Claude's `idle_prompt` reminder dozes a pane that is
 * waiting for input. Anything else, or an unknown pane, returns `world` itself.
 */
export function applyAgentEvent(world: KelpiWorld, event: AgentHookEvent): KelpiWorld {
    const pane = world.panes.find((candidate) => candidate.id === event.paneID);
    if (!pane) return world;
    const activity = recordAgentEvent(world.activity, pane.agentSessionId, event);
    return activity === world.activity ? world : { ...world, activity };
}

/**
 * `activity` after one of Kelpi's agent events for the pane `event.paneID`, whose session is
 * `sessionId`, with `applyAgentEvent`'s rules. Returns `activity` itself when nothing changes.
 */
export function recordAgentEvent(
    activity: Record<string, PaneActivity>,
    sessionId: string | null,
    event: AgentHookEvent,
): Record<string, PaneActivity> {
    const known = activity[event.paneID];
    const current = known?.sessionId === sessionId ? known : fresh(sessionId);
    let next: PaneActivity;
    if (TURN_EDGES.has(event.type)) {
        const wakes = event.type === 'start' || event.type === 'session-end';
        next = {
            ...current,
            tools: [],
            dozing: wakes ? false : current.dozing,
            agents: event.type === 'session-end' ? {} : current.agents,
        };
    } else if (
        event.type === 'notification' &&
        event.notificationType === 'idle_prompt' &&
        event.status === 'waitingForInput'
    ) {
        next = { ...current, dozing: true };
    } else {
        return activity;
    }
    return { ...activity, [event.paneID]: next };
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

/** The backend's answer to `dita.kelp-tank.activity`: every pane's activity, and the last event it covers. */
export interface ActivityAnswer {
    epoch: string | null;
    sequence: number;
    panes: Record<string, PaneActivity>;
}

const NO_ANSWER: ActivityAnswer = { epoch: null, sequence: -1, panes: {} };

const isToolList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((tool) => typeof tool === 'string');

function isPaneActivity(value: unknown): value is PaneActivity {
    if (typeof value !== 'object' || value === null) return false;
    const { sessionId, tools, dozing, agents } = value as Record<string, unknown>;
    return (
        (typeof sessionId === 'string' || sessionId === null) &&
        isToolList(tools) &&
        typeof dozing === 'boolean' &&
        typeof agents === 'object' &&
        agents !== null &&
        !Array.isArray(agents) &&
        Object.values(agents).every(isToolList)
    );
}

/** The backend's answer, checked: malformed entries are dropped, and a malformed answer covers nothing. */
export function readActivity(answer: unknown): ActivityAnswer {
    if (typeof answer !== 'object' || answer === null) return NO_ANSWER;
    const { epoch, sequence, panes } = answer as Record<string, unknown>;
    if (typeof epoch !== 'string' || typeof sequence !== 'number') return NO_ANSWER;
    if (typeof panes !== 'object' || panes === null || Array.isArray(panes)) return NO_ANSWER;
    return {
        epoch,
        sequence,
        panes: Object.fromEntries(
            Object.entries(panes).filter(([, entry]) => isPaneActivity(entry)),
        ),
    };
}

/**
 * `world` with the backend's `panes` as its activity, for a new page. A pane that left
 * `waitingForInput` while no page was open (a focus clears it to `idle`) is woken, as
 * `applyChanges` would have woken it.
 */
export function seedActivity(world: KelpiWorld, panes: Record<string, PaneActivity>): KelpiWorld {
    let activity = panes;
    for (const pane of world.panes) {
        if (pane.status !== 'waitingForInput') activity = wake(activity, pane.id);
    }
    return { ...world, activity };
}
