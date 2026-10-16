import { describe, expect, it } from 'vitest';
import type { AgentHookEvent } from '../src/kelpi-api';
import { awaitingCount, quietAfter } from '../src/quiet';
import { agentEvents, footerEvents, footerPaneId, stopAt } from './support/footer-run';

function stop(reply: string | undefined, extra: Partial<AgentHookEvent> = {}): AgentHookEvent {
    return {
        type: 'stop',
        paneID: 'p1',
        workspaceID: 'w',
        agent: 'claude',
        status: 'waitingForInput',
        ...(reply === undefined ? {} : { lastAssistantMessage: reply }),
        ...extra,
    };
}
const notification = (notificationType: string): AgentHookEvent => ({
    type: 'notification',
    paneID: 'p1',
    workspaceID: 'w',
    agent: 'claude',
    status: 'waitingForInput',
    notificationType,
});
const quiet = new Set(['p1']);
const none = new Set<string>();

describe('the footer', () => {
    it('a reply ending in Awaiting you: 0 marks its pane quiet', () => {
        expect(awaitingCount('Done.\n\nAwaiting you: 0 - nothing')).toBe(0);
        expect(quietAfter(none, stop('Done.\n\nAwaiting you: 0 - nothing')).has('p1')).toBe(true);
    });

    it('a reply ending in Awaiting you: 2 leaves its pane wanting you', () => {
        expect(awaitingCount('Done.\nAwaiting you: 2 - a choice and a go')).toBe(2);
        expect(
            quietAfter(quiet, stop('Done.\nAwaiting you: 2 - a choice and a go')).has('p1'),
        ).toBe(false);
    });

    it('a reply with no footer on its last line leaves its pane wanting you', () => {
        expect(awaitingCount('All done.')).toBeNull();
        expect(quietAfter(quiet, stop('All done.')).has('p1')).toBe(false);
    });

    it('a footer quoted earlier in a reply never counts', () => {
        const reply = 'I end replies with:\nAwaiting you: 0 - nothing\nThat is the format.';
        expect(awaitingCount(reply)).toBeNull();
        expect(quietAfter(none, stop(reply)).has('p1')).toBe(false);
    });

    it('blank lines after the footer do not hide it', () => {
        expect(awaitingCount('Done.\nAwaiting you: 0 - nothing\n\n  \n')).toBe(0);
    });

    it('a footer that is not exactly the format is not a footer', () => {
        for (const reply of [
            'Awaiting you: zero',
            'awaiting you: 0',
            'Awaiting you: 0x',
            '**Awaiting you: 0 - nothing**',
            'Awaiting you:',
        ]) {
            expect(awaitingCount(reply), reply).toBeNull();
        }
    });

    it('a truncated reply is never quiet, even with a footer 0', () => {
        const cut = stop('Done.\nAwaiting you: 0 - nothing', {
            lastAssistantMessageTruncated: true,
        });
        expect(quietAfter(none, cut).has('p1')).toBe(false);
    });

    it('a stop with no reply text is never quiet', () => {
        expect(quietAfter(none, stop(undefined)).has('p1')).toBe(false);
        expect(quietAfter(none, stop('')).has('p1')).toBe(false);
    });

    it('a permission prompt after a footer 0 makes its pane want you again', () => {
        expect(quietAfter(quiet, notification('permission_prompt')).has('p1')).toBe(false);
        expect(quietAfter(quiet, notification('elicitation_dialog')).has('p1')).toBe(false);
    });

    it('an idle reminder after a footer 0 keeps its pane quiet', () => {
        expect(quietAfter(quiet, notification('idle_prompt')).has('p1')).toBe(true);
    });

    it('a new turn clears the quiet mark', () => {
        const start: AgentHookEvent = { ...stop(undefined), type: 'start', status: 'running' };
        expect(quietAfter(quiet, start).has('p1')).toBe(false);
    });

    it("a stop in one pane leaves another pane's mark alone", () => {
        const other = stop('Done.\nAwaiting you: 3 - everything', { paneID: 'p2' });
        expect([...quietAfter(quiet, other)]).toEqual(['p1']);
        expect([
            ...quietAfter(none, stop('x\nAwaiting you: 0 - nothing', { paneID: 'p2' })),
        ]).toEqual(['p2']);
    });
});

