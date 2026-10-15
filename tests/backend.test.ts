import { describe, expect, it } from 'vitest';
import { activate } from '../src/backend';
import type { BackendApi, WorkspaceInfo } from '../src/kelpi-api';

describe('backend', () => {
    it('the summary command returns the workspace list', async () => {
        const workspaces = [{ id: 'w1', name: 'Kelp', paneCount: 2 }] as WorkspaceInfo[];
        const handlers = new Map<string, () => Promise<unknown>>();
        const api = {
            commands: {
                register: (id: string, handler: () => Promise<unknown>) => {
                    handlers.set(id, handler);
                    return () => handlers.delete(id);
                },
            },
            workspaces: { list: async () => workspaces },
        } as unknown as BackendApi;

        activate(api);

        const summary = (await handlers.get('dita.kelp-tank.summary')?.()) as {
            workspaces: WorkspaceInfo[];
            generatedAt: string;
        };
        expect(summary.workspaces).toBe(workspaces);
        expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
    });
});
