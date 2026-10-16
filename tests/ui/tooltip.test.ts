import { describe, expect, it } from 'vitest';
import { tooltipText } from '../../src/ui/tooltip';
import type { SessionState, TankSession, TankWorkspace } from '../../src/tank-state';

const WORKSPACE: TankWorkspace = {
    id: 'mw',
    name: 'Lagoon',
    color: 'blue',
    muted: false,
    shortcut: null,
};
const make = (state: SessionState): TankSession => ({
    paneId: 'p1',
    workspaceId: 'mw',
    displayName: 'rail-a',
    role: 'rail',
    state,
    relaysTo: null,
});

describe('tooltipText', () => {
    it('the tooltip names the session, its workspace and its state', () => {
        const states: [SessionState, string][] = [
            ['working', 'Working'],
            ['wantsYou', 'Wants you'],
            ['idle', 'Idle'],
        ];
        for (const [state, label] of states) {
            const t = tooltipText(make(state), WORKSPACE);
            expect(t.name).toBe('rail-a');
            expect(t.detail).toBe(`Lagoon · ${label}`);
        }
    });

    it("an update creature's hover text says Update", () => {
        expect(tooltipText(make('update'), WORKSPACE).detail).toBe('Lagoon · Update');
    });
});
