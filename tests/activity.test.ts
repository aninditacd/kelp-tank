import { describe, expect, it } from 'vitest';
import {
    activityForTool,
    applyAgentEvent,
    applyToolEvent,
    readActivity,
    recordAgentEvent,
    recordTool,
    seedActivity,
} from '../src/activity';
import type { AgentHookEvent } from '../src/kelpi-api';
import { applyChanges, type KelpiWorld, type WorldPane } from '../src/kelpi-world';

const PANE = 'P1';
const SESSION = 'session-1';

function pane(overrides: Partial<WorldPane> = {}): WorldPane {
    return {
        id: PANE,
        workspaceId: 'A',
        label: null,
        title: '✳ harbour-fish',
        status: 'running',
        agentKind: 'claude',
        agentSessionId: SESSION,
        agentStartedAt: 1_000,
        ...overrides,
    };
}

function world(panes: WorldPane[] = [pane()]): KelpiWorld {
    return {
        workspaces: [{ id: 'A', name: 'Harbour', color: 'green', muted: false }],
        panes,
        topLevelOrder: [],
        groups: {},
        activity: {},
    };
}

/** A `dita.kelp-tank.hook` event's data, as the backend emits it. */
function hook(event: string, toolName: string | null, overrides: Record<string, unknown> = {}) {
    return {
        paneID: PANE,
        workspaceID: 'A',
        event,
        sessionId: SESSION,
        agentId: null,
        toolName,
        at: 5_000,
        ...overrides,
    };
}

function agentEvent(overrides: Partial<AgentHookEvent>): AgentHookEvent {
    return {
        type: 'stop',
        paneID: PANE,
        workspaceID: 'A',
        agent: 'claude',
        status: 'waitingForInput',
        ...overrides,
    };
}

const tools = (w: KelpiWorld) => w.activity[PANE]?.tools ?? [];
const dozing = (w: KelpiWorld) => w.activity[PANE]?.dozing ?? false;

describe('activityForTool', () => {
    it('maps each named tool to its group', () => {
        for (const tool of ['Read', 'Grep', 'Glob']) expect(activityForTool(tool)).toBe('read');
        for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
            expect(activityForTool(tool)).toBe('edit');
        }
        expect(activityForTool('Bash')).toBe('command');
        expect(activityForTool('WebSearch')).toBe('web');
        expect(activityForTool('WebFetch')).toBe('web');
        expect(activityForTool('Agent')).toBe('agent');
        expect(activityForTool('Task')).toBe('agent');
    });

    it('gives no group to any other tool', () => {
        expect(activityForTool('TodoWrite')).toBeNull();
        expect(activityForTool('mcp__x__y')).toBeNull();
        expect(activityForTool('read')).toBeNull();
    });
});

