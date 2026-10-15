import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The repo is public, so no tracked file may hold a home-folder path or an email address
 * (added when the repo went public). The patterns are generic on purpose: this file names nothing private.
 * Co-author lines use no-reply addresses, which are allowed.
 */
const BINARY = /\.(png|jpe?g|gif|ico|woff2?)$/i;
const HOME_PATH = /\/(?:Users|home)\/[^/\s"'`]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL = /^(?:noreply@anthropic\.com|[A-Za-z0-9._%+-]+@users\.noreply\.github\.com)$/;

function trackedTextFiles(): string[] {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
        .split('\0')
        .filter((file) => file !== '' && !BINARY.test(file));
}

/** Every match of `pattern` in the tracked files, as `file: match`, minus the allowed ones. */
function findAll(pattern: RegExp, allowed?: RegExp): string[] {
    const hits: string[] = [];
    for (const file of trackedTextFiles()) {
        for (const match of readFileSync(file, 'utf8').matchAll(pattern))
            if (!allowed?.test(match[0])) hits.push(`${file}: ${match[0]}`);
    }
    return hits;
}

describe('personal data in the public tree', () => {
    it('the scan reads every tracked text file', () => {
        const files = trackedTextFiles();
        expect(files).toContain('tests/fixtures/twelve-sessions-run.jsonl');
        expect(files).toContain('docs/prd.md');
        expect(files.length).toBeGreaterThan(50);
    });

    it('no tracked file holds a home-folder path', () => {
        expect(findAll(HOME_PATH)).toEqual([]);
    });

    it('no tracked file holds an email address', () => {
        expect(findAll(EMAIL, ALLOWED_EMAIL)).toEqual([]);
    });
});
