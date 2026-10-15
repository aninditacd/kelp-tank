// No tests by design: this probe is one-off evidence tooling (see probes/tank-probe/README.md).
/**
 * Probe view, for issue #2's open questions only. It is never shipped.
 * - Frame rate: animates 12 moving shapes and reports frames per second over 2-second windows, with the view's width.
 * - Focus: when the pane labelled `focus-target` is waiting, it focuses that pane once through
 *   `ui.focusPane`, as a click on a fish would.
 */
import {
    BoxGeometry,
    Color,
    Mesh,
    MeshNormalMaterial,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
} from 'three';

interface ProbeViewApi {
    ready: Promise<void>;
    commands: { execute(id: string, args?: unknown): Promise<unknown> };
    events: { on(name: string, listener: (event: unknown) => void): () => void };
    command(payload: Record<string, unknown>): Promise<{ ok: boolean; panes?: ProbePane[] }>;
    ui: { focusPane(workspaceID: string, paneID: string): Promise<void> };
}
interface ProbePane {
    id: string;
    label?: string;
    status: string;
    workspace_id: string;
}

const kelpi = (globalThis as unknown as { kelpi: ProbeViewApi }).kelpi;
const report = (args: Record<string, unknown>) =>
    kelpi.commands.execute('dita.kelp-tank-probe.report', args);

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
const scene = new Scene();
scene.background = new Color(0x0b4f6c);
const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 12;
const shapes = Array.from({ length: 12 }, (_, i) => {
    const mesh = new Mesh(new BoxGeometry(0.8, 0.8, 0.8), new MeshNormalMaterial());
    mesh.position.set(((i % 4) - 1.5) * 2, (Math.floor(i / 4) - 1) * 2.5, 0);
    scene.add(mesh);
    return mesh;
});

function resize() {
    const width = window.innerWidth;
    const height = Math.round(width * 1.25);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let frames = 0;
let windowStart = performance.now();
function tick(now: number) {
    shapes.forEach((mesh, i) => {
        mesh.rotation.x = now / 700 + i;
        mesh.rotation.y = now / 900 + i;
        mesh.position.x += Math.sin(now / 500 + i) * 0.01;
    });
    renderer.render(scene, camera);
    frames += 1;
    if (now - windowStart >= 2_000) {
        const fps = Math.round((frames * 1000) / (now - windowStart));
        void report({
            fps,
            width: window.innerWidth,
            devicePixelRatio: window.devicePixelRatio,
            visible: document.visibilityState,
        });
        frames = 0;
        windowStart = now;
    }
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

let focused = false;
async function maybeFocus() {
    if (focused) return;
    const reply = await kelpi.command({ command: 'pane-list' });
    const target = reply.panes?.find((pane) => pane.label === 'focus-target');
    if (!target || target.status !== 'waitingForInput') return;
    focused = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await kelpi.ui.focusPane(target.workspace_id, target.id);
    await report({ focused: target.id, at: new Date().toISOString() });
}

void kelpi.ready.then(() => {
    kelpi.events.on(
        'state.changed',
        () => void maybeFocus().catch((error) => report({ error: String(error) })),
    );
    void report({ ready: true, width: window.innerWidth });
    void maybeFocus().catch((error) => report({ error: String(error) }));
});
