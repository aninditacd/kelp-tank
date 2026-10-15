import type { WorkspaceColor } from '../kelpi-api';
import type { TankState } from '../tank-state';
import { decideGoals } from './behaviour';

/** The plugin storage key holding the ids of the workspaces Dita hid, sorted. */
export const HIDDEN_KEY = 'hiddenWorkspaces';

export interface HiddenStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}

export interface MenuEntry {
    id: string;
    name: string;
    color: WorkspaceColor;
    hidden: boolean;
}

/** What the tank draws: `state` without the hidden workspaces' ledges and creatures. */
export function visibleState(state: TankState, hidden: ReadonlySet<string>): TankState {
    return {
        workspaces: state.workspaces.filter((w) => !hidden.has(w.id)),
        sessions: state.sessions.filter((s) => !hidden.has(s.workspaceId)),
    };
}

/** The menu's rows: every live workspace in ledge order, hidden ones included so they can return. */
export function menuEntries(state: TankState, hidden: ReadonlySet<string>): MenuEntry[] {
    return state.workspaces.map(({ id, name, color }) => ({
        id,
        name,
        color,
        hidden: hidden.has(id),
    }));
}

/**
 * True when a session in a hidden workspace would glow if it were shown. It reuses the glow
 * rule, so a relaying rail and a muted workspace never light the dot.
 */
export function hiddenWantsYou(state: TankState, hidden: ReadonlySet<string>): boolean {
    const goals = decideGoals(state);
    return state.sessions.some((s) => {
        const goal = goals.get(s.paneId);
        return hidden.has(s.workspaceId) && goal?.kind === 'glass' && goal.alert;
    });
}

/** Reads the hidden set. Anything that is not a list of ids shows every workspace. */
export async function loadHidden(storage: Pick<HiddenStorage, 'get'>): Promise<Set<string>> {
    const saved = await storage.get(HIDDEN_KEY);
    if (!Array.isArray(saved)) return new Set();
    return new Set(saved.filter((id): id is string => typeof id === 'string'));
}

export function saveHidden(
    storage: Pick<HiddenStorage, 'set'>,
    hidden: ReadonlySet<string>,
): Promise<void> {
    return storage.set(HIDDEN_KEY, [...hidden].sort());
}

export interface HiddenStore {
    readonly hidden: ReadonlySet<string>;
    readonly problem: string | null;
    toggle(workspaceId: string): Promise<void>;
}

/**
 * The hidden set as the menu changes it, saved after each toggle. After a failed read it never
 * saves, so the menu cannot overwrite Dita's stored list with a nearly empty one. `problem` says
 * what went wrong, and stays until a later save works.
 */
export async function openHiddenStore(storage: HiddenStorage): Promise<HiddenStore> {
    let hidden = new Set<string>();
    let problem: string | null = null;
    let canSave = true;
    try {
        hidden = await loadHidden(storage);
    } catch (failure) {
        canSave = false;
        problem = `Kelp Tank could not read your hidden workspaces, so menu changes won't be saved. ${(failure as Error).message}`;
    }
    return {
        get hidden() {
            return hidden;
        },
        get problem() {
            return problem;
        },
        async toggle(workspaceId) {
            hidden = new Set(hidden);
            if (hidden.has(workspaceId)) hidden.delete(workspaceId);
            else hidden.add(workspaceId);
            if (!canSave) return;
            try {
                await saveHidden(storage, hidden);
                problem = null;
            } catch (failure) {
                problem = `Kelp Tank could not save your hidden workspaces. ${(failure as Error).message}`;
            }
        },
    };
}
