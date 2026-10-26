import { recordAgentEvent, recordTool, type ActivityAnswer } from './activity';
import { applyHook, EMPTY_BOOK, parseHookArgv, readBook, type AgentBook } from './agents';
import { SORT_DELAY_MS, sortMoves } from './auto-sort';
import type { BackendApi, CliInvocation, CliResult, PluginEvent } from './kelpi-api';
import { worldFromSnapshot } from './kelpi-world';
import { quietAfter } from './quiet';

/** Where the agent book is saved, so a restarted backend keeps its baby fish. */
const BOOK_KEY = 'babyAgents';
const USAGE =
    'usage: kelpi kelp-tank <Event> --session <id> [--agent <id>] [--tool <name>]\n' +
    '  <Event> is SubagentStart, SubagentStop, PreToolUse, PostToolUse or PostToolUseFailure.\n' +
    "  Kelp Tank's Claude hook (claude-hook/kelp-tank-hook.mjs) runs this for you.\n";

export function activate(api: BackendApi) {
    // The panes whose last reply ended `Awaiting you: 0`. A sidebar view's page is rebuilt on
    // every workspace switch and misses the `stop` that made a pane quiet, so the view asks for
    // this set. It lives in memory only: the reply text is never stored, logged or sent anywhere,
    // and a restarted backend starts empty, so every waiting fish glows again - the safe side.
    let quiet: ReadonlySet<string> = new Set();
    // Each pane's running tools and doze (src/activity.ts), for the same reason: a rebuilt page
    // missed the events. Memory only, like the quiet set. `epoch` and `sequence` name the latest
    // event applied, so a new page skips the buffered events this answer already covers.
    let activity: ActivityAnswer = { epoch: null, sequence: -1, panes: {} };
    const covered = (panes: ActivityAnswer['panes'], event: PluginEvent): ActivityAnswer => ({
        epoch: event.epoch,
        sequence:
            event.epoch === activity.epoch
                ? Math.max(activity.sequence, event.sequence)
                : event.sequence,
        panes,
    });
    // The sidebar sort (src/auto-sort.ts). An agent event, state change or `gap` starts a short
    // wait, which later changes join rather than restart: a working pane's title spinner fires a
    // state change about once a second, so a restarting wait would never end. Then one fresh
    // snapshot decides the moves. A change during a sort sorts again after it. It only ever
    // sends `workspace-move`: it never closes or deletes anything.
    let sortTimer: ReturnType<typeof setTimeout> | null = null;
    let sorting = false;
    let sortAgain = false;
    let stopped = false;
    const sortSoon = () => {
        if (stopped || sortTimer !== null) return;
        sortTimer = setTimeout(() => {
            sortTimer = null;
            void sortSidebar();
        }, SORT_DELAY_MS);
    };
    const sortSidebar = async () => {
        if (sorting) {
            sortAgain = true;
            return;
        }
        sorting = true;
        try {
            const { state } = await api.snapshot();
            for (const { id, index } of sortMoves(worldFromSnapshot(state), quiet)) {
                if (stopped) break;
                const reply = await api.command({ command: 'workspace-move', name: id, index });
                // A refused move leaves later indexes wrong; the next change sorts afresh.
                if ((reply as { ok?: unknown } | null)?.ok !== true) break;
            }
        } catch {
            // No snapshot, or no daemon: the next change tries again.
        } finally {
            sorting = false;
            if (sortAgain) {
                sortAgain = false;
                sortSoon();
            }
        }
    };
    const offState = api.events.on('state.changed', sortSoon);
    const offGap = api.events.on('gap', sortSoon);
    // A restarted Kelpi may have changed while the backend was down: sort once at start too.
    sortSoon();

    const offEvents = api.agents.onEvent((event, raw) => {
        quiet = quietAfter(quiet, event);
        activity = covered(recordAgentEvent(activity.panes, event.sessionID ?? null, event), raw);
        sortSoon();
    });
    const offSummary = api.commands.register('dita.kelp-tank.summary', async () => ({
        workspaces: await api.workspaces.list(),
        generatedAt: new Date().toISOString(),
    }));
    const offQuiet = api.commands.register('dita.kelp-tank.quiet', async () => ({
        panes: [...quiet],
    }));
    const offActivity = api.commands.register('dita.kelp-tank.activity', async () => activity);

    // The agent book: every live background agent, by pane. It is read from storage once, on the
    // first call that needs it, and kept in memory after that; an unreadable save starts empty.
    let book: AgentBook = EMPTY_BOOK;
    let loaded: Promise<void> | null = null;
    const load = () =>
        (loaded ??= api.storage.get(BOOK_KEY).then(
            (saved) => {
                book = readBook(saved);
            },
            () => {},
        ));
    // `kelpi kelp-tank ...`, from the hook. Run from the palette, it gets no argv and does nothing.
    const offHook = api.commands.register('dita.kelp-tank.hook', async (args, context) => {
        const argv = (args as Partial<CliInvocation> | undefined)?.argv;
        if (!Array.isArray(argv)) return {};
        const call = parseHookArgv(argv);
        if (call === null) return { stderr: USAGE, exitCode: 2 } satisfies CliResult;
        const paneId = context?.paneID;
        if (!paneId) return {};
        await load();
        const now = Date.now();
        const next = applyHook(book, call, paneId, now);
        book = next.book;
        const data = {
            paneID: paneId,
            workspaceID: context.workspaceID ?? null,
            event: call.event,
            sessionId: call.sessionId,
            agentId: call.agentId,
            toolName: call.toolName,
            at: now,
        };
        // Recorded once the event is sent, so the answer's sequence always covers its change.
        void api.emit('hook', data).then(
            (sent) => {
                activity = covered(recordTool(activity.panes, data), sent);
            },
            () => {},
        );
        if (next.changed) {
            await api.storage.set(BOOK_KEY, book).catch(() => {});
            void api.emit('agents', book).catch(() => {});
        }
        return {};
    });
    // A new page asks for the book, as it asks for the quiet panes.
    const offBook = api.commands.register('dita.kelp-tank.agent-book', async () => {
        await load();
        return book;
    });
    return () => {
        stopped = true;
        if (sortTimer !== null) clearTimeout(sortTimer);
        offState();
        offGap();
        offEvents();
        offSummary();
        offQuiet();
        offActivity();
        offHook();
        offBook();
    };
}
