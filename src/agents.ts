/**
 * The agent book: which background agents each Claude session is running, from the Kelp Tank
 * Claude hook (`claude-hook/kelp-tank-hook.mjs`, through `kelpi kelp-tank`). Each live agent is a
 * baby fish beside its session's creature. Pure logic; the backend keeps the book and saves it in
 * plugin storage (`babyAgents`), and the view decides from it.
 */

/** An agent with no start, stop or tool call for longer than this has no baby fish. */
export const AGENT_TIMEOUT_MS = 20 * 60 * 1000;

/** A tool call refreshes an agent's `lastSeen` only when it moves by this much, so storage is written at most once a minute per busy agent. */
const REFRESH_MS = 60 * 1000;

/** Every id the hook forwards, and the verb accepts, must match this. */
export const HOOK_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** `PostToolUseFailure` is Claude's end of a tool call that failed, which sends no `PostToolUse`. */
export const HOOK_EVENTS = [
    'SubagentStart',
    'SubagentStop',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** One `kelpi kelp-tank` call. `agentId` is null for the parent session's own tool calls. */
export interface HookCall {
    event: HookEvent;
    sessionId: string;
    agentId: string | null;
    toolName: string | null;
}

export interface BookAgent {
    startedAt: number;
    lastSeen: number;
}

/** Per pane: the session the agents belong to, and its agents by id. */
export interface AgentBook {
    /** Goes up by one on every change, so the view keeps the newer of two books. */
    revision: number;
    panes: Record<string, { sessionId: string; agents: Record<string, BookAgent> }>;
}

export const EMPTY_BOOK: AgentBook = { revision: 0, panes: {} };

const FLAGS = { '--session': 'sessionId', '--agent': 'agentId', '--tool': 'toolName' } as const;

/**
 * Reads `kelpi kelp-tank <Event> --session <id> [--agent <id>] [--tool <name>]`. Null for anything
 * else: an unknown event, a missing session, a value failing `HOOK_ID`, a repeated or unknown
 * flag, or a start or stop without an agent.
 */
export function parseHookArgv(argv: readonly string[]): HookCall | null {
    const [event, ...rest] = argv;
    if (!(HOOK_EVENTS as readonly string[]).includes(event)) return null;
    const values: Partial<Record<(typeof FLAGS)[keyof typeof FLAGS], string>> = {};
    for (let i = 0; i < rest.length; i += 2) {
        const key = FLAGS[rest[i] as keyof typeof FLAGS];
        const value = rest[i + 1];
        if (!key || key in values || value === undefined || !HOOK_ID.test(value)) return null;
        values[key] = value;
    }
    if (values.sessionId === undefined) return null;
    const agentId = values.agentId ?? null;
    if ((event === 'SubagentStart' || event === 'SubagentStop') && agentId === null) return null;
    return {
        event: event as HookEvent,
        sessionId: values.sessionId,
        agentId,
        toolName: values.toolName ?? null,
    };
}

const expired = (agent: BookAgent, now: number) => now - agent.lastSeen > AGENT_TIMEOUT_MS;

/** The book without timed-out agents and empty panes, or `book` itself when none were dropped. */
export function dropExpired(book: AgentBook, now: number): AgentBook {
    let dropped = false;
    const panes: AgentBook['panes'] = {};
    for (const [paneId, entry] of Object.entries(book.panes)) {
        const agents = Object.fromEntries(
            Object.entries(entry.agents).filter(([, agent]) => !expired(agent, now)),
        );
        if (Object.keys(agents).length !== Object.keys(entry.agents).length) dropped = true;
        if (Object.keys(agents).length === 0) dropped = true;
        else panes[paneId] = { sessionId: entry.sessionId, agents };
    }
    return dropped ? { revision: book.revision, panes } : book;
}

/**
 * The book after `call` from `paneId` at `now`. A start adds its agent, and a start from a new
 * session id replaces the pane's old agents. A stop removes its agent. A tool call from a known
 * agent refreshes it. Every call also drops timed-out agents. `changed` says the book needs
 * saving and sending; when it is false, `book` is the one passed in.
 */
export function applyHook(
    book: AgentBook,
    call: HookCall,
    paneId: string,
    now: number,
): { book: AgentBook; changed: boolean } {
    const pruned = dropExpired(book, now);
    const panes = { ...pruned.panes };
    const entry = panes[paneId];
    const ours = entry?.sessionId === call.sessionId ? entry : undefined;
    const agent = call.agentId === null ? undefined : ours?.agents[call.agentId];
    let touched = false;
    if (call.event === 'SubagentStart' && call.agentId !== null) {
        const agents = { ...ours?.agents };
        agents[call.agentId] = { startedAt: agent?.startedAt ?? now, lastSeen: now };
        panes[paneId] = { sessionId: call.sessionId, agents };
        touched = true;
    } else if (call.event === 'SubagentStop' && ours && agent) {
        const agents = { ...ours.agents };
        delete agents[call.agentId!];
        if (Object.keys(agents).length === 0) delete panes[paneId];
        else panes[paneId] = { sessionId: ours.sessionId, agents };
        touched = true;
    } else if (ours && agent && now - agent.lastSeen >= REFRESH_MS) {
        const agents = { ...ours.agents, [call.agentId!]: { ...agent, lastSeen: now } };
        panes[paneId] = { sessionId: ours.sessionId, agents };
        touched = true;
    }
    if (!touched && pruned === book) return { book, changed: false };
    return { book: { revision: book.revision + 1, panes }, changed: true };
}

/** The live agents of `sessionId` in `paneId` at `now`, oldest first. */
export function liveAgents(
    book: AgentBook,
    paneId: string,
    sessionId: string,
    now: number,
): string[] {
    const entry = book.panes[paneId];
    if (!entry || entry.sessionId !== sessionId) return [];
    return Object.entries(entry.agents)
        .filter(([, agent]) => !expired(agent, now))
        .sort(([idA, a], [idB, b]) => a.startedAt - b.startedAt || (idA < idB ? -1 : 1))
        .map(([id]) => id);
}

/** True when the book holds at least one agent. */
export function hasAgents(book: AgentBook): boolean {
    return Object.keys(book.panes).length > 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A saved or sent book, checked. Anything malformed reads as empty; a malformed agent or pane is dropped. */
export function readBook(saved: unknown): AgentBook {
    if (!isRecord(saved) || typeof saved.revision !== 'number' || !isRecord(saved.panes)) {
        return EMPTY_BOOK;
    }
    const panes: AgentBook['panes'] = {};
    for (const [paneId, entry] of Object.entries(saved.panes)) {
        if (!isRecord(entry) || typeof entry.sessionId !== 'string' || !isRecord(entry.agents)) {
            continue;
        }
        const agents: Record<string, BookAgent> = {};
        for (const [id, agent] of Object.entries(entry.agents)) {
            if (
                isRecord(agent) &&
                typeof agent.startedAt === 'number' &&
                typeof agent.lastSeen === 'number'
            ) {
                agents[id] = { startedAt: agent.startedAt, lastSeen: agent.lastSeen };
            }
        }
        if (Object.keys(agents).length > 0) panes[paneId] = { sessionId: entry.sessionId, agents };
    }
    return { revision: saved.revision, panes };
}
