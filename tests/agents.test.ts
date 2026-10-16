import { describe, expect, it } from 'vitest';
import {
    AGENT_TIMEOUT_MS,
    applyHook,
    EMPTY_BOOK,
    liveAgents,
    parseHookArgv,
    readBook,
    type AgentBook,
    type HookCall,
} from '../src/agents';

const T0 = 1_760_000_000_000;
const start = (agentId: string, sessionId = 's1'): HookCall => ({
    event: 'SubagentStart',
    sessionId,
    agentId,
    toolName: null,
});
const stop = (agentId: string, sessionId = 's1'): HookCall => ({
    event: 'SubagentStop',
    sessionId,
    agentId,
    toolName: null,
});
const tool = (agentId: string | null, sessionId = 's1'): HookCall => ({
    event: 'PreToolUse',
    sessionId,
    agentId,
    toolName: 'Bash',
});

/** Applies each call to pane `p1` in turn, at the time given beside it. */
function play(calls: [HookCall, number][], book: AgentBook = EMPTY_BOOK): AgentBook {
    return calls.reduce((current, [call, at]) => applyHook(current, call, 'p1', at).book, book);
}

describe('parseHookArgv', () => {
    it('reads the event, session, agent and tool from the verb arguments', () => {
        expect(
            parseHookArgv(['PreToolUse', '--session', 's1', '--agent', 'a1', '--tool', 'Bash']),
        ).toEqual({ event: 'PreToolUse', sessionId: 's1', agentId: 'a1', toolName: 'Bash' });
        expect(parseHookArgv(['SubagentStart', '--session', 's1', '--agent', 'a1'])).toEqual({
            event: 'SubagentStart',
            sessionId: 's1',
            agentId: 'a1',
            toolName: null,
        });
    });

    it('rejects an unknown event, a missing session, a bad id or a stray argument', () => {
        expect(parseHookArgv([])).toBeNull();
        expect(parseHookArgv(['Notification', '--session', 's1'])).toBeNull();
        expect(parseHookArgv(['PreToolUse'])).toBeNull();
        expect(parseHookArgv(['PreToolUse', '--session'])).toBeNull();
        expect(parseHookArgv(['PreToolUse', '--session', 'a b'])).toBeNull();
        expect(parseHookArgv(['PreToolUse', '--session', 's1', '--agent', 'x'.repeat(129)])).toBe(
            null,
        );
        expect(parseHookArgv(['PreToolUse', '--session', 's1', 'extra'])).toBeNull();
        expect(parseHookArgv(['PreToolUse', '--session', 's1', '--colour', 'red'])).toBeNull();
    });

    it('a start or a stop without an agent id is rejected', () => {
        expect(parseHookArgv(['SubagentStart', '--session', 's1'])).toBeNull();
        expect(parseHookArgv(['SubagentStop', '--session', 's1'])).toBeNull();
    });
});

