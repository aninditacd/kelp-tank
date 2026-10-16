// What a creature shows it is doing, ported from the activity preview Dita picked from on
// 16 Oct 2026: circling pages (reading), a doodling pencil (editing), a tiny terminal (a command),
// an orbiting globe (the web) and a "..." thought bubble (a subagent). Also the sweat drop of a
// tired creature and the rising "z"s of a dozing one. Not unit-tested: WebGL. They are checked by
// a screen recording from Kelpi's private instance.
//
// Every prop lives in world space around the creature, not on its body, and is sized in the
// creature's own units, so it scales with the creature and reads in a narrow sidebar.
import {
    BoxGeometry,
    CanvasTexture,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    SRGBColorSpace,
    Sprite,
    SpriteMaterial,
    TorusGeometry,
    Vector3,
} from 'three';
import type { Activity } from '../activity';
import { blob, SPHERE, toon } from './toon';

/** Where a creature is: its centre, its world scale and the top of its body in its own units. */
export interface PropAnchor {
    pos: Vector3;
    scale: number;
    top: number;
}

function canvasTexture(
    width: number,
    height: number,
    draw: (x: CanvasRenderingContext2D) => void,
): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d')!);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

/** Shared textures, made on first use so importing this module draws nothing. */
const shared = new Map<string, CanvasTexture>();
function sharedTexture(key: string, make: () => CanvasTexture): CanvasTexture {
    let texture = shared.get(key);
    if (!texture) {
        texture = make();
        shared.set(key, texture);
    }
    return texture;
}

const pageTexture = () =>
    sharedTexture('page', () =>
        canvasTexture(48, 64, (x) => {
            x.fillStyle = '#fffdf4';
            x.fillRect(0, 0, 48, 64);
            x.strokeStyle = '#7d93b2';
            x.lineWidth = 4;
            x.lineCap = 'round';
            for (let i = 0; i < 5; i++) {
                x.beginPath();
                x.moveTo(8, 12 + i * 10);
                x.lineTo(i % 2 ? 30 : 40, 12 + i * 10);
                x.stroke();
            }
        }),
    );
const dotTexture = () =>
    sharedTexture('dot', () =>
        canvasTexture(32, 32, (x) => {
            x.fillStyle = '#ffe36e';
            x.beginPath();
            x.arc(16, 16, 12, 0, 7);
            x.fill();
        }),
    );
const zTexture = () =>
    sharedTexture('z', () =>
        canvasTexture(64, 64, (x) => {
            x.fillStyle = '#ffffff';
            x.font = 'bold 52px Fredoka, sans-serif';
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.strokeStyle = '#2b6c86';
            x.lineWidth = 6;
            x.strokeText('z', 32, 34);
            x.fillText('z', 32, 34);
        }),
    );
const dropTexture = () =>
    sharedTexture('drop', () =>
        canvasTexture(64, 64, (x) => {
            x.fillStyle = '#bfe9ff';
            x.strokeStyle = '#3b8fc0';
            x.lineWidth = 4;
            x.beginPath();
            x.moveTo(32, 6);
            x.bezierCurveTo(52, 32, 54, 58, 32, 58);
            x.bezierCurveTo(10, 58, 12, 32, 32, 6);
            x.fill();
            x.stroke();
        }),
    );

function sprite(map: CanvasTexture, size: number): Sprite {
    const s = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
}

function drawTerminal(texture: CanvasTexture, t: number) {
    const x = (texture.image as HTMLCanvasElement).getContext('2d')!;
    x.fillStyle = '#132029';
    x.fillRect(0, 0, 128, 96);
    x.fillStyle = '#2b3d4a';
    x.fillRect(0, 0, 128, 14);
    for (const [i, c] of ['#ff6f61', '#ffd34d', '#5fbe89'].entries()) {
        x.fillStyle = c;
        x.beginPath();
        x.arc(10 + i * 11, 7, 3.5, 0, 7);
        x.fill();
    }
    const step = Math.floor(t * 4);
    for (let r = 0; r < 6; r++) {
        const n = step - 5 + r;
        if (n < 0) continue;
        x.fillStyle = n % 4 === 0 ? '#7fe0a8' : '#9ec7d6';
        x.fillRect(8, 20 + r * 12, 20 + ((n * 37) % 70), 5);
    }
    if (Math.floor(t * 2) % 2) {
        x.fillStyle = '#7fe0a8';
        x.fillRect(8 + 20 + ((step * 37) % 70) + 4, 20 + 5 * 12 - 1, 6, 8);
    }
    texture.needsUpdate = true;
}

