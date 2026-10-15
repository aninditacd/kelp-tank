import type { BackendApi } from './kelpi-api';

export function activate(api: BackendApi) {
    return api.commands.register('dita.kelp-tank.summary', async () => ({
        workspaces: await api.workspaces.list(),
        generatedAt: new Date().toISOString(),
    }));
}
