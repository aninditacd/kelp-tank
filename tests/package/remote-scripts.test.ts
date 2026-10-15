import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REVISION } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildToTemp } from './build-to-temp';
import { findRemoteScripts } from './find-remote-scripts';

function filesUnder(dir: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('findRemoteScripts', () => {
    it('findRemoteScripts flags a script tag that loads from a CDN', () => {
        const html =
            '<script src="https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js"></script>';
        expect(findRemoteScripts(html)).toHaveLength(1);
        expect(findRemoteScripts('<script src=//unpkg.com/three></script>')).toHaveLength(1);
        expect(
            findRemoteScripts('<link rel="stylesheet" href="https://x.test/a.css">'),
        ).toHaveLength(1);
    });

    it('findRemoteScripts flags a static or dynamic import from a URL', () => {
        expect(findRemoteScripts('import * as THREE from "https://esm.sh/three";')).toHaveLength(1);
        expect(findRemoteScripts("const m = await import('https://esm.sh/three');")).toHaveLength(
            1,
        );
        expect(findRemoteScripts("importScripts('worker.js');")).toHaveLength(1);
    });

    it('findRemoteScripts ignores a URL that is not loaded as code', () => {
        const text = [
            '// See https://github.com/mrdoob/three.js for details',
            'const docs = "https://threejs.org/docs";',
            '<script src="app.js"></script>',
            '<a href="https://example.test">link</a>',
            "import { x } from './local.js';",
        ].join('\n');
        expect(findRemoteScripts(text)).toEqual([]);
    });
});

describe('the built plugin', () => {
    let outdir: string;
    beforeAll(() => {
        outdir = buildToTemp();
    });

    it('the built plugin loads no script from the network', () => {
        const files = filesUnder(outdir).filter((file) => /\.(html|js|mjs)$/.test(file));
        expect(files.map((file) => path.relative(outdir, file)).sort()).toEqual([
            'backend.mjs',
            path.join('ui', 'app.js'),
            path.join('ui', 'index.html'),
        ]);
        const found = files.flatMap((file) =>
            findRemoteScripts(readFileSync(file, 'utf8')).map((hit) => `${file}: ${hit}`),
        );
        expect(found).toEqual([]);
    });

    it('the built view bundles Three.js into ui/app.js', () => {
        const app = readFileSync(path.join(outdir, 'ui', 'app.js'), 'utf8');
        expect(app).toContain(`var REVISION = "${REVISION}"`);
    });

    it('the built view never loads three as an outside module', () => {
        const app = readFileSync(path.join(outdir, 'ui', 'app.js'), 'utf8');
        expect(app).not.toMatch(/(require\(\s*|from\s*)["']three["']/);
    });
});
