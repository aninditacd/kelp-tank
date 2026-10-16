import type { BackendApi } from './kelpi-api';
import { quietAfter } from './quiet';

export function activate(api: BackendApi) {
    // The panes whose last reply ended `Awaiting you: 0`. A sidebar view's page is rebuilt on
    // every workspace switch and misses the `stop` that made a pane quiet, so the view asks for
    // this set. It lives in memory only: the reply text is never stored, logged or sent anywhere,
    // and a restarted backend starts empty, so every waiting fish glows again - the safe side.
    let quiet: ReadonlySet<string> = new Set();
    const offEvents = api.agents.onEvent((event) => {
        quiet = quietAfter(quiet, event);
    });
    const offSummary = api.commands.register('dita.kelp-tank.summary', async () => ({
        workspaces: await api.workspaces.list(),
        generatedAt: new Date().toISOString(),
    }));
    const offQuiet = api.commands.register('dita.kelp-tank.quiet', async () => ({
        panes: [...quiet],
    }));
    return () => {
        offEvents();
        offSummary();
        offQuiet();
    };
}
