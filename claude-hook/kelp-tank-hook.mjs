// Kelp Tank's Claude Code hook. Claude Code runs it for SubagentStart, SubagentStop, PreToolUse,
// PostToolUse and PostToolUseFailure, with the hook payload on stdin. It hands the event, the session id, the agent
// id and the tool name to `kelpi kelp-tank`, and nothing else: never the tool input or output,
// the reply text or any path. The README shows the settings block that installs it.
//
// It must never get in Claude's way, so it prints nothing, always exits 0 and does not wait for
// kelpi. It never calls process.exit: it ends when its event loop empties, so a spawn error, such
// as kelpi not being installed, reaches the listener below instead of crashing the script.
// Needs Node 18 or later and no packages.
import { spawn } from 'node:child_process';

const EVENTS = new Set([
    'SubagentStart',
    'SubagentStop',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
]);
// The same pattern as HOOK_ID in src/agents.ts, which the verb checks again.
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function forward(payload) {
    // Outside a Kelpi pane there is no fish to give a baby to.
    if (!process.env.KELPI_PANE_ID) return;
    if (typeof payload !== 'object' || payload === null) return;
    const event = payload.hook_event_name;
    if (!EVENTS.has(event)) return;
    const argv = ['kelp-tank', event];
    const fields = [
        ['--session', payload.session_id],
        ['--agent', payload.agent_id],
        ['--tool', payload.tool_name],
    ];
    for (const [flag, value] of fields) {
        if (typeof value === 'string' && ID.test(value)) argv.push(flag, value);
    }
    const child = spawn('kelpi', argv, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('error', () => {});
process.stdin.on('end', () => {
    try {
        forward(JSON.parse(input));
    } catch {
        // Bad JSON or anything else: do nothing, quietly.
    }
});
