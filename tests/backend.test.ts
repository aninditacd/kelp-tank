import { afterEach, describe, expect, it, vi } from 'vitest';
import { activate } from '../src/backend';
import type { AgentBook } from '../src/agents';
import { SORT_DELAY_MS } from '../src/auto-sort';
import type {
    AgentHookEvent,
    BackendApi,
    PluginEvent,
    Snapshot,
    SnapshotPane,
    WorkspaceInfo,
} from '../src/kelpi-api';

const REPLY = 'Tide table done. Kestrel-marker-7. \nAwaiting you: 0 - nothing';

/** A snapshot of top-level workspaces in this order, each with one Claude pane of the given status. */
function snapshotOf(workspaces: [id: string, status: SnapshotPane['status'] | null][]): Snapshot {
    return {
        epoch: 'e1',
        sequence: 1,
        state: {
            workspaces: workspaces.map(([id, status]) => ({
                id,
                name: id,
                color: 'blue',
                muted: false,
                parkedPanes: [],
                panes:
                    status === null
                        ? []
                        : [
                              {
                                  id: 'pane-' + id,
                                  type: 'terminal',
                                  title: '✳ fish-' + id,
                                  label: null,
                                  status,
                                  agentKind: 'claude',
                                  agentSessionID: 'session-' + id,
                              },
                          ],
            })),
            topLevelOrder: workspaces.map(([id]) => ({ kind: 'workspace' as const, id })),
            groups: [],
        },
    };
}

