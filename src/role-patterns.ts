/**
 * The session-name patterns that pick the daily-planner turtle, a conductor and a rail (issue #3).
 * People set them in the tank's corner menu, and the tank keeps them in Kelpi plugin storage, so a
 * different naming habit needs no build from source. Pure: no DOM, no Kelpi.
 *
 * Each pattern is a regular expression, matched without regard to case. An empty pattern turns
 * its role off. An invalid one is refused when saved and, if found in storage, replaced by that
 * role's default.
 */

/** The plugin storage key holding the patterns. */
export const PATTERNS_KEY = 'rolePatterns';

export type PatternRole = 'day' | 'conductor' | 'rail';
export type RolePatterns = Record<PatternRole, string>;
/** A compiled pattern per role, or null when the role is turned off. */
export type RoleMatchers = Record<PatternRole, RegExp | null>;

const ROLES: readonly PatternRole[] = ['day', 'conductor', 'rail'];

/**
 * The built-in rules. A day is a date name such as `wed-14-10-2026`. A conductor's name contains
 * `conduct`. A rail is `rail-a`, a batch-prefixed `lh-deps-1013-rail-a`, a handover such as
 * `rail-r2`, or a relaunch such as `rail-c1-2` (issue #28); never `guardrail-a`, `rail-ab` or
 * `rail-2`.
 */
export const DEFAULT_PATTERNS: RolePatterns = {
    day: '^(mon|tue|wed|thu|fri|sat|sun)-\\d{2}-\\d{2}-\\d{4}$',
    conductor: 'conduct',
    rail: '(?:^|-)rail-[a-z]\\d*(?:-\\d+)?$',
};

/** Names longer than this are matched on their first `MAX_NAME_LENGTH` characters only. */
export const MAX_NAME_LENGTH = 200;

/**
 * True when a group that repeats (`+`, `*` or `{`) holds a repeat itself, as in `(a+)+`. That
 * shape can take exponential time on a name that almost matches, and the tank tests every name
 * on every change, so one such pattern would freeze it on every load. This catches the common
 * shape, not every slow pattern.
 */
function repeatsARepeat(source: string): boolean {
    const groups: boolean[] = []; // per open group: does it hold a repeat?
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '\\') {
            i++;
        } else if (char === '[') {
            // Skip a character class, escapes included.
            for (i++; i < source.length && source[i] !== ']'; i++) if (source[i] === '\\') i++;
        } else if (char === '(') {
            groups.push(false);
        } else if (char === ')') {
            const heldRepeat = groups.pop() ?? false;
            const next = source[i + 1];
            const repeats = next === '+' || next === '*' || next === '{';
            if (repeats && heldRepeat) return true;
            if (groups.length > 0 && (heldRepeat || repeats)) groups[groups.length - 1] = true;
        } else if ((char === '+' || char === '*' || char === '{') && groups.length > 0) {
            groups[groups.length - 1] = true;
        }
    }
    return false;
}

/** Compiles one pattern: null for an empty one, an Error for an invalid or too slow one. */
function compile(source: string): RegExp | null | Error {
    if (source.trim() === '') return null;
    let compiled: RegExp;
    try {
        compiled = new RegExp(source, 'i');
    } catch (failure) {
        return failure as Error;
    }
    if (repeatsARepeat(source)) {
        return new Error('too slow: a repeated group repeats inside, as in (a+)+');
    }
    return compiled;
}

/** Each invalid pattern's error message, keyed by role. Empty when every pattern is usable. */
export function checkPatterns(patterns: RolePatterns): Partial<Record<PatternRole, string>> {
    const problems: Partial<Record<PatternRole, string>> = {};
    for (const role of ROLES) {
        const compiled = compile(patterns[role]);
        if (compiled instanceof Error) problems[role] = compiled.message;
    }
    return problems;
}

/** The compiled patterns. An invalid one falls back to its role's default. */
export function matchersFor(patterns: RolePatterns): RoleMatchers {
    const matchers = {} as RoleMatchers;
    for (const role of ROLES) {
        const compiled = compile(patterns[role]);
        matchers[role] =
            compiled instanceof Error ? (compile(DEFAULT_PATTERNS[role]) as RegExp) : compiled;
    }
    return matchers;
}

export const DEFAULT_MATCHERS: RoleMatchers = matchersFor(DEFAULT_PATTERNS);

/** Reads saved patterns. Any role without a saved string keeps its default. */
export function readPatterns(saved: unknown): RolePatterns {
    const patterns = { ...DEFAULT_PATTERNS };
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return patterns;
    for (const role of ROLES) {
        const value = (saved as Record<string, unknown>)[role];
        if (typeof value === 'string') patterns[role] = value;
    }
    return patterns;
}

const ROLE_NAMES: Record<PatternRole, string> = {
    day: 'Daily session',
    conductor: 'Conductor',
    rail: 'Rail',
};

/** One line per invalid pattern, in role order: `Rail: <why>`. Empty when there are none. */
export function problemNote(problems: Partial<Record<PatternRole, string>>): string {
    return ROLES.filter((role) => problems[role] !== undefined)
        .map((role) => `${ROLE_NAMES[role]}: ${problems[role]}`)
        .join('\n');
}

/** What Save does with `patterns`: save them, or refuse and say which ones are wrong. */
export function saveNote(patterns: RolePatterns): { save: boolean; note: string } {
    const problems = problemNote(checkPatterns(patterns));
    return problems
        ? { save: false, note: `Not saved.\n${problems}` }
        : { save: true, note: 'Saved.' };
}

/** The note when storage refuses a save: the patterns still apply on this page. */
export function saveFailedNote(message: string): string {
    return `Not saved: ${message}. The tank uses them until it reloads.`;
}
