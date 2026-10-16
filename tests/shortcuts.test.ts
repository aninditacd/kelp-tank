import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ChromeKeymap, Snapshot } from '../src/kelpi-api';
import { applyChanges, worldFromSnapshot, type KelpiWorld } from '../src/kelpi-world';
import {
    chordsFromKeymap,
    FALLBACK_CHORDS,
    ledgeLabel,
    workspaceShortcuts,
} from '../src/shortcuts';
import { worldAt } from './support/recorded-run';

/** Each workspace's shortcut by name, or null when it has none. */
function byName(world: KelpiWorld, chords = FALLBACK_CHORDS): Record<string, string | null> {
    const shortcuts = workspaceShortcuts(world, chords);
    return Object.fromEntries(world.workspaces.map((w) => [w.name, shortcuts.get(w.id) ?? null]));
}

function run(file: string) {
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const snapshot = JSON.parse(lines[0]) as Snapshot;
    const events = lines
        .slice(1)
        .map((line) => (JSON.parse(line) as { event: { data: unknown[] } }).event);
    return { start: worldFromSnapshot(snapshot.state), events };
}

function keymap(actions: Record<string, string | null>): ChromeKeymap {
    return {
        sections: [
            {
                category: 'Workspaces',
                actions: Object.entries(actions).map(([action, shortcut]) => ({
                    action,
                    title: action,
                    shortcut,
                })),
            },
        ],
    };
}

function topLevelWorld(count: number): KelpiWorld {
    const ids = Array.from({ length: count }, (_, i) => `w${i + 1}`);
    return {
        workspaces: ids.map((id) => ({ id, name: id, color: 'green', muted: false })),
        panes: [],
        topLevelOrder: ids.map((id) => ({ kind: 'workspace', id })),
        groups: {},
        activity: {},
    };
}

describe('workspace shortcuts', () => {
    it("a ledge's number counts workspaces with no session", () => {
        expect(byName(worldAt(183))).toEqual({ Default: '⌘1', Kelp: '⌘2', Ops: '⌘3' });
    });

    it('the tenth workspace gets no shortcut', () => {
        const shortcuts = byName(topLevelWorld(10));
        expect(shortcuts.w1).toBe('⌘1');
        expect(shortcuts.w9).toBe('⌘9');
        expect(shortcuts.w10).toBeNull();
    });

    it("a collapsed group's workspaces get no shortcut", () => {
        const { start, events } = run('tests/fixtures/collapsed-group-run.jsonl');
        const world = events.reduce((current, event) => applyChanges(current, event.data), start);
        expect(byName(world)).toEqual({
            Default: '⌘3',
            Alpha: '⌘1',
            Bravo: null,
            Charlie: '⌘2',
            Delta: null,
            Echo: null,
        });
    });

    it('reordering the sidebar renumbers the shortcuts', () => {
        const { start, events } = run('tests/fixtures/sidebar-order-run.jsonl');
        expect(byName(start)).toMatchObject({ Charlie: '⌘1', Default: '⌘2', Alpha: '⌘3' });
        const world = events.reduce((current, event) => applyChanges(current, event.data), start);
        expect(byName(world)).toEqual({
            Alpha: '⌘1',
            Charlie: '⌘2',
            Default: '⌘3',
            Bravo: '⌘4',
            Echo: '⌘5',
            Delta: '⌘6',
        });
    });

    it("a remapped chord comes from Kelpi's keymap", () => {
        const chords = chordsFromKeymap(
            keymap({ switch_to_workspace_1: '⌃1', switch_to_workspace_2: '⌘2' }),
        );
        expect(chords.slice(0, 2)).toEqual(['⌃1', '⌘2']);
        expect(byName(worldAt(183), chords)).toMatchObject({ Default: '⌃1', Kelp: '⌘2' });
    });

    it('an unbound shortcut shows no chord', () => {
        const chords = chordsFromKeymap(
            keymap({ switch_to_workspace_1: '⌘1', switch_to_workspace_2: null }),
        );
        expect(byName(worldAt(183), chords)).toMatchObject({ Default: '⌘1', Kelp: null });
    });

    it('with no keymap the chords fall back to ⌘1 to ⌘9', () => {
        expect(chordsFromKeymap(null)).toEqual([
            '⌘1',
            '⌘2',
            '⌘3',
            '⌘4',
            '⌘5',
            '⌘6',
            '⌘7',
            '⌘8',
            '⌘9',
        ]);
        expect(chordsFromKeymap(null)).toEqual(FALLBACK_CHORDS);
    });

    it('a ledge label shows the shortcut beside the name', () => {
        expect(ledgeLabel({ name: 'Kelp', shortcut: '⌘2' })).toBe('⌘2 Kelp');
        expect(ledgeLabel({ name: 'Kelp', shortcut: null })).toBe('Kelp');
    });
});
