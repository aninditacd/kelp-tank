const REMOTE = String.raw`(?:https?:)?\/\/`;

const PATTERNS = [
    new RegExp(String.raw`<script\b[^>]*\bsrc\s*=\s*["']?${REMOTE}[^"'\s>]*`, 'gi'),
    new RegExp(String.raw`<link\b[^>]*\bhref\s*=\s*["']?${REMOTE}[^"'\s>]*`, 'gi'),
    new RegExp(String.raw`\bfrom\s*["']${REMOTE}[^"']*["']`, 'g'),
    new RegExp(String.raw`\bimport\s*\(\s*["']${REMOTE}[^"']*["']`, 'g'),
    /\bimportScripts\s*\(/g,
];

/** Every place `text` loads a script, module or stylesheet from the network. */
export function findRemoteScripts(text: string): string[] {
    return PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0]));
}
