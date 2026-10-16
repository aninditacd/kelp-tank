import type { AgentHookEvent } from './kelpi-api';

/**
 * The footer rule: which panes' last reply said nothing is waiting on the owner.
 *
 * The owner ends every Claude reply with `Awaiting you: <n> - <what it holds>`. A pane whose
 * latest reply ends `Awaiting you: 0` is "quiet": its creature shows an update, not a glow. Any
 * doubt leaves a pane not quiet, because a wrongly quiet creature hides a session that needs the
 * owner. The reply text is read here and never kept: only pane ids leave this module.
 */

const FOOTER = /^Awaiting you: (\d+)(?: - .*)?$/;

/**
 * The `<n>` of a reply's footer, read from the last non-empty line only, so a footer quoted
 * earlier in a reply never counts. Null when that line is not exactly the footer format.
 */
export function awaitingCount(reply: string): number | null {
    const lines = reply.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '') continue;
        const match = FOOTER.exec(line);
        return match ? Number(match[1]) : null;
    }
    return null;
}

/**
 * The quiet panes after `event`. A `stop` marks its pane quiet only when its whole, uncut reply
 * ends `Awaiting you: 0`. Every other event for a pane clears its mark, except Claude's
 * `idle_prompt` reminder, which asks nothing new. An event for another pane changes nothing.
 */
export function quietAfter(quiet: ReadonlySet<string>, event: AgentHookEvent): ReadonlySet<string> {
    if (event.type === 'notification' && event.notificationType === 'idle_prompt') return quiet;
    const next = new Set(quiet);
    const reply = event.lastAssistantMessage;
    const footerZero =
        event.type === 'stop' &&
        reply !== undefined &&
        event.lastAssistantMessageTruncated !== true &&
        awaitingCount(reply) === 0;
    if (footerZero) next.add(event.paneID);
    else next.delete(event.paneID);
    return next;
}
