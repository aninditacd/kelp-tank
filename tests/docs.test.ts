import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLAUDE.md', () => {
    it('CLAUDE.md names the real commands and no longer says there is no toolchain', () => {
        const text = readFileSync('CLAUDE.md', 'utf8');
        expect(text).toContain('pnpm check');
        expect(text).toContain('plugin dev dist');
        expect(text.toLowerCase()).not.toContain('no toolchain');
    });

    it('the README states Kelpi 0.2.19 as the minimum', () => {
        expect(readFileSync('README.md', 'utf8')).toContain('Needs Kelpi 0.2.19 or later');
    });
});

describe('the baby fish section', () => {
    it('the README shows the hook for all five events and says the tank works without it', () => {
        const readme = readFileSync('README.md', 'utf8');
        const section = readme.slice(readme.indexOf('## Baby fish (optional)'));
        expect(section.startsWith('## Baby fish (optional)')).toBe(true);
        const block = /```json\n([\s\S]*?)```/.exec(section)?.[1];
        const hooks = (JSON.parse(block!) as { hooks: Record<string, unknown[]> }).hooks;
        expect(Object.keys(hooks).sort()).toEqual(
            [
                'PostToolUse',
                'PostToolUseFailure',
                'PreToolUse',
                'SubagentStart',
                'SubagentStop',
            ].sort(),
        );
        for (const entries of Object.values(hooks)) {
            expect(entries).toEqual([
                {
                    hooks: [
                        {
                            type: 'command',
                            command: 'node /path/to/kelp-tank-hook.mjs',
                            async: true,
                        },
                    ],
                },
            ]);
        }
        expect(section).toContain('works without it');
        expect(section).toContain('claude-hook/kelp-tank-hook.mjs');
    });
});
