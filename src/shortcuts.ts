import type { ChromeKeymap } from './kelpi-api';
import { visibleWorkspaceOrder, type KelpiWorld } from './kelpi-world';

/** Kelpi's default chords for its nine workspace shortcuts, used until a keymap arrives. */
export const FALLBACK_CHORDS: readonly (string | null)[] = Array.from(
    { length: 9 },
    (_, index) => `⌘${index + 1}`,
);

/**
 * The chords for Kelpi's actions `switch_to_workspace_1` to `_9`, from its live keyboard map,
 * after Dita's rebinds. An unbound or unlisted action gives null. No map gives the fallback.
 */
export function chordsFromKeymap(keymap: ChromeKeymap | null): (string | null)[] {
    if (!keymap) return [...FALLBACK_CHORDS];
    const actions = keymap.sections.flatMap((section) => section.actions);
    return FALLBACK_CHORDS.map(
        (_, index) =>
            actions.find((candidate) => candidate.action === `switch_to_workspace_${index + 1}`)
                ?.shortcut ?? null,
    );
}

/** Each workspace Kelpi's shortcuts reach, mapped to its chord, by visible sidebar position. */
export function workspaceShortcuts(
    world: KelpiWorld,
    chords: readonly (string | null)[],
): Map<string, string> {
    const shortcuts = new Map<string, string>();
    visibleWorkspaceOrder(world).forEach((id, index) => {
        const chord = chords[index];
        if (chord) shortcuts.set(id, chord);
    });
    return shortcuts;
}

/** A ledge's label: the shortcut beside the name, or the name alone. */
export function ledgeLabel(workspace: { name: string; shortcut: string | null }): string {
    return workspace.shortcut ? `${workspace.shortcut} ${workspace.name}` : workspace.name;
}
