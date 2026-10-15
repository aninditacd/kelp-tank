import type { SessionState, TankSession, TankWorkspace } from '../tank-state';

const LABEL: Record<SessionState, string> = {
    working: 'Working',
    wantsYou: 'Wants you',
    idle: 'Idle',
    closed: 'Closed',
};

/** The hover text: the session name, then `<workspace> · <state>`. */
export function tooltipText(
    session: TankSession,
    workspace: TankWorkspace,
): { name: string; detail: string } {
    return { name: session.displayName, detail: `${workspace.name} · ${LABEL[session.state]}` };
}
