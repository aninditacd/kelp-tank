// Not unit-tested: it is DOM only, and Vitest runs without a DOM. Its rows and its dot come from
// `menuEntries` and `hiddenWantsYou` in hidden.ts, and its name patterns are checked by
// `checkPatterns` in role-patterns.ts, which are tested. It is checked by screenshots from Kelpi's
// private instance.
import type { PatternRole, RolePatterns } from '../role-patterns';
import { workspaceHex } from './colors';
import type { MenuEntry } from './hidden';

const NAME_FIELDS: readonly { role: PatternRole; label: string }[] = [
    { role: 'day', label: 'Daily session (turtle)' },
    { role: 'conductor', label: 'Conductor (pufferfish)' },
    { role: 'rail', label: 'Rail (tiny fish)' },
];

export interface WorkspaceMenu {
    /** Redraws the rows, and lights the button's dot when `dot` is true. */
    render(entries: MenuEntry[], dot: boolean): void;
    /** Fills the session-name fields, and shows `note` under them (empty for none). */
    showNames(patterns: RolePatterns, note: string): void;
    /** Shows `note` under the session-name fields, leaving what is typed in them alone. */
    showNote(note: string): void;
    dispose(): void;
}

/**
 * The corner menu that lists every live workspace with a show/hide toggle. `onToggle` gets the
 * workspace id each time Dita flips one. Below the list, "Session names" holds the patterns that
 * pick each role (issue #3): `onSaveNames` gets the fields' text on Save, and `onResetNames` asks
 * for the built-in patterns back.
 */
export function createWorkspaceMenu(
    parent: HTMLElement,
    options: {
        onToggle(workspaceId: string): void;
        onSaveNames(patterns: RolePatterns): void;
        onResetNames(): void;
    },
): WorkspaceMenu {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ws-menu-button';
    button.title = 'Show or hide workspaces';
    button.setAttribute('aria-label', 'Show or hide workspaces');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = '☰';
    const dot = document.createElement('span');
    dot.className = 'ws-menu-dot';
    dot.hidden = true;
    button.append(dot);

    const panel = document.createElement('div');
    panel.className = 'ws-menu';
    panel.hidden = true;
    const list = document.createElement('div');

    // Built once, outside `render`, so a state update never wipes what someone is typing.
    const names = document.createElement('details');
    names.className = 'ws-names';
    const summary = document.createElement('summary');
    summary.textContent = 'Session names';
    const hint = document.createElement('p');
    hint.textContent =
        'A regular expression for each role, ignoring case. Leave one empty to turn that role off.';
    const inputs = {} as Record<PatternRole, HTMLInputElement>;
    const fields = NAME_FIELDS.map(({ role, label }) => {
        const field = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'text';
        input.spellcheck = false;
        input.autocomplete = 'off';
        inputs[role] = input;
        field.append(label, input);
        return field;
    });
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', () =>
        options.onSaveNames({
            day: inputs.day.value,
            conductor: inputs.conductor.value,
            rail: inputs.rail.value,
        }),
    );
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => options.onResetNames());
    // Off until the saved patterns arrive, so Save can never store the empty fields.
    save.disabled = true;
    reset.disabled = true;
    const actions = document.createElement('div');
    actions.className = 'ws-names-actions';
    actions.append(save, reset);
    const note = document.createElement('p');
    note.className = 'ws-names-note';
    note.setAttribute('role', 'status');
    names.append(summary, hint, ...fields, actions, note);

    panel.append(list, names);
    parent.append(button, panel);

    const setOpen = (open: boolean) => {
        panel.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
    };
    const onButton = () => setOpen(panel.hidden !== false);
    const onDocument = (e: MouseEvent) => {
        if (
            !panel.hidden &&
            !panel.contains(e.target as Node) &&
            !button.contains(e.target as Node)
        )
            setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
    };
    button.addEventListener('click', onButton);
    document.addEventListener('click', onDocument);
    document.addEventListener('keydown', onKey);

    return {
        render(entries, lit) {
            dot.hidden = !lit;
            button.title = lit
                ? 'A hidden workspace has a session waiting for you'
                : 'Show or hide workspaces';
            const rows: HTMLElement[] = entries.map((entry) => {
                const row = document.createElement('label');
                row.className = 'ws-menu-row';
                const toggle = document.createElement('input');
                toggle.type = 'checkbox';
                toggle.checked = !entry.hidden;
                toggle.addEventListener('change', () => options.onToggle(entry.id));
                const swatch = document.createElement('i');
                swatch.style.background = workspaceHex(entry.color);
                row.append(toggle, swatch, entry.name);
                return row;
            });
            if (rows.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = 'No workspace has a live session.';
                rows.push(empty);
            }
            list.replaceChildren(...rows);
        },
        showNames(patterns, text) {
            for (const { role } of NAME_FIELDS) inputs[role].value = patterns[role];
            save.disabled = false;
            reset.disabled = false;
            note.textContent = text;
        },
        showNote(text) {
            note.textContent = text;
        },
        dispose() {
            button.removeEventListener('click', onButton);
            document.removeEventListener('click', onDocument);
            document.removeEventListener('keydown', onKey);
            button.remove();
            panel.remove();
        },
    };
}
