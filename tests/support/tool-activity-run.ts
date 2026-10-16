import { readFileSync } from 'node:fs';
// The repo has no `@/` alias; these relative imports match tests/support/recorded-run.ts.
import type { PluginEvent, Snapshot } from '../../src/kelpi-api';

/**
 * The recorded tool activity run: Kelp Tank's real Claude hook script and Kelpi's own `kelpi event`
 * commands, driven in Kelpi 0.2.19's private instance with the built plugin installed.
 * `tests/fixtures/README.md` says how it was captured. Never hand-edit the fixture.
 */
const lines = readFileSync('tests/fixtures/tool-activity-run.jsonl', 'utf8').trim().split('\n');
const first = JSON.parse(lines[0]) as Snapshot;

export const activitySnapshot: Snapshot = {
    epoch: first.epoch,
    sequence: first.sequence,
    state: first.state,
};
export const activityEvents: PluginEvent[] = lines
    .slice(1)
    .map((line) => (JSON.parse(line) as { event: PluginEvent }).event);

export function activityPaneId(label: string): string {
    const pane = activitySnapshot.state.workspaces
        .flatMap((w) => w.panes)
        .find((p) => p.label === label);
    if (!pane) throw new Error(`no pane labelled ${label} in the tool activity run`);
    return pane.id;
}