describe('applyToolEvent', () => {
    it("a parent PreToolUse with the pane's session id records the tool", () => {
        expect(tools(applyToolEvent(world(), hook('PreToolUse', 'Read')))).toEqual(['Read']);
    });

    it('a PostToolUse forgets the tool it finished', () => {
        const started = applyToolEvent(world(), hook('PreToolUse', 'Read'));
        expect(tools(applyToolEvent(started, hook('PostToolUse', 'Read')))).toEqual([]);
    });

    it('a PostToolUseFailure forgets the tool that failed', () => {
        const started = applyToolEvent(world(), hook('PreToolUse', 'Bash'));
        expect(tools(applyToolEvent(started, hook('PostToolUseFailure', 'Bash')))).toEqual([]);
    });

    it('finishing a tool removes its latest start and keeps the others in order', () => {
        let w = world();
        for (const name of ['Read', 'Bash', 'Read'])
            w = applyToolEvent(w, hook('PreToolUse', name));
        w = applyToolEvent(w, hook('PostToolUse', 'Read'));
        expect(tools(w)).toEqual(['Read', 'Bash']);
        w = applyToolEvent(w, hook('PostToolUse', 'Read'));
        expect(tools(w)).toEqual(['Bash']);
    });

    it('a finish for a tool that is not running changes nothing', () => {
        const started = applyToolEvent(world(), hook('PreToolUse', 'Read'));
        expect(applyToolEvent(started, hook('PostToolUse', 'Bash'))).toBe(started);
    });

    it('a tool call from another session id is ignored', () => {
        const w = world();
        expect(applyToolEvent(w, hook('PreToolUse', 'Bash', { sessionId: 'old-session' }))).toBe(w);
    });

    it('a tool call for a pane the world does not hold is ignored', () => {
        const w = world();
        expect(applyToolEvent(w, hook('PreToolUse', 'Bash', { paneID: 'P9' }))).toBe(w);
    });

    it('malformed data and subagent start and stop change nothing', () => {
        // Bash is running, so an event wrongly read as its finish would show.
        const w = applyToolEvent(world(), hook('PreToolUse', 'Bash'));
        for (const data of [
            null,
            'PreToolUse',
            [],
            hook('PreToolUse', null),
            hook('PostToolUse', null),
            hook('PreToolUse', 'Bash', { paneID: undefined }),
            hook('PreToolUse', 'Bash', { sessionId: 7 }),
            hook('PreToolUse', 'Bash', { agentId: 7 }),
            hook('SubagentStart', null, { agentId: 'a1' }),
            hook('SubagentStop', null, { agentId: 'a1' }),
            hook('Elsewhere', 'Bash'),
        ]) {
            expect(applyToolEvent(w, data)).toBe(w);
        }
    });

    it('a tool call under a new session id starts afresh', () => {
        const old = applyToolEvent(world(), hook('PreToolUse', 'Read'));
        const moved = { ...old, panes: [pane({ agentSessionId: 'session-2' })] };
        const next = applyToolEvent(moved, hook('PreToolUse', 'Bash', { sessionId: 'session-2' }));
        expect(next.activity[PANE]).toEqual({
            sessionId: 'session-2',
            tools: ['Bash'],
            dozing: false,
            agents: {},
        });
    });
});

describe('applyAgentEvent', () => {
    const running = () => applyToolEvent(world(), hook('PreToolUse', 'Edit'));

    for (const type of ['stop', 'start', 'session-end', 'error'] as const) {
        it(`a ${type} event forgets every running tool`, () => {
            expect(tools(applyAgentEvent(running(), agentEvent({ type })))).toEqual([]);
        });
    }

    it('a permission prompt notification keeps the running tool', () => {
        const event = agentEvent({ type: 'notification', notificationType: 'permission_prompt' });
        expect(tools(applyAgentEvent(running(), event))).toEqual(['Edit']);
    });

    it('an idle_prompt dozes a waiting pane', () => {
        const waiting = world([pane({ status: 'waitingForInput' })]);
        const event = agentEvent({ type: 'notification', notificationType: 'idle_prompt' });
        expect(dozing(applyAgentEvent(waiting, event))).toBe(true);
    });

    it('an idle_prompt does not doze a pane that is not waiting', () => {
        const event = agentEvent({
            type: 'notification',
            notificationType: 'idle_prompt',
            status: 'running',
        });
        expect(dozing(applyAgentEvent(world(), event))).toBe(false);
    });

    for (const type of ['start', 'session-end'] as const) {
        it(`a ${type} event wakes a dozing pane`, () => {
            const waiting = world([pane({ status: 'waitingForInput' })]);
            const dozed = applyAgentEvent(
                waiting,
                agentEvent({ type: 'notification', notificationType: 'idle_prompt' }),
            );
            expect(dozing(applyAgentEvent(dozed, agentEvent({ type })))).toBe(false);
        });
    }

    it('the pane leaving waitingForInput wakes it', () => {
        const waiting = world([pane({ status: 'waitingForInput' })]);
        const dozed = applyAgentEvent(
            waiting,
            agentEvent({ type: 'notification', notificationType: 'idle_prompt' }),
        );
        const change = {
            kind: 'agent-status-changed',
            workspaceID: 'A',
            paneID: PANE,
            status: 'running',
            agentSessionID: SESSION,
            agentKind: 'claude',
            agentStartedAt: 9_000,
        };
        expect(dozing(applyChanges(dozed, [change]))).toBe(false);
    });

    it('a status change that stays waiting keeps the doze', () => {
        const waiting = world([pane({ status: 'waitingForInput' })]);
        const dozed = applyAgentEvent(
            waiting,
            agentEvent({ type: 'notification', notificationType: 'idle_prompt' }),
        );
        const change = {
            kind: 'agent-status-changed',
            workspaceID: 'A',
            paneID: PANE,
            status: 'waitingForInput',
            agentSessionID: SESSION,
            agentKind: 'claude',
            agentStartedAt: null,
        };
        expect(dozing(applyChanges(dozed, [change]))).toBe(true);
    });

    it('an event for a pane the world does not hold changes nothing', () => {
        const w = running();
        expect(applyAgentEvent(w, agentEvent({ type: 'stop', paneID: 'P9' }))).toBe(w);
    });
});

