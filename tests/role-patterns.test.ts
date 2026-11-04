import { describe, expect, it } from 'vitest';
import { roleForName } from '../src/decide-tank';
import {
    checkPatterns,
    DEFAULT_PATTERNS,
    matchersFor,
    PATTERNS_KEY,
    problemNote,
    readPatterns,
} from '../src/role-patterns';

const rolesOf = (names: string[], patterns = DEFAULT_PATTERNS) => {
    const matchers = matchersFor(patterns);
    return Object.fromEntries(names.map((n) => [n, roleForName(n, matchers)]));
};

describe('role patterns (issue #3)', () => {
    it('saves under rolePatterns in plugin storage', () => {
        expect(PATTERNS_KEY).toBe('rolePatterns');
    });

    it('the default patterns keep the built-in roles', () => {
        expect(
            rolesOf([
                'wed-14-10-2026',
                'conducting-lantern',
                'lantern-rail-a',
                'lantern-rail-c1-2',
                'guardrail-a',
                'building-lantern',
                'kelp-tank',
            ]),
        ).toEqual({
            'wed-14-10-2026': 'day',
            'conducting-lantern': 'conductor',
            'lantern-rail-a': 'rail',
            'lantern-rail-c1-2': 'rail',
            'guardrail-a': 'fish',
            'building-lantern': 'building',
            'kelp-tank': 'fish',
        });
    });

    it('a custom pattern for each role picks that role', () => {
        const patterns = {
            day: '^daily-',
            conductor: '^lead-',
            rail: '-worker-\\d+$',
        };
        expect(
            rolesOf(['daily-notes', 'lead-pebble', 'pebble-worker-3', 'wed-14-10-2026'], patterns),
        ).toEqual({
            'daily-notes': 'day',
            'lead-pebble': 'conductor',
            'pebble-worker-3': 'rail',
            'wed-14-10-2026': 'fish',
        });
    });

    it('patterns ignore case', () => {
        expect(rolesOf(['Lead-Pebble'], { ...DEFAULT_PATTERNS, conductor: '^lead-' })).toEqual({
            'Lead-Pebble': 'conductor',
        });
    });

    it('a rail pattern still wins over a conductor pattern', () => {
        const patterns = { ...DEFAULT_PATTERNS, conductor: 'lead', rail: '-worker-\\d+$' };
        expect(rolesOf(['lead-worker-2'], patterns)).toEqual({ 'lead-worker-2': 'rail' });
    });

    it('an empty pattern turns its role off', () => {
        const patterns = { day: '', conductor: '', rail: '' };
        expect(
            rolesOf(['wed-14-10-2026', 'conducting-lantern', 'lantern-rail-a'], patterns),
        ).toEqual({
            'wed-14-10-2026': 'fish',
            'conducting-lantern': 'fish',
            'lantern-rail-a': 'fish',
        });
    });

    it('a blank-only pattern also turns its role off', () => {
        expect(rolesOf(['conducting-lantern'], { ...DEFAULT_PATTERNS, conductor: '   ' })).toEqual({
            'conducting-lantern': 'fish',
        });
    });

    it('checkPatterns names each pattern that is not a valid regular expression', () => {
        expect(checkPatterns({ day: '(', conductor: 'ok', rail: '[a-' })).toEqual({
            day: expect.any(String),
            rail: expect.any(String),
        });
        expect(checkPatterns(DEFAULT_PATTERNS)).toEqual({});
    });

    it('an invalid pattern falls back to the default for that role only', () => {
        const patterns = { ...DEFAULT_PATTERNS, conductor: '^lead-', rail: '(' };
        expect(rolesOf(['lead-pebble', 'lantern-rail-a'], patterns)).toEqual({
            'lead-pebble': 'conductor',
            'lantern-rail-a': 'rail',
        });
    });

    it('readPatterns keeps saved strings and fills anything else from the defaults', () => {
        expect(readPatterns(null)).toEqual(DEFAULT_PATTERNS);
        expect(readPatterns('rail')).toEqual(DEFAULT_PATTERNS);
        expect(readPatterns([])).toEqual(DEFAULT_PATTERNS);
        expect(readPatterns({ rail: '-worker$', day: 7, extra: 'x' })).toEqual({
            ...DEFAULT_PATTERNS,
            rail: '-worker$',
        });
        expect(readPatterns({ conductor: '' })).toEqual({ ...DEFAULT_PATTERNS, conductor: '' });
    });

    it('problemNote names each invalid pattern by its role, one per line', () => {
        expect(problemNote({})).toBe('');
        expect(problemNote({ rail: 'bad rail', day: 'bad day' })).toBe(
            'Daily session: bad day\nRail: bad rail',
        );
    });
});
