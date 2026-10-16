import { applyHook, EMPTY_BOOK, parseHookArgv, readBook, type AgentBook } from './agents';
import type { BackendApi, CliInvocation, CliResult } from './kelpi-api';
import { quietAfter } from './quiet';

/** Where the agent book is saved, so a restarted backend keeps its baby fish. */
const BOOK_KEY = 'babyAgents';
const USAGE =
    'usage: kelpi kelp-tank <Event> --session <id> [--agent <id>] [--tool <name>]\n' +
    '  <Event> is SubagentStart, SubagentStop, PreToolUse or PostToolUse.\n' +
    "  Kelp Tank's Claude hook (claude-hook/kelp-tank-hook.mjs) runs this for you.\n";

export function activate(api: BackendApi) {
    // The panes whose last reply ended `Awaiting you: 0`. A sidebar view's page is rebuilt on
    // every workspace switch and misses the `stop` that made a pane quiet, so the view asks for
    // this set. It lives in memory only: the reply text is never stored, logged or sent anywhere,
    // and a restarted backend starts empty, so every waiting fish glows again - the safe side.
    let quiet: ReadonlySet<string> = new Set();
    const offEvents = api.agents.onEvent((event) => {
        quiet = quietAfter(quiet, event);
    });
    const offSummary = api.commands.register('dita.kelp-tank.summary', async () => ({
        workspaces: await api.workspaces.list(),
        generatedAt: new Date().toISOString(),
    }));
    const offQuiet = api.commands.register('dita.kelp-tank.quiet', async () => ({
        panes: [...quiet],
    }));

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
        void api
            .emit('hook', {
                paneID: paneId,
                workspaceID: context.workspaceID ?? null,
                event: call.event,
                sessionId: call.sessionId,
                agentId: call.agentId,
                toolName: call.toolName,
                at: now,
            })
            .catch(() => {});
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
        offEvents();
        offSummary();
        offQuiet();
        offHook();
        offBook();
    };
}