describe('recordTool and recordAgentEvent', () => {
    it('recordTool records a parent tool with no world', () => {
        const started = recordTool({}, hook('PreToolUse', 'Bash'));
        expect(started).toEqual({
            [PANE]: { sessionId: SESSION, tools: ['Bash'], dozing: false, agents: {} },
        });
        expect(recordTool(started, hook('PostToolUse', 'Bash'))[PANE].tools).toEqual([]);
        // Malformed data changes nothing.
        expect(recordTool(started, null)).toBe(started);
    });

    it('recordAgentEvent dozes on idle_prompt and a start wakes it', () => {
        const idle = agentEvent({ type: 'notification', notificationType: 'idle_prompt' });
        const dozed = recordAgentEvent({}, SESSION, idle);
        expect(dozed[PANE]).toEqual({ sessionId: SESSION, tools: [], dozing: true, agents: {} });
        const woke = recordAgentEvent(
            dozed,
            SESSION,
            agentEvent({ type: 'start', status: 'running' }),
        );
        expect(woke[PANE].dozing).toBe(false);
    });
});

describe('readActivity and seedActivity', () => {
    const entry = { sessionId: SESSION, tools: ['Bash'], dozing: true, agents: { a1: ['Read'] } };

    it('readActivity keeps well-formed entries and drops the rest', () => {
        expect(
            readActivity({
                epoch: 'e1',
                sequence: 12,
                panes: {
                    [PANE]: entry,
                    P2: { sessionId: null, tools: [], dozing: false, agents: {} },
                    P3: { sessionId: SESSION, tools: [7], dozing: false, agents: {} },
                    P4: { sessionId: SESSION, tools: [], dozing: 'yes', agents: {} },
                    P5: null,
                },
            }),
        ).toEqual({
            epoch: 'e1',
            sequence: 12,
            panes: { [PANE]: entry, P2: { sessionId: null, tools: [], dozing: false, agents: {} } },
        });
        const empty = { epoch: null, sequence: -1, panes: {} };
        for (const answer of [undefined, null, 'x', { epoch: 3, sequence: 1, panes: {} }]) {
            expect(readActivity(answer)).toEqual(empty);
        }
        expect(readActivity({ epoch: 'e1', sequence: '9', panes: {} })).toEqual(empty);
        expect(readActivity({ epoch: 'e1', sequence: 9, panes: [] })).toEqual(empty);
    });

    it('seedActivity clears the doze of a pane that is no longer waiting', () => {
        const waiting = seedActivity(world([pane({ status: 'waitingForInput' })]), {
            [PANE]: entry,
        });
        expect(waiting.activity[PANE]).toEqual(entry);
        const focused = seedActivity(world([pane({ status: 'idle' })]), { [PANE]: entry });
        expect(focused.activity[PANE]).toEqual({ ...entry, dozing: false });
        expect(focused.panes).toEqual([pane({ status: 'idle' })]);
    });
});

