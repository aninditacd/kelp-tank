// Not unit-tested: it is DOM only, and Vitest runs without a DOM. Its rows and its dot come from
// `menuEntries` and `hiddenWantsYou` in hidden.ts, which are tested. It is checked by screenshots
// from Kelpi's private instance.
import { workspaceHex } from './colors';
import type { MenuEntry } from './hidden';

export interface WorkspaceMenu {
    /** Redraws the rows, and lights the button's dot when `dot` is true. */
    render(entries: MenuEntry[], dot: boolean): void;
    dispose(): void;
}

/**
 * The corner menu that lists every live workspace with a show/hide toggle. `onToggle` gets the
 * workspace id each time Dita flips one.
 */
export function createWorkspaceMenu(
    parent: HTMLElement,
    options: { onToggle(workspaceId: string): void },
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
            panel.replaceChildren(...rows);
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