describe('the recorded footer run', () => {
    // What each recorded stop must do, by its sequence. Every reply in the run came from real
    // Claude Code, except long-fish's, which was driven (tests/fixtures/README.md).
    const expected: [number, string, boolean][] = [
        [137, 'update-fish', true],
        [155, 'ask-fish', false],
        [170, 'plain-fish', false],
        [183, 'quote-fish', true], // a one-line reply that is only the footer
        [204, 'quote-fish', false], // a footer quoted mid-reply, prose after it
        [221, 'perm-fish', true],
        [237, 'perm-fish', false], // real reply, no footer
        [260, 'update-fish', true],
        [274, 'perm-fish', true],
        [301, 'long-fish', false], // a stop that carried no reply text
        [318, 'long-fish', false], // a footer 0 cut off at 64 KiB
    ];

    it('the recorded run marks only the footer-0 stops quiet', () => {
        let marks: ReadonlySet<string> = new Set();
        const seen = new Map<number, boolean>();
        for (const { sequence, event } of agentEvents) {
            marks = quietAfter(marks, event);
            if (event.type === 'stop') seen.set(sequence, marks.has(event.paneID));
        }
        for (const [sequence, label, isQuiet] of expected) {
            expect(stopAt(sequence).paneID, `stop ${sequence}`).toBe(footerPaneId(label));
            expect(seen.get(sequence), `stop ${sequence} (${label})`).toBe(isQuiet);
        }
        expect([...seen.keys()].sort((a, b) => a - b)).toEqual(expected.map(([s]) => s));
    });

    it('in the recorded run, an idle reminder keeps a quiet pane quiet and a permission prompt does not', () => {
        let marks: ReadonlySet<string> = new Set();
        const after = new Map<number, boolean>();
        for (const { sequence, event } of agentEvents) {
            marks = quietAfter(marks, event);
            after.set(sequence, marks.has(event.paneID));
        }
        expect(after.get(283)).toBe(true); // idle_prompt on update-fish, after its footer 0
        expect(after.get(292)).toBe(false); // permission_prompt on perm-fish, after a new turn
    });

    it("in the recorded run, every stop follows its pane's status change to waiting", () => {
        // Kelpi publishes the status change, then at most a notification and a title update,
        // then the stop (daemon plugins/service.ts and handlers/app/agent-events.ts). A stop
        // more than three sequences after its status change, or with another hook event
        // between them, would let the glow show before the verdict.
        const turnedWaiting = (paneId: string, sequence: number) =>
            [...footerEvents].reverse().find(
                (e) =>
                    e.sequence < sequence &&
                    e.name === 'state.changed' &&
                    (
                        e.data as {
                            kind: string;
                            paneID?: string;
                            status?: string;
                            pane?: { id: string; status: string };
                        }[]
                    ).some(
                        (c) =>
                            (c.kind === 'agent-status-changed' &&
                                c.paneID === paneId &&
                                c.status === 'waitingForInput') ||
                            (c.kind === 'pane-upserted' &&
                                c.pane?.id === paneId &&
                                c.pane.status === 'waitingForInput'),
                    ),
            );
        const stops = agentEvents.filter((e) => e.event.type === 'stop');
        expect(stops.length).toBe(11);
        for (const { sequence, event } of stops) {
            const change = turnedWaiting(event.paneID, sequence);
            expect(change, `stop ${sequence} has a status change before it`).toBeDefined();
            expect(sequence - change!.sequence, `stop ${sequence}`).toBeLessThanOrEqual(3);
            const intruder = agentEvents.some(
                (e) => e.sequence > change!.sequence && e.sequence < sequence,
            );
            expect(intruder, `stop ${sequence}`).toBe(false);
        }
    });
});
