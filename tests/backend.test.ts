import { afterEach, describe, expect, it, vi } from 'vitest';
import { activate } from '../src/backend';
import type { AgentBook } from '../src/agents';
import type { AgentHookEvent, BackendApi, WorkspaceInfo } from '../src/kelpi-api';

const REPLY = 'Tide table done. Kestrel-marker-7. \nAwaiting you: 0 - nothing';

function fakeApi(workspaces: WorkspaceInfo[] = [], stored = new Map<string, unknown>()) {
    const handlers = new Map<string, (args?: unknown, context?: unknown) => Promise<unknown>>();
    const listeners: ((event: AgentHookEvent) => void)[] = [];
    const storageSet = vi.fn(async (key: string, value: unknown) => {
        stored.set(key, structuredClone(value));
    });
    const storageGet = vi.fn(async (key: string) => stored.get(key));
    const emit = vi.fn(async (name: string, data?: unknown) => ({ name, data }));
    const api = {
        commands: {
            register: (id: string, handler: () => Promise<unknown>) => {
                handlers.set(id, handler);
                return () => handlers.delete(id);
            },
        },
        workspaces: { list: async () => workspaces },
        agents: {
            onEvent: (listener: (event: AgentHookEvent) => void) => {
                listeners.push(listener);
                return () => listeners.splice(listeners.indexOf(listener), 1);
            },
        },
        storage: { get: storageGet, set: storageSet },
        emit,
    } as unknown as BackendApi;
    const hear = (event: Partial<AgentHookEvent>) =>
        listeners.forEach((listener) =>
            listener({
                type: 'stop',
                paneID: 'p1',
                workspaceID: 'w',
                agent: 'claude',
                status: 'waitingForInput',
                ...event,
            }),
        );
    return { api, handlers, hear, storageSet, storageGet, emit, stored };
}

afterEach(() => vi.restoreAllMocks());

describe('backend', () => {
    it('the summary command returns the workspace list', async () => {
        const workspaces = [{ id: 'w1', name: 'Kelp', paneCount: 2 }] as WorkspaceInfo[];
        const { api, handlers } = fakeApi(workspaces);

        activate(api);

        const summary = (await handlers.get('dita.kelp-tank.summary')?.()) as {
            workspaces: WorkspaceInfo[];
            generatedAt: string;
        };
        expect(summary.workspaces).toBe(workspaces);
        expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
    });

    it('the quiet command lists a pane after its footer-0 stop', async () => {
        const { api, handlers, hear } = fakeApi();
        activate(api);
        hear({ lastAssistantMessage: REPLY });
        hear({ paneID: 'p2', lastAssistantMessage: 'Need a choice.\nAwaiting you: 1 - which one' });
        const quiet = await handlers.get('dita.kelp-tank.quiet')?.();
        expect(quiet).toEqual({ panes: ['p1'] });
        hear({ type: 'start', status: 'running' });
        expect(await handlers.get('dita.kelp-tank.quiet')?.()).toEqual({ panes: [] });
    });

    it('the quiet command returns only pane ids, never the reply', async () => {
        const { api, handlers, hear } = fakeApi();
        activate(api);
        hear({ lastAssistantMessage: REPLY });
        const quiet = await handlers.get('dita.kelp-tank.quiet')?.();
        expect(JSON.stringify(quiet)).not.toContain('Kestrel');
        expect(Object.keys(quiet as object)).toEqual(['panes']);
    });

    it('the backend never stores or logs a reply', async () => {
        const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
            vi.spyOn(console, method).mockImplementation(() => {}),
        );
        const { api, hear, storageSet } = fakeApi();
        activate(api);
        hear({ lastAssistantMessage: REPLY });
        hear({ lastAssistantMessage: REPLY, lastAssistantMessageTruncated: true });
        expect(storageSet).not.toHaveBeenCalled();
        for (const spy of spies) {
            expect(JSON.stringify(spy.mock.calls)).not.toContain('Kestrel');
        }
    });
});

