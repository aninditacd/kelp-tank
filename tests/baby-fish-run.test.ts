import { describe, expect, it } from 'vitest';
import { decideTank } from '../src/decide-tank';
import { FALLBACK_CHORDS } from '../src/shortcuts';
import {
    babyEvents,
    babyPaneId,
    babyWorldAt,
    bookAt,
    hookEvents,
    timeAt,
} from './support/baby-fish-run';

/** The recorded run, replayed through the decider with the agent book the backend emitted. */
const PANE = babyPaneId('harbour-fish');
const starts = hookEvents.filter((h) => h.data.event === 'SubagentStart');
const stops = hookEvents.filter((h) => h.data.event === 'SubagentStop');
// The background agent started first and stopped last; the foreground one ran in between.
const BACKGROUND = starts[0].data.agentId!;
const FOREGROUND = starts[1].data.agentId!;

function babiesAt(sequence: number, book = bookAt(sequence)) {
    const tank = decideTank(babyWorldAt(sequence), null, FALLBACK_CHORDS, new Set(), {
        book,
        now: timeAt(sequence),
    });
    return tank.sessions.find((s) => s.paneId === PANE);
}

describe('the recorded baby fish run', () => {
    it('the run holds two starts and two stops, in that order of agents', () => {
        expect(starts.map((h) => h.data.agentId)).toEqual([BACKGROUND, FOREGROUND]);
        expect(stops.map((h) => h.data.agentId)).toEqual([FOREGROUND, BACKGROUND]);
    });

    it('a started agent gives its session one baby fish', () => {
        const start = starts[0].sequence;
        expect(babiesAt(start - 1)?.babies).toEqual([]);
        // The book's `agents` event follows the hook event.
        const book = babyEvents.find((e) => e.name === 'dita.kelp-tank.agents')!.sequence;
        expect(babiesAt(book)).toMatchObject({ state: 'working', babies: [BACKGROUND] });
    });

    it('two agents at once give two baby fish, oldest first', () => {
        expect(babiesAt(starts[1].sequence + 1)?.babies).toEqual([BACKGROUND, FOREGROUND]);
    });

    it("a stopped agent's baby fish leaves and the other stays", () => {
        expect(babiesAt(stops[0].sequence + 1)?.babies).toEqual([BACKGROUND]);
        expect(babiesAt(stops[1].sequence + 1)?.babies).toEqual([]);
    });

    it('a session that ends takes all its baby fish', () => {
        const end = babyEvents.at(-1)!;
        expect(end.name).toBe('agent.event');
        expect((end.data as { type: string }).type).toBe('session-end');
        // In this run the background agent stopped before the session ended, so its stop is not
        // what removes the baby here: this uses the book from before that stop, still holding it.
        // Two guards each keep these babies away: the decider skips a pane with no session id,
        // and `liveAgents` skips a book entry for another session. Removing one alone stays
        // green; tests/agents.test.ts proves the session id check on its own.
        const stillRunning = bookAt(stops[0].sequence + 1);
        expect(Object.keys(stillRunning.panes[PANE].agents)).toEqual([BACKGROUND]);
        expect(babiesAt(end.sequence, stillRunning)).toMatchObject({
            state: 'closed',
            babies: [],
        });
    });

    it('tool calls inside an agent save the book only on starts and stops', () => {
        const books = babyEvents.filter((e) => e.name === 'dita.kelp-tank.agents');
        expect(books).toHaveLength(starts.length + stops.length);
        expect(hookEvents.some((h) => h.data.agentId === BACKGROUND && h.data.toolName)).toBe(true);
    });

    it('every hook event carries only the contract fields, for the right pane and session', () => {
        const world = babyWorldAt(starts[0].sequence);
        const pane = world.panes.find((p) => p.id === PANE)!;
        for (const { data } of hookEvents) {
            expect(Object.keys(data).sort()).toEqual(
                ['agentId', 'at', 'event', 'paneID', 'sessionId', 'toolName', 'workspaceID'].sort(),
            );
            expect(data.paneID).toBe(PANE);
            expect(data.workspaceID).toBe(pane.workspaceId);
            expect(data.sessionId).toBe(pane.agentSessionId);
        }
    });
});