function drawThought(texture: CanvasTexture, t: number) {
    const x = (texture.image as HTMLCanvasElement).getContext('2d')!;
    x.clearRect(0, 0, 128, 96);
    x.fillStyle = '#ffffff';
    x.strokeStyle = '#3b8fc0';
    x.lineWidth = 5;
    x.beginPath();
    x.ellipse(70, 40, 50, 32, 0, 0, 7);
    x.fill();
    x.stroke();
    x.beginPath();
    x.arc(22, 80, 8, 0, 7);
    x.fill();
    x.stroke();
    x.beginPath();
    x.arc(10, 92, 4, 0, 7);
    x.fill();
    x.stroke();
    for (let i = 0; i < 3; i++) {
        x.fillStyle = Math.floor(t * 3) % 4 > i ? '#3b8fc0' : '#cfe6f0';
        x.beginPath();
        x.arc(48 + i * 22, 40, 7, 0, 7);
        x.fill();
    }
    texture.needsUpdate = true;
}

function makePencil(): Group {
    const pencil = new Group();
    pencil.add(new Mesh(new CylinderGeometry(0.07, 0.07, 0.75, 6), toon('#ffcf3f')));
    const tip = new Mesh(new ConeGeometry(0.07, 0.2, 6), toon('#f2c9a0'));
    tip.position.y = -0.47;
    tip.rotation.x = Math.PI;
    pencil.add(tip);
    const lead = new Mesh(new ConeGeometry(0.025, 0.07, 6), toon('#333344'));
    lead.position.y = -0.6;
    lead.rotation.x = Math.PI;
    pencil.add(lead);
    const rubber = new Mesh(new CylinderGeometry(0.07, 0.07, 0.12, 8), toon('#ff8fa3'));
    rubber.position.y = 0.43;
    pencil.add(rubber);
    return pencil;
}

function makeGlobe(): Group {
    const globe = new Group();
    globe.add(blob(toon('#4aa3df'), 0.26, 0.26, 0.26));
    for (const [x, y, z, s] of [
        [0.15, 0.1, 0.17, 0.12],
        [-0.1, -0.12, 0.2, 0.1],
        [0.05, 0.2, -0.15, 0.1],
        [-0.2, 0.0, -0.1, 0.12],
    ]) {
        const land = blob(toon('#6cc070'), s, s * 0.7, s);
        land.position.set(x, y, z);
        globe.add(land);
    }
    const ring = new Mesh(new TorusGeometry(0.33, 0.015, 6, 32), toon('#ffffff'));
    ring.rotation.x = 1.2;
    globe.add(ring);
    globe.scale.setScalar(1.5);
    return globe;
}

/** One creature's prop for one activity. `amount` (0 to 1) grows it in and shrinks it away. */
export interface PropFx {
    activity: Activity;
    group: Group;
    step(anchor: PropAnchor, t: number, dt: number, amount: number): void;
    dispose(): void;
}

