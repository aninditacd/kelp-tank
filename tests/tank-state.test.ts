import { describe, expectTypeOf, it } from 'vitest';
import type { WorkspaceColor } from '../src/kelpi-api';
import type {
    SessionRole,
    SessionState,
    TankSession,
    TankState,
    TankWorkspace,
} from '../src/tank-state';

// These are type assertions: `pnpm typecheck` fails when the shape drifts.
describe('TankState', () => {
    it('the tank state carries the agreed workspace and session fields', () => {
        expectTypeOf<SessionRole>().toEqualTypeOf<'day' | 'conductor' | 'rail' | 'fish'>();
        expectTypeOf<SessionState>().toEqualTypeOf<
            'working' | 'wantsYou' | 'update' | 'idle' | 'closed'
        >();
        expectTypeOf<TankWorkspace>().toEqualTypeOf<{
            id: string;
            name: string;
            color: WorkspaceColor;
            muted: boolean;
            shortcut: string | null;
        }>();
        expectTypeOf<Omit<TankSession, 'relaysTo'>>().toEqualTypeOf<{
            paneId: string;
            workspaceId: string;
            displayName: string;
            role: SessionRole;
            state: SessionState;
        }>();
        expectTypeOf<TankState>().toEqualTypeOf<{
            workspaces: TankWorkspace[];
            sessions: TankSession[];
        }>();
    });

    it("a session's relaysTo is a conductor pane id or null", () => {
        expectTypeOf<TankSession['relaysTo']>().toEqualTypeOf<string | null>();
        expectTypeOf<TankSession>().toHaveProperty('relaysTo');
    });
});