function fakeApi(
    workspaces: WorkspaceInfo[] = [],
    stored = new Map<string, unknown>(),
    sidebar: Snapshot = snapshotOf([]),
) {
    const stateListeners: ((event: PluginEvent) => void)[] = [];
    const gapListeners: ((event: PluginEvent) => void)[] = [];
    const snapshot = vi.fn(async () => sidebar);
    const command = vi.fn<(payload: Record<string, unknown>) => Promise<unknown>>(async () => ({
        ok: true,
    }));
    const handlers = new Map<string, (args?: unknown, context?: unknown) => Promise<unknown>>();
    const listeners: ((event: AgentHookEvent, raw: PluginEvent) => void)[] = [];
    // Kelpi numbers every event in one sequence, Kelp Tank's own emits included.
    let sequence = 100;
    const storageSet = vi.fn(async (key: string, value: unknown) => {
        stored.set(key, structuredClone(value));
    });
    const storageGet = vi.fn(async (key: string) => stored.get(key));
    const emit = vi.fn(async (name: string, data?: unknown) => ({
        epoch: 'e1',
        sequence: ++sequence,
        name: `dita.kelp-tank.${name}`,
        data,
        pluginID: 'dita.kelp-tank',
    }));
    const api = {
        commands: {
            register: (id: string, handler: () => Promise<unknown>) => {
                handlers.set(id, handler);
                return () => handlers.delete(id);
            },
        },
        workspaces: { list: async () => workspaces },
        agents: {
            onEvent: (listener: (event: AgentHookEvent, raw: PluginEvent) => void) => {
                listeners.push(listener);
                return () => listeners.splice(listeners.indexOf(listener), 1);
            },
        },
        storage: { get: storageGet, set: storageSet },
        emit,
        snapshot,
        command,
        events: {
            on: (name: string, listener: (event: PluginEvent) => void) => {
                const list =
                    name === 'gap'
                        ? gapListeners
                        : name === 'state.changed'
                          ? stateListeners
                          : null;
                if (list === null) return () => {};
                list.push(listener);
                return () => list.splice(list.indexOf(listener), 1);
            },
        },
    } as unknown as BackendApi;
    const stateChanged = () => {
        const raw = { epoch: 'e1', sequence: ++sequence, name: 'state.changed', data: {} };
        stateListeners.forEach((listener) => listener(raw));
    };
    const gap = () => {
        const raw = { epoch: 'e1', sequence: ++sequence, name: 'gap', data: {} };
        gapListeners.forEach((listener) => listener(raw));
    };
    const hear = (event: Partial<AgentHookEvent>) => {
        const data: AgentHookEvent = {
            type: 'stop',
            paneID: 'p1',
            workspaceID: 'w',
            agent: 'claude',
            status: 'waitingForInput',
            ...event,
        };
        const raw = { epoch: 'e1', sequence: ++sequence, name: 'agent.event', data };
        listeners.forEach((listener) => listener(data, raw));
    };
    return {
        api,
        handlers,
        hear,
        storageSet,
        storageGet,
        emit,
        stored,
        snapshot,
        command,
        stateChanged,
        gap,
    };
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

describe('the activity command', () => {
    const PANE = { paneID: 'p1', workspaceID: 'w1', daemonID: 'd' };
    const tool = (event: string, name: string) => ({
        argv: [event, '--session', 's1', '--tool', name],
        cwd: '/srv/demo',
        isTTY: false,
        json: false,
    });
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    const activity = (handlers: ReturnType<typeof fakeApi>['handlers']) =>
        handlers.get('dita.kelp-tank.activity')!() as Promise<{
            epoch: string | null;
            sequence: number;
            panes: Record<string, unknown>;
        }>;

    it('the activity command answers a running tool after its hook call', async () => {
        const { api, handlers } = fakeApi();
        activate(api);
        expect(await activity(handlers)).toEqual({ epoch: null, sequence: -1, panes: {} });
        await handlers.get('dita.kelp-tank.hook')!(tool('PreToolUse', 'Bash'), PANE);
        await settle();
        expect((await activity(handlers)).panes).toEqual({
            p1: { sessionId: 's1', tools: ['Bash'], dozing: false, agents: {} },
        });
        await handlers.get('dita.kelp-tank.hook')!(tool('PostToolUse', 'Bash'), PANE);
        await settle();
        expect((await activity(handlers)).panes).toEqual({
            p1: { sessionId: 's1', tools: [], dozing: false, agents: {} },
        });
    });

    it("the activity command answers a subagent's running tool under its agent", async () => {
        const { api, handlers } = fakeApi();
        activate(api);
        const sub = (event: string, name: string) => ({
            ...tool(event, name),
            argv: [event, '--session', 's1', '--agent', 'a1', '--tool', name],
        });
        await handlers.get('dita.kelp-tank.hook')!(sub('PreToolUse', 'Bash'), PANE);
        await settle();
        expect((await activity(handlers)).panes).toEqual({
            p1: { sessionId: 's1', tools: [], dozing: false, agents: { a1: ['Bash'] } },
        });
    });

    it('the activity command answers a doze after idle_prompt, and a start wakes it', async () => {
        const { api, handlers, hear } = fakeApi();
        activate(api);
        hear({ type: 'notification', notificationType: 'idle_prompt', sessionID: 's1' });
        expect((await activity(handlers)).panes).toEqual({
            p1: { sessionId: 's1', tools: [], dozing: true, agents: {} },
        });
        hear({ type: 'start', status: 'running', sessionID: 's1' });
        expect((await activity(handlers)).panes).toEqual({
            p1: { sessionId: 's1', tools: [], dozing: false, agents: {} },
        });
    });

    it("the activity command's sequence covers the latest event it applied", async () => {
        const { api, handlers, hear, emit } = fakeApi();
        activate(api);
        hear({ type: 'notification', notificationType: 'idle_prompt', sessionID: 's1' });
        expect(await activity(handlers)).toMatchObject({ epoch: 'e1', sequence: 101 });
        await handlers.get('dita.kelp-tank.hook')!(tool('PreToolUse', 'Read'), PANE);
        await settle();
        const sent = (await emit.mock.results[0].value) as PluginEvent;
        expect(sent.sequence).toBe(102);
        expect(await activity(handlers)).toMatchObject({ epoch: 'e1', sequence: 102 });
    });

    it('a hook event sent late keeps the higher sequence it already covers', async () => {
        const { api, handlers, hear, emit } = fakeApi();
        activate(api);
        let send: (event: PluginEvent) => void = () => {};
        emit.mockImplementationOnce(
            (name: string, data?: unknown) =>
                new Promise((resolve) => {
                    send = () =>
                        resolve({
                            epoch: 'e1',
                            sequence: 100,
                            name,
                            data,
                            pluginID: 'dita.kelp-tank',
                        });
                }) as never,
        );
        await handlers.get('dita.kelp-tank.hook')!(tool('PreToolUse', 'Bash'), PANE);
        // Kelpi numbered the hook event 100, but an agent event (101) reached the backend first.
        hear({
            type: 'notification',
            notificationType: 'idle_prompt',
            sessionID: 's2',
            paneID: 'p2',
        });
        send({} as PluginEvent);
        await settle();
        const answer = await activity(handlers);
        expect(answer.sequence).toBe(101);
        expect(answer.panes.p1).toEqual({
            sessionId: 's1',
            tools: ['Bash'],
            dozing: false,
            agents: {},
        });
    });

    it('the backend never stores activity', async () => {
        const { api, handlers, hear, storageSet } = fakeApi();
        activate(api);
        hear({ type: 'notification', notificationType: 'idle_prompt', sessionID: 's1' });
        await handlers.get('dita.kelp-tank.hook')!(tool('PreToolUse', 'Bash'), PANE);
        await handlers.get('dita.kelp-tank.hook')!(
            {
                ...tool('SubagentStart', ''),
                argv: ['SubagentStart', '--session', 's1', '--agent', 'a1'],
            },
            PANE,
        );
        await settle();
        expect(storageSet.mock.calls.map(([key]) => key)).toEqual(['babyAgents']);
    });
});

describe('the sidebar sort', () => {
    // vault first; bravo has a session and alpha has none, so bravo belongs above alpha.
    const unsorted = () =>
        snapshotOf([
            ['vault', 'idle'],
            ['alpha', null],
            ['bravo', 'waitingForInput'],
        ]);

    async function afterDelay() {
        await vi.advanceTimersByTimeAsync(SORT_DELAY_MS);
    }

    afterEach(() => vi.useRealTimers());

    it('moves a workspace with a session up, after an agent event and the delay', async () => {
        vi.useFakeTimers();
        const { api, hear, command } = fakeApi([], new Map(), unsorted());
        activate(api);
        hear({ type: 'stop', paneID: 'pane-bravo' });
        await vi.advanceTimersByTimeAsync(SORT_DELAY_MS - 1);
        expect(command).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(command.mock.calls).toEqual([
            [{ command: 'workspace-move', name: 'bravo', index: 1 }],
        ]);
    });

    it('sorts once when the backend starts, with no event yet', async () => {
        vi.useFakeTimers();
        const { api, command } = fakeApi([], new Map(), unsorted());
        activate(api);
        await afterDelay();
        expect(command.mock.calls).toEqual([
            [{ command: 'workspace-move', name: 'bravo', index: 1 }],
        ]);
    });

    it('sorts after a state change too, and once for a burst of events', async () => {
        vi.useFakeTimers();
        const { api, hear, stateChanged, snapshot, command } = fakeApi([], new Map(), unsorted());
        activate(api);
        stateChanged();
        hear({ type: 'start', status: 'running' });
        stateChanged();
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(1);
        expect(command).toHaveBeenCalledTimes(1);
    });

    it('still sorts while a working session changes its title every second', async () => {
        // A working Claude pane's title spinner fires a state change about once a second.
        vi.useFakeTimers();
        const { api, stateChanged, command } = fakeApi([], new Map(), unsorted());
        activate(api);
        await afterDelay(); // the start-up sort
        command.mockClear();
        for (let second = 0; second < 10; second++) {
            stateChanged();
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(command).toHaveBeenCalled();
    });

    it('sorts after a gap, when Kelpi dropped events', async () => {
        vi.useFakeTimers();
        const { api, gap, snapshot } = fakeApi([], new Map(), unsorted());
        activate(api);
        await afterDelay();
        snapshot.mockClear();
        gap();
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(1);
    });

    it('stopping the backend mid-sort sends no more moves', async () => {
        vi.useFakeTimers();
        const sidebar = snapshotOf([
            ['vault', 'idle'],
            ['alpha', null],
            ['bravo', 'running'],
            ['charlie', 'waitingForInput'],
        ]);
        const { api, command } = fakeApi([], new Map(), sidebar);
        let release: (value: unknown) => void = () => {};
        command.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
        const dispose = activate(api);
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(1);
        dispose();
        release({ ok: true });
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the sidebar is already sorted', async () => {
        vi.useFakeTimers();
        const sorted = snapshotOf([
            ['vault', 'idle'],
            ['bravo', 'waitingForInput'],
            ['alpha', 'idle'],
        ]);
        const { api, stateChanged, snapshot, command } = fakeApi([], new Map(), sorted);
        activate(api);
        stateChanged();
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(1);
        expect(command).not.toHaveBeenCalled();
    });

    it('moves nothing when sessions change state but none starts or ends', async () => {
        vi.useFakeTimers();
        const sidebar = snapshotOf([
            ['vault', null],
            ['idle', 'idle'],
            ['busy', 'running'],
            ['needs', 'waitingForInput'],
        ]);
        const { api, hear, command } = fakeApi([], new Map(), sidebar);
        activate(api);
        hear({ paneID: 'pane-needs', lastAssistantMessage: REPLY });
        hear({ paneID: 'pane-busy', type: 'start', status: 'running' });
        await afterDelay();
        expect(command).not.toHaveBeenCalled();
    });

    it('stops the batch when Kelpi refuses a move, and tries again on the next change', async () => {
        vi.useFakeTimers();
        const sidebar = snapshotOf([
            ['vault', 'idle'],
            ['alpha', null],
            ['bravo', 'running'],
            ['charlie', 'waitingForInput'],
        ]);
        const { api, stateChanged, command } = fakeApi([], new Map(), sidebar);
        command.mockResolvedValueOnce({ ok: false, error: 'no' });
        activate(api);
        stateChanged();
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(1);
        command.mockRejectedValueOnce(new Error('socket gone'));
        stateChanged();
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(2);
        stateChanged();
        await afterDelay();
        expect(command.mock.calls.slice(2)).toEqual([
            [{ command: 'workspace-move', name: 'bravo', index: 1 }],
            [{ command: 'workspace-move', name: 'charlie', index: 2 }],
        ]);
    });

    it('skips a sort when the snapshot fails, and tries again on the next change', async () => {
        vi.useFakeTimers();
        const { api, stateChanged, snapshot, command } = fakeApi([], new Map(), unsorted());
        snapshot.mockRejectedValueOnce(new Error('daemon busy'));
        activate(api);
        stateChanged();
        await afterDelay();
        expect(command).not.toHaveBeenCalled();
        stateChanged();
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(1);
    });

    it('only ever sends workspace moves, never a close or a delete', async () => {
        vi.useFakeTimers();
        const sidebar = snapshotOf([
            ['vault', null],
            ['a', 'idle'],
            ['b', null],
            ['c', 'running'],
            ['d', 'waitingForInput'],
        ]);
        sidebar.state.topLevelOrder = [{ kind: 'group', id: 'g' }];
        sidebar.state.groups = [
            { id: 'g', childOrder: ['vault', 'a', 'b', 'c', 'd'], isCollapsed: true },
        ];
        const { api, stateChanged, command } = fakeApi([], new Map(), sidebar);
        activate(api);
        stateChanged();
        await afterDelay();
        expect(command).toHaveBeenCalledTimes(5);
        for (const [payload] of command.mock.calls) {
            expect(Object.keys(payload).sort()).toEqual(['command', 'index', 'name']);
            expect(payload.command).toBe('workspace-move');
        }
    });

    it('a change while a sort is running sorts again afterwards', async () => {
        vi.useFakeTimers();
        const { api, stateChanged, snapshot, command } = fakeApi([], new Map(), unsorted());
        let release: (value: unknown) => void = () => {};
        command.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
        activate(api);
        stateChanged();
        await afterDelay();
        stateChanged();
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(1);
        release({ ok: true });
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(2);
    });

    it('stopping the backend during a sort schedules no more sorts', async () => {
        vi.useFakeTimers();
        const { api, stateChanged, snapshot, command } = fakeApi([], new Map(), unsorted());
        let release: (value: unknown) => void = () => {};
        command.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
        const dispose = activate(api);
        stateChanged();
        await afterDelay();
        stateChanged();
        await afterDelay(); // fires while the first sort still waits on Kelpi
        dispose();
        release({ ok: true });
        await afterDelay();
        expect(snapshot).toHaveBeenCalledTimes(1);
    });

    it('stopping the backend cancels a waiting sort', async () => {
        vi.useFakeTimers();
        const { api, stateChanged, snapshot } = fakeApi([], new Map(), unsorted());
        const dispose = activate(api);
        stateChanged();
        dispose();
        await afterDelay();
        expect(snapshot).not.toHaveBeenCalled();
    });
});