describe('the agent book', () => {
    it('a start records the agent, and a stop removes only it', () => {
        const both = play([
            [start('a1'), T0],
            [start('a2'), T0 + 1000],
        ]);
        expect(liveAgents(both, 'p1', 's1', T0 + 2000)).toEqual(['a1', 'a2']);
        const one = play([[stop('a1'), T0 + 3000]], both);
        expect(liveAgents(one, 'p1', 's1', T0 + 3000)).toEqual(['a2']);
    });

    it('agents are listed oldest first, not by id', () => {
        const book = play([
            [start('zz'), T0],
            [start('aa'), T0 + 1000],
        ]);
        expect(liveAgents(book, 'p1', 's1', T0 + 2000)).toEqual(['zz', 'aa']);
    });

    it('a new session in the same pane starts with no baby fish', () => {
        const book = play([
            [start('a1', 'old'), T0],
            [start('a2', 'old'), T0],
        ]);
        expect(liveAgents(book, 'p1', 'new', T0)).toEqual([]);
        const restarted = play([[start('b1', 'new'), T0 + 1000]], book);
        expect(liveAgents(restarted, 'p1', 'new', T0 + 1000)).toEqual(['b1']);
        expect(liveAgents(restarted, 'p1', 'old', T0 + 1000)).toEqual([]);
    });

    it('an agent silent for exactly 20 minutes still has its baby fish', () => {
        const book = play([[start('a1'), T0]]);
        expect(AGENT_TIMEOUT_MS).toBe(20 * 60 * 1000);
        expect(liveAgents(book, 'p1', 's1', T0 + AGENT_TIMEOUT_MS)).toEqual(['a1']);
    });

    it('an agent silent for 20 minutes and 1 ms has no baby fish', () => {
        const book = play([[start('a1'), T0]]);
        expect(liveAgents(book, 'p1', 's1', T0 + AGENT_TIMEOUT_MS + 1)).toEqual([]);
    });

    it('a tool call inside an agent keeps its baby fish alive', () => {
        const book = play([
            [start('a1'), T0],
            [tool('a1'), T0 + 15 * 60 * 1000],
        ]);
        expect(liveAgents(book, 'p1', 's1', T0 + 30 * 60 * 1000)).toEqual(['a1']);
    });

    it("the parent's own tool call refreshes no agent", () => {
        const book = play([
            [start('a1'), T0],
            [tool(null), T0 + 15 * 60 * 1000],
        ]);
        expect(liveAgents(book, 'p1', 's1', T0 + 30 * 60 * 1000)).toEqual([]);
    });

    it('a tool call from an unknown agent adds no baby fish', () => {
        const book = play([[tool('ghost'), T0]]);
        expect(liveAgents(book, 'p1', 's1', T0)).toEqual([]);
    });

    it('a tool call from another session changes nothing', () => {
        const before = play([[start('a1'), T0]]);
        const result = applyHook(before, tool('a1', 'other'), 'p1', T0 + 5 * 60 * 1000);
        expect(result.changed).toBe(false);
        expect(result.book).toEqual(before);
    });

    it('another pane keeps its own agents', () => {
        const book = applyHook(play([[start('a1'), T0]]), start('b1'), 'p2', T0).book;
        expect(liveAgents(book, 'p1', 's1', T0)).toEqual(['a1']);
        expect(liveAgents(book, 'p2', 's1', T0)).toEqual(['b1']);
        expect(liveAgents(book, 'p3', 's1', T0)).toEqual([]);
    });
});

describe('when the book needs saving', () => {
    it('a start, a stop and a prune each change the book and bump its revision', () => {
        const started = applyHook(EMPTY_BOOK, start('a1'), 'p1', T0);
        expect(started.changed).toBe(true);
        expect(started.book.revision).toBe(EMPTY_BOOK.revision + 1);
        const stopped = applyHook(started.book, stop('a1'), 'p1', T0 + 1000);
        expect(stopped.changed).toBe(true);
        expect(stopped.book.revision).toBe(started.book.revision + 1);
        expect(stopped.book.panes).toEqual({});
        const pruned = applyHook(started.book, tool(null), 'p1', T0 + AGENT_TIMEOUT_MS + 1);
        expect(pruned.changed).toBe(true);
        expect(pruned.book.panes).toEqual({});
    });

    it('a tool call changes the book only once a minute has passed since it was saved', () => {
        const started = applyHook(EMPTY_BOOK, start('a1'), 'p1', T0).book;
        const soon = applyHook(started, tool('a1'), 'p1', T0 + 59_999);
        expect(soon.changed).toBe(false);
        expect(soon.book).toBe(started);
        const later = applyHook(started, tool('a1'), 'p1', T0 + 60_000);
        expect(later.changed).toBe(true);
        expect(later.book.panes.p1.agents.a1.lastSeen).toBe(T0 + 60_000);
    });

    it('a stop for an agent the book does not hold changes nothing', () => {
        const result = applyHook(EMPTY_BOOK, stop('a1'), 'p1', T0);
        expect(result.changed).toBe(false);
    });
});

describe('readBook', () => {
    it('a missing or malformed saved book reads as empty', () => {
        for (const saved of [
            undefined,
            null,
            'book',
            42,
            {},
            { revision: 'x', panes: {} },
            { revision: 1, panes: [] },
        ]) {
            expect(readBook(saved)).toEqual(EMPTY_BOOK);
        }
    });

    it('a saved book reads back as it was, without malformed agents', () => {
        const book = play([
            [start('a1'), T0],
            [start('a2'), T0 + 1],
        ]);
        expect(readBook(JSON.parse(JSON.stringify(book)))).toEqual(book);
        const damaged = {
            revision: 3,
            panes: {
                p1: {
                    sessionId: 's1',
                    agents: { a1: { startedAt: T0, lastSeen: T0 }, a2: { startedAt: 'x' } },
                },
                p2: { sessionId: 7, agents: {} },
            },
        };
        expect(readBook(damaged)).toEqual({
            revision: 3,
            panes: { p1: { sessionId: 's1', agents: { a1: { startedAt: T0, lastSeen: T0 } } } },
        });
    });
});
