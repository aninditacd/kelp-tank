import { afterEach, describe, expect, it, vi } from 'vitest';
import { activate } from '../src/backend';
import type { AgentHookEvent, BackendApi, WorkspaceInfo } from '../src/kelpi-api';

const REPLY = 'Tide table done. Kestrel-marker-7. \nAwaiting you: 0 - nothing';

function fakeApi(workspaces: WorkspaceInfo[] = []) {
    const handlers = new Map<string, (args?: unknown) => Promise<unknown>>();
    const listeners: ((event: AgentHookEvent) => void)[] = [];
    const storageSet = vi.fn();
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
        storage: { get: vi.fn(), set: storageSet },
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
    return { api, handlers, hear, storageSet };
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