describe("a subagent's tools", () => {
    const agentTools = (w: KelpiWorld, agentId: string) => w.activity[PANE]?.agents[agentId];
    const sub = (event: string, toolName: string | null, agentId = 'a1') =>
        hook(event, toolName, { agentId });

    it("a subagent's PreToolUse records the tool under its agent, not the parent", () => {
        const parent = applyToolEvent(world(), hook('PreToolUse', 'Agent'));
        const w = applyToolEvent(parent, sub('PreToolUse', 'Bash'));
        expect(agentTools(w, 'a1')).toEqual(['Bash']);
        expect(tools(w)).toEqual(['Agent']);
    });

    it("a subagent's finish removes its latest start from that agent only, with a repeated tool", () => {
        let w = applyToolEvent(world(), hook('PreToolUse', 'Bash'));
        for (const tool of ['Bash', 'Read', 'Bash']) w = applyToolEvent(w, sub('PreToolUse', tool));
        w = applyToolEvent(w, sub('PreToolUse', 'Bash', 'a2'));
        w = applyToolEvent(w, sub('PostToolUse', 'Bash'));
        expect(agentTools(w, 'a1')).toEqual(['Bash', 'Read']);
        expect(agentTools(w, 'a2')).toEqual(['Bash']);
        expect(tools(w)).toEqual(['Bash']);
        // A finish for a tool the agent is not running changes nothing.
        expect(applyToolEvent(w, sub('PostToolUse', 'Edit'))).toBe(w);
    });

    it("a PostToolUseFailure from a subagent forgets that agent's tool", () => {
        const w = applyToolEvent(world(), sub('PreToolUse', 'Bash'));
        expect(agentTools(applyToolEvent(w, sub('PostToolUseFailure', 'Bash')), 'a1')).toEqual([]);
    });

    it("a SubagentStop forgets that agent's tools", () => {
        let w = applyToolEvent(world(), sub('PreToolUse', 'Bash'));
        w = applyToolEvent(w, sub('PreToolUse', 'Read', 'a2'));
        w = applyToolEvent(w, sub('SubagentStop', null));
        expect(w.activity[PANE].agents).toEqual({ a2: ['Read'] });
    });

    it('a SubagentStart changes nothing in the activity record', () => {
        const w = applyToolEvent(world(), hook('PreToolUse', 'Bash'));
        expect(applyToolEvent(w, sub('SubagentStart', null))).toBe(w);
        const record = w.activity;
        expect(recordTool(record, sub('SubagentStart', null))).toBe(record);
    });

    it("the parent's stop, start and error keep every agent's tools", () => {
        for (const type of ['stop', 'start', 'error'] as const) {
            let w = applyToolEvent(world(), hook('PreToolUse', 'Read'));
            w = applyToolEvent(w, sub('PreToolUse', 'Bash'));
            w = applyAgentEvent(w, agentEvent({ type }));
            expect(tools(w), type).toEqual([]);
            expect(agentTools(w, 'a1'), type).toEqual(['Bash']);
        }
    });

    it("session-end forgets every agent's tools", () => {
        const w = applyToolEvent(world(), sub('PreToolUse', 'Bash'));
        const ended = applyAgentEvent(w, agentEvent({ type: 'session-end' }));
        expect(ended.activity[PANE].agents).toEqual({});
    });

    it("a subagent's tool call under a new session id starts afresh", () => {
        const old = applyToolEvent(world(), sub('PreToolUse', 'Read'));
        const moved = { ...old, panes: [pane({ agentSessionId: 'session-2' })] };
        const next = applyToolEvent(moved, sub('PreToolUse', 'Bash', 'a9'));
        expect(next).toBe(moved);
        const fresh = applyToolEvent(
            moved,
            hook('PreToolUse', 'Bash', { agentId: 'a9', sessionId: 'session-2' }),
        );
        expect(fresh.activity[PANE].agents).toEqual({ a9: ['Bash'] });
    });

    it('readActivity keeps well-formed agents and drops an entry with malformed agents', () => {
        const good = { sessionId: SESSION, tools: [], dozing: false, agents: { a1: ['Bash'] } };
        expect(
            readActivity({
                epoch: 'e1',
                sequence: 1,
                panes: {
                    [PANE]: good,
                    P2: { sessionId: SESSION, tools: [], dozing: false },
                    P3: { sessionId: SESSION, tools: [], dozing: false, agents: { a1: [7] } },
                    P4: { sessionId: SESSION, tools: [], dozing: false, agents: ['Bash'] },
                    P5: { sessionId: SESSION, tools: [], dozing: false, agents: null },
                },
            }).panes,
        ).toEqual({ [PANE]: good });
    });
});
