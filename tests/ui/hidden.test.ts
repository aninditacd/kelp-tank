import { describe, expect, it } from 'vitest';
// The repo has no @/ alias; every test imports from ../../src.
import type {
    SessionRole,
    SessionState,
    TankSession,
    TankState,
    TankWorkspace,
} from '../../src/tank-state'; // No @/ alias.
import {
    HIDDEN_KEY,
    hiddenWantsYou,
    loadHidden,
    menuEntries,
    openHiddenStore,
    saveHidden,
    visibleState,
} from '../../src/ui/hidden'; // No @/ alias in this repo.

// Names out of alphabetical order, so a sort would show.
const A: TankWorkspace = { id: 'a', name: 'Zeta', color: 'green', muted: false, shortcut: '⌘1' };
const B: TankWorkspace = { id: 'b', name: 'Alpha', color: 'blue', muted: false, shortcut: '⌘2' };
const C: TankWorkspace = { id: 'c', name: 'Mid', color: 'red', muted: false, shortcut: null };

function session(
    paneId: string,
    workspaceId: string,
    role: SessionRole,
    state: SessionState,
    relaysTo: string | null = null,
): TankSession {
    return { paneId, workspaceId, displayName: paneId, role, state, relaysTo };
}

const STATE: TankState = {
    workspaces: [A, B, C],
    sessions: [
        session('a1', 'a', 'fish', 'working'),
        session('b1', 'b', 'fish', 'idle'),
        session('c1', 'c', 'day', 'working'),
        session('b2', 'b', 'conductor', 'working'),
    ],
};

/** A fake of Kelpi's plugin storage, kept in a map, as a restart would find it. */
function fakeStorage(initial: Record<string, unknown> = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        get: (key: string) => Promise.resolve(map.get(key) ?? null),
        set: (key: string, value: unknown) => {
            map.set(key, value);
            return Promise.resolve();
        },
    };
}

describe('hiding workspaces', () => {
    it("a hidden workspace's ledge and creatures leave the tank", () => {
        const shown = visibleState(STATE, new Set(['b']));
        expect(shown.workspaces).toEqual([A, C]);
        expect(shown.sessions.map((s) => s.paneId)).toEqual(['a1', 'c1']);
        expect(visibleState(STATE, new Set())).toEqual(STATE);
    });

    it('the menu lists every live workspace, hidden or not', () => {
        expect(menuEntries(STATE, new Set(['b']))).toEqual([
            { id: 'a', name: 'Zeta', color: 'green', hidden: false },
            { id: 'b', name: 'Alpha', color: 'blue', hidden: true },
            { id: 'c', name: 'Mid', color: 'red', hidden: false },
        ]);
    });

    it('a hidden set survives a restart', async () => {
        const storage = fakeStorage();
        await saveHidden(storage, new Set(['b', 'a']));
        expect(storage.map.get(HIDDEN_KEY)).toEqual(['a', 'b']);
        expect(HIDDEN_KEY).toBe('hiddenWorkspaces');
        expect(await loadHidden(fakeStorage(Object.fromEntries(storage.map)))).toEqual(
            new Set(['a', 'b']),
        );
    });

    it('bad stored data shows every workspace', async () => {
        expect(await loadHidden(fakeStorage({ [HIDDEN_KEY]: 'oops' }))).toEqual(new Set());
        expect(await loadHidden(fakeStorage({ [HIDDEN_KEY]: null }))).toEqual(new Set());
        expect(await loadHidden(fakeStorage({ [HIDDEN_KEY]: [1, 'b'] }))).toEqual(new Set(['b']));
    });
});

describe('the dot on the menu button', () => {
    const waiting = (extra: TankSession[], workspaces = [A, B, C]): TankState => ({
        workspaces,
        sessions: [...STATE.sessions, ...extra],
    });

    it('a waiting fish in a hidden workspace lights the dot', () => {
        expect(
            hiddenWantsYou(waiting([session('b3', 'b', 'fish', 'wantsYou')]), new Set(['b'])),
        ).toBe(true);
    });

    it('the dot stays off with no hidden session waiting', () => {
        const visibleWaits = waiting([session('a2', 'a', 'fish', 'wantsYou')]);
        expect(hiddenWantsYou(visibleWaits, new Set(['b']))).toBe(false);
        expect(hiddenWantsYou(visibleWaits, new Set())).toBe(false);
    });

    it('a relaying rail never lights the dot', () => {
        const rail = session('b3', 'b', 'rail', 'wantsYou', 'b2');
        expect(hiddenWantsYou(waiting([rail]), new Set(['b']))).toBe(false);
        const closed: TankState = {
            workspaces: [A, B, C],
            sessions: [
                ...STATE.sessions.filter((s) => s.paneId !== 'b2'),
                session('b2', 'b', 'conductor', 'closed'),
                rail,
            ],
        };
        expect(hiddenWantsYou(closed, new Set(['b']))).toBe(true);
    });

    it('a muted workspace never lights the dot', () => {
        const muted = { ...B, muted: true };
        const state = waiting([session('b3', 'b', 'fish', 'wantsYou')], [A, muted, C]);
        expect(hiddenWantsYou(state, new Set(['b']))).toBe(false);
    });
});

describe('saving the hidden set', () => {
    const failing = (message: string) => () => Promise.reject(new Error(message));

    it("a failed read keeps Dita's saved list and says why", async () => {
        const storage = { ...fakeStorage({ [HIDDEN_KEY]: ['a', 'b'] }), get: failing('offline') };
        const sets: unknown[] = [];
        const set = storage.set;
        storage.set = (key, value) => (sets.push(value), set(key, value));
        const store = await openHiddenStore(storage);
        expect(store.hidden).toEqual(new Set());
        expect(store.problem).toContain('offline');
        await store.toggle('c');
        expect(store.hidden).toEqual(new Set(['c']));
        expect(sets).toEqual([]);
        expect(storage.map.get(HIDDEN_KEY)).toEqual(['a', 'b']);
        expect(store.problem).toContain('offline');
    });

    it('a failed save says so until a later save works', async () => {
        const storage = fakeStorage();
        const set = storage.set;
        storage.set = failing('full');
        const store = await openHiddenStore(storage);
        expect(store.problem).toBeNull();
        await store.toggle('a');
        expect(store.hidden).toEqual(new Set(['a']));
        expect(store.problem).toContain('full');
        storage.set = set;
        await store.toggle('b');
        expect(store.problem).toBeNull();
        expect(storage.map.get(HIDDEN_KEY)).toEqual(['a', 'b']);
    });

    it('a toggle hides a shown workspace and shows a hidden one', async () => {
        const storage = fakeStorage({ [HIDDEN_KEY]: ['a'] });
        const store = await openHiddenStore(storage);
        await store.toggle('a');
        await store.toggle('b');
        expect(store.hidden).toEqual(new Set(['b']));
        expect(storage.map.get(HIDDEN_KEY)).toEqual(['b']);
    });
});
