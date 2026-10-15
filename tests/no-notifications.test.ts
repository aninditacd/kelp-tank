import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Kelpi already notifies, and an echo would undo a workspace's mute (Kelpi docs/plugins.md).
// The at-least-one-file check is proved by pointing the walk at a missing directory, which edits
// this test rather than production code; the content check is proved by a production edit.
function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? sourceFiles(join(dir, entry.name))
            : entry.name.endsWith('.ts')
              ? [join(dir, entry.name)]
              : [],
    );
}

describe('notifications', () => {
    it('the plugin never raises a Kelpi notification of its own', () => {
        const files = sourceFiles('src');
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            expect(source, file).not.toContain('notify(');
            expect(source, file).not.toContain('showNotification');
        }
    });
});