describe('the kelp-tank verb', () => {
    const PANE = { paneID: 'p1', workspaceID: 'w1', daemonID: 'd' };
    const START = ['SubagentStart', '--session', 's1', '--agent', 'a1'];
    const verb = (argv: string[]) => ({ argv, cwd: '/srv/demo', isTTY: false, json: false });
    const call = (
        handlers: ReturnType<typeof fakeApi>['handlers'],
        argv: string[],
        context: unknown = PANE,
    ) => handlers.get('dita.kelp-tank.hook')!(verb(argv), context);

    it('the hook verb records an agent, saves the book and emits both events', async () => {
        const { api, handlers, emit, stored } = fakeApi();
        activate(api);
        await call(handlers, START);
        const book = stored.get('babyAgents') as { revision: number; panes: AgentBook['panes'] };
        expect(Object.keys(book.panes.p1.agents)).toEqual(['a1']);
        expect(book.panes.p1.sessionId).toBe('s1');
        expect(emit.mock.calls.map(([name]) => name)).toEqual(['hook', 'agents']);
        expect(emit.mock.calls[0][1]).toEqual({
            paneID: 'p1',
            workspaceID: 'w1',
            event: 'SubagentStart',
            sessionId: 's1',
            agentId: 'a1',
            toolName: null,
            at: expect.any(Number),
        });
        expect(emit.mock.calls[1][1]).toEqual(book);
        expect(await handlers.get('dita.kelp-tank.agent-book')!()).toEqual(book);
    });

    it('a tool call that changes no agent emits only the hook event', async () => {
        const { api, handlers, emit, storageSet } = fakeApi();
        activate(api);
        await call(handlers, START);
        emit.mockClear();
        storageSet.mockClear();
        await call(handlers, ['PreToolUse', '--session', 's1', '--agent', 'a1', '--tool', 'Bash']);
        expect(emit.mock.calls.map(([name]) => name)).toEqual(['hook']);
        expect(emit.mock.calls[0][1]).toMatchObject({ agentId: 'a1', toolName: 'Bash' });
        expect(storageSet).not.toHaveBeenCalled();
    });

    it('the hook verb prints nothing on success', async () => {
        const { api, handlers } = fakeApi();
        activate(api);
        expect(await call(handlers, START)).toEqual({});
    });

    it('the hook verb rejects bad arguments with usage and changes nothing', async () => {
        const { api, handlers, emit, storageSet } = fakeApi();
        activate(api);
        for (const argv of [[], ['Notification', '--session', 's1'], ['SubagentStart']]) {
            const result = (await call(handlers, argv)) as {
                exitCode?: number;
                stderr?: string;
                text?: string;
            };
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('kelpi kelp-tank <Event> --session <id>');
            expect(result.text).toBeUndefined();
        }
        expect(emit).not.toHaveBeenCalled();
        expect(storageSet).not.toHaveBeenCalled();
    });

    it('the hook verb without a caller pane changes nothing', async () => {
        const { api, handlers, emit, storageSet } = fakeApi();
        activate(api);
        for (const context of [{ daemonID: 'd' }, { daemonID: 'd', paneID: '' }]) {
            expect(await call(handlers, START, context)).toEqual({});
        }
        expect(emit).not.toHaveBeenCalled();
        expect(storageSet).not.toHaveBeenCalled();
    });

    it('the hook command run from the palette changes nothing', async () => {
        const { api, handlers, emit, storageSet } = fakeApi();
        activate(api);
        expect(await handlers.get('dita.kelp-tank.hook')!({}, PANE)).toEqual({});
        expect(await handlers.get('dita.kelp-tank.hook')!(undefined, PANE)).toEqual({});
        expect(emit).not.toHaveBeenCalled();
        expect(storageSet).not.toHaveBeenCalled();
    });

    it('the hook verb picks up the book a restarted backend saved', async () => {
        const first = fakeApi();
        activate(first.api);
        await call(first.handlers, START);
        // A new backend over the same storage, as after Kelpi restarts the plugin.
        const second = fakeApi([], first.stored);
        activate(second.api);
        await call(second.handlers, ['SubagentStart', '--session', 's1', '--agent', 'a2']);
        const book = second.stored.get('babyAgents') as { panes: AgentBook['panes'] };
        expect(Object.keys(book.panes.p1.agents).sort()).toEqual(['a1', 'a2']);
    });

    it('the agent book command answers from storage before any hook call', async () => {
        const first = fakeApi();
        activate(first.api);
        await call(first.handlers, START);
        const second = fakeApi([], first.stored);
        activate(second.api);
        expect(await second.handlers.get('dita.kelp-tank.agent-book')!()).toEqual(
            first.stored.get('babyAgents'),
        );
    });

    it('an unreadable saved book starts empty and the verb still works', async () => {
        const { api, handlers, storageGet, stored } = fakeApi();
        storageGet.mockRejectedValue(new Error('disk'));
        activate(api);
        expect(await call(handlers, START)).toEqual({});
        const book = stored.get('babyAgents') as { panes: AgentBook['panes'] };
        expect(Object.keys(book.panes.p1.agents)).toEqual(['a1']);
    });
});