export function makePropFx(activity: Activity): PropFx {
    const group = new Group();
    const disposers: (() => void)[] = [];
    let step: (anchor: PropAnchor, t: number, dt: number) => void;

    if (activity === 'read') {
        const pages = [0, 1, 2].map(() => {
            const page = new Mesh(
                new PlaneGeometry(0.62, 0.82),
                new MeshBasicMaterial({ map: pageTexture(), side: DoubleSide }),
            );
            group.add(page);
            return page;
        });
        step = (_anchor, t) =>
            pages.forEach((page, i) => {
                const a = t * 1.1 + i * 2.09;
                page.position.set(
                    Math.cos(a) * 1.6,
                    0.45 + Math.sin(a * 1.7 + i) * 0.25,
                    0.4 + Math.sin(a) * 0.9,
                );
                page.rotation.set(Math.sin(t + i) * 0.4, -a, Math.sin(t * 1.3 + i) * 0.35);
            });
    } else if (activity === 'edit') {
        const pencil = makePencil();
        pencil.scale.setScalar(1.6);
        group.add(pencil);
        const dots = Array.from({ length: 24 }, () => {
            const s = sprite(dotTexture(), 0.2);
            s.visible = false;
            group.add(s);
            return { s, age: 9 };
        });
        const tip = new Vector3();
        step = (_anchor, t, dt) => {
            const a = t * 1.5;
            pencil.position.set(
                Math.cos(a) * 1.6,
                0.5 + Math.sin(a * 3) * 0.3,
                0.4 + Math.sin(a) * 0.9,
            );
            pencil.rotation.set(0, -a, 0.6);
            pencil.updateMatrix();
            tip.set(0, -0.62, 0).applyMatrix4(pencil.matrix);
            const free = dots.find((d) => d.age > 1.6);
            if (free && Math.random() < dt * 14) {
                free.age = 0;
                free.s.position.copy(tip);
            }
            for (const d of dots) {
                d.age += dt;
                d.s.visible = d.age < 1.6;
                d.s.material.opacity = Math.max(0, 1 - d.age / 1.6);
            }
        };
    } else if (activity === 'command') {
        const texture = canvasTexture(128, 96, () => {});
        disposers.push(() => texture.dispose());
        const screen = new Group();
        screen.add(new Mesh(new BoxGeometry(1.0, 0.78, 0.08), toon('#b8c4cc')));
        const face = new Mesh(
            new PlaneGeometry(0.88, 0.66),
            new MeshBasicMaterial({ map: texture }),
        );
        face.position.z = 0.045;
        screen.add(face);
        const stand = new Mesh(new BoxGeometry(0.12, 0.3, 0.06), toon('#8a99a3'));
        stand.position.y = -0.5;
        screen.add(stand);
        group.add(screen);
        step = (anchor, t) => {
            drawTerminal(texture, t);
            // Beside the creature on the side nearer the tank's middle, angled to the viewer.
            const side = anchor.pos.x > 0 ? -1 : 1;
            screen.position.set(side * 1.7, 0.35 + Math.sin(t * 1.3) * 0.05, 0.5);
            screen.rotation.y = -side * 0.25;
        };
    } else if (activity === 'web') {
        const globe = makeGlobe();
        group.add(globe);
        step = (anchor, t) => {
            const a = t * 1.6;
            globe.position.set(
                Math.cos(a) * 1.0,
                anchor.top + 0.25 + Math.sin(a * 2) * 0.1,
                Math.sin(a) * 0.8,
            );
            globe.rotation.y = t * 2;
        };
    } else {
        const texture = canvasTexture(128, 96, () => {});
        disposers.push(() => texture.dispose());
        const thought = sprite(texture, 1);
        thought.scale.set(1.1, 0.82, 1);
        group.add(thought);
        step = (anchor, t) => {
            drawThought(texture, t);
            thought.position.set(0.3, anchor.top + 0.9, 0);
        };
    }

    return {
        activity,
        group,
        step(anchor, t, dt, amount) {
            group.visible = amount > 0.01;
            group.position.copy(anchor.pos);
            group.scale.setScalar(anchor.scale * amount);
            if (group.visible) step(anchor, t, dt);
        },
        dispose() {
            group.removeFromParent();
            // Toon materials, the sphere and the page, dot, "z" and drop textures are shared and
            // stay. Each prop's own geometry, plain materials and canvas textures go.
            group.traverse((object) => {
                if (object instanceof Mesh) {
                    if (object.geometry !== SPHERE) object.geometry.dispose();
                    if (object.material instanceof MeshBasicMaterial) object.material.dispose();
                } else if (object instanceof Sprite) {
                    object.material.dispose();
                }
            });
            disposers.forEach((dispose) => dispose());
        },
    };
}

/** A creature's sweat drop (tired) and rising "z"s (dozing), each faded by its own amount. */
export interface MoodFx {
    group: Group;
    step(anchor: PropAnchor, t: number, dt: number, tired: number, dozing: number): void;
    dispose(): void;
}

export function makeMoodFx(): MoodFx {
    const group = new Group();
    // Larger than the preview's, which drew creatures bigger: at tank scale 0.3 was a speck.
    const drop = sprite(dropTexture(), 0.55);
    group.add(drop);
    const zs = [0, 1, 2].map((i) => {
        const s = sprite(zTexture(), 0.4);
        group.add(s);
        return { s, age: i / 3 };
    });
    return {
        group,
        step(anchor, t, dt, tired, dozing) {
            group.position.copy(anchor.pos);
            group.scale.setScalar(anchor.scale);
            drop.visible = tired > 0.01;
            if (drop.visible) {
                const k = (t * 0.6) % 1;
                drop.position.set(0.55, anchor.top + 0.2 - k * 0.5, 0.7);
                drop.material.opacity = tired * (1 - k * k);
            }
            for (const z of zs) {
                z.s.visible = dozing > 0.01;
                if (!z.s.visible) continue;
                z.age = (z.age + dt * 0.35) % 1;
                z.s.position.set(
                    0.4 + z.age * 0.6 + Math.sin(z.age * 6) * 0.1,
                    anchor.top + 0.2 + z.age * 1.2,
                    0,
                );
                const size = 0.25 + z.age * 0.3;
                z.s.scale.set(size, size, 1);
                z.s.material.opacity = dozing * Math.sin(z.age * Math.PI);
            }
        },
        dispose() {
            group.removeFromParent();
            drop.material.dispose();
            zs.forEach((z) => z.s.material.dispose());
        },
    };
}
