// Not unit-tested: it needs WebGL and the `window.kelpi` that Kelpi injects. It is checked by
// running the built plugin in Kelpi's private instance. The logic it wires is tested in tests/.
import type { ViewApi } from '../kelpi-api';
import { startLiveTank } from '../live-tank';
import type { TankState } from '../tank-state';
import {
    type HiddenStore,
    hiddenWantsYou,
    menuEntries,
    openHiddenStore,
    visibleState,
} from './hidden';
import { MEMORY_KEY, nextSave, readMemory } from './memory';
import { createTank } from './tank';
import { createWorkspaceMenu } from './workspace-menu';

const api = (globalThis as unknown as { kelpi: ViewApi }).kelpi;
const error = document.querySelector<HTMLElement>('#error')!;
// A storage problem stays on screen; a live problem clears once Kelpi sends a state again.
let storeProblem: string | null = null;
let liveProblem = '';
const showProblems = () => (error.textContent = storeProblem ?? liveProblem);
const showError = (failure: Error) => {
    liveProblem = failure.message;
    showProblems();
};

try {
    let live: ReturnType<typeof startLiveTank> | undefined;
    const tank = createTank(document.querySelector<HTMLCanvasElement>('#tank')!, {
        onSelect: (paneId) => void live?.jump(paneId).catch(showError),
    });
    // The tank draws only the workspaces Dita has not hidden; the menu lists them all.
    let latest: TankState = { workspaces: [], sessions: [] };
    let store: HiddenStore | undefined;
    const show = () => {
        const hidden = store?.hidden ?? new Set<string>();
        tank.setState(visibleState(latest, hidden));
        menu.render(menuEntries(latest, hidden), hiddenWantsYou(latest, hidden));
    };
    const menu = createWorkspaceMenu(document.querySelector<HTMLElement>('#tank-box')!, {
        onToggle(workspaceId) {
            if (!store) return;
            const saving = store.toggle(workspaceId);
            show();
            void saving.then(() => {
                storeProblem = store!.problem;
                showProblems();
            });
        },
    });
    void api.ready
        .then(async () => {
            store = await openHiddenStore(api.storage);
            storeProblem = store.problem;
            showProblems();
            // Kelpi rebuilds this page on every workspace switch, so the tank brings its creatures
            // and view back from plugin storage. A failed read counts as a first open.
            tank.recall(readMemory(await api.storage.get(MEMORY_KEY).catch(() => null)));
            let lastWritten: string | null = null;
            setInterval(() => {
                const next = nextSave(lastWritten, tank.snapshot());
                if (next === null) return;
                lastWritten = next;
                // A failed save is ignored: it costs one swim-in on the next page, and an error
                // shown every second would be worse.
                api.storage.set(MEMORY_KEY, JSON.parse(next)).catch(() => {});
            }, 1000);
            live = startLiveTank(
                api,
                (state) => {
                    liveProblem = '';
                    showProblems();
                    latest = state;
                    show();
                },
                showError,
            );
        })
        .catch(showError);
} catch (failure) {
    error.textContent = 'This view could not start 3D graphics. ' + (failure as Error).message;
}
