// The four creatures, ported from Dita's approved preview. Not unit-tested: WebGL. They are
// checked by screenshots from Kelpi's private instance.
import {
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    Vector3,
} from 'three';
import type { SessionRole, TankSession } from '../tank-state';
import { blob, mix, toon } from './toon';

const CONE4 = new ConeGeometry(1, 1, 4);
const CONE5 = new ConeGeometry(1, 1, 5);
const WHITE = new MeshBasicMaterial({ color: 0xffffff });
const BLACK = new MeshBasicMaterial({ color: 0x1b1b2a });
const PINK = new MeshBasicMaterial({ color: 0xff9fb5, transparent: true, opacity: 0.8 });

/** How big each creature is, and how far its nose reaches ahead of its centre (in its own units). */
export const SIZE: Record<SessionRole, number> = {
    day: 0.16,
    conductor: 0.17,
    rail: 0.055,
    fish: 0.12,
};
export const NOSE: Record<SessionRole, number> = {
    day: 1.75,
    conductor: 1.05,
    rail: 1.2,
    fish: 1.2,
};

export interface Creature {
    group: Group;
    /** Moving parts, present only on the creatures that have them. */
    tail?: Group;
    fins?: Group[];
    head?: Group;
    front?: Group[];
    back?: Group[];
    /** World size scale, so `SIZE[role]`. */
    scale: number;
}

function eyes(g: Group, x: number, y: number, z: number, r: number) {
    for (const s of [1, -1]) {
        g.add(
            blob(WHITE, r, r, r)
                .translateX(x)
                .translateY(y)
                .translateZ(z * s),
        );
        const dir = new Vector3(0.55, 0.05, 0.83 * s).normalize();
        const p = dir.clone().multiplyScalar(r * 0.6);
        g.add(
            blob(BLACK, r * 0.55, r * 0.6, r * 0.55)
                .translateX(x + p.x)
                .translateY(y + p.y)
                .translateZ(z * s + p.z),
        );
        const h = dir.clone().multiplyScalar(r * 0.98);
        g.add(
            blob(WHITE, r * 0.18, r * 0.18, r * 0.18)
                .translateX(x + h.x + r * 0.1)
                .translateY(y + h.y + r * 0.22)
                .translateZ(z * s + h.z),
        );
    }
}

function cone(
    geometry: ConeGeometry,
    material: ReturnType<typeof toon>,
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
    rz = 0,
) {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    return mesh;
}

function at<T extends Mesh>(mesh: T, x: number, y: number, z: number): T {
    mesh.position.set(x, y, z);
    return mesh;
}

function buildFish(color: string, eyeRadius = 0.27) {
    const g = new Group();
    const body = toon(color);
    const belly = toon(mix(color, '#ffffff', 0.55));
    const fin = toon(mix(color, '#ffffff', 0.25));
    g.add(blob(body, 1.2, 1, 0.85));
    g.add(at(blob(belly, 0.95, 0.6, 0.72), 0.15, -0.32, 0));
    const tail = new Group();
    tail.position.x = -1.05;
    tail.add(cone(CONE4, fin, 0.55, 0.8, 0.2, -0.36, 0, 0, -Math.PI / 2));
    g.add(tail);
    g.add(cone(CONE4, fin, 0.32, 0.55, 0.12, -0.15, 0.9, 0, 0.5));
    const fins: Group[] = [];
    for (const s of [1, -1]) {
        const f = new Group();
        f.position.set(0.25, -0.3, 0.68 * s);
        f.add(at(blob(fin, 0.32, 0.1, 0.18), -0.15, 0, 0.08 * s));
        g.add(f);
        fins.push(f);
    }
    eyes(g, 0.72, 0.22, 0.5, eyeRadius);
    for (const s of [1, -1]) g.add(at(blob(PINK, 0.16, 0.08, 0.03), 0.62, -0.12, 0.71 * s));
    g.add(at(blob(BLACK, 0.05, 0.035, 0.12), 1.19, -0.12, 0));
    return { group: g, tail, fins };
}

function buildPuffer(color: string) {
    const g = new Group();
    const body = toon(color);
    const belly = toon(mix(color, '#ffffff', 0.55));
    const spike = toon(mix(color, '#ffffff', 0.35));
    g.add(blob(body, 1, 1, 1));
    g.add(at(blob(belly, 0.9, 0.78, 0.9), 0.06, -0.2, 0));
    const N = 54;
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N;
        const r = Math.sqrt(1 - y * y);
        const phi = i * 2.39996;
        const n = new Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r);
        if ((n.x > 0.4 && Math.abs(n.y) < 0.65) || n.y > 0.8) continue;
        const m = new Mesh(CONE5, spike);
        m.scale.set(0.06, 0.22, 0.06);
        m.position.copy(n).multiplyScalar(1.04);
        m.quaternion.setFromUnitVectors(up, n);
        g.add(m);
    }
    const tail = new Group();
    tail.position.x = -0.95;
    tail.add(cone(CONE4, spike, 0.42, 0.5, 0.16, -0.22, 0, 0, -Math.PI / 2));
    g.add(tail);
    const fins: Group[] = [];
    for (const s of [1, -1]) {
        const f = new Group();
        f.position.set(0.2, -0.2, 0.95 * s);
        f.add(at(blob(spike, 0.26, 0.09, 0.14), -0.12, 0, 0.05 * s));
        g.add(f);
        fins.push(f);
    }
    eyes(g, 0.6, 0.25, 0.62, 0.33);
    for (const s of [1, -1]) g.add(at(blob(PINK, 0.15, 0.08, 0.03), 0.6, -0.17, 0.78 * s));
    g.add(at(blob(BLACK, 0.07, 0.07, 0.1), 0.99, -0.14, 0));
    // The conductor's tiny crown.
    const goldMaterial = toon('#ffd34d');
    const gold = goldMaterial.clone();
    gold.side = DoubleSide;
    const crown = new Group();
    crown.position.set(-0.05, 0.98, 0);
    crown.add(new Mesh(new CylinderGeometry(0.34, 0.38, 0.2, 12, 1, true), gold));
    for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        crown.add(cone(CONE4, gold, 0.08, 0.2, 0.08, Math.cos(a) * 0.34, 0.19, Math.sin(a) * 0.34));
        crown.add(
            at(
                blob(toon('#ff6f91'), 0.05, 0.05, 0.05),
                Math.cos(a) * 0.34,
                0.31,
                Math.sin(a) * 0.34,
            ),
        );
    }
    g.add(crown);
    return { group: g, tail, fins };
}

function buildTurtle(color: string) {
    const g = new Group();
    const shell = toon(color);
    const spot = toon(mix(color, '#ffffff', 0.45));
    const skin = toon('#a6dcae');
    const plastron = toon('#f3e3b3');
    g.add(at(blob(shell, 1.1, 0.6, 0.9), 0, 0.12, 0));
    g.add(at(blob(plastron, 1.0, 0.28, 0.82), 0, -0.12, 0));
    for (const [x, z] of [
        [0, 0],
        [0.45, 0.28],
        [0.45, -0.28],
        [-0.45, 0.28],
        [-0.45, -0.28],
    ]) {
        const y = 0.12 + 0.6 * Math.sqrt(Math.max(0, 1 - (x / 1.1) ** 2 - (z / 0.9) ** 2));
        g.add(at(blob(spot, 0.22, 0.07, 0.2), x, y - 0.02, z));
    }
    const head = new Group();
    head.position.set(1.0, 0.05, 0);
    head.add(at(blob(skin, 0.45, 0.38, 0.38), 0.3, 0.05, 0));
    eyes(head, 0.5, 0.2, 0.22, 0.15);
    for (const s of [1, -1]) head.add(at(blob(PINK, 0.08, 0.045, 0.02), 0.5, 0, 0.34 * s));
    head.add(at(blob(BLACK, 0.05, 0.02, 0.1), 0.74, -0.02, 0));
    g.add(head);
    const front: Group[] = [];
    const back: Group[] = [];
    for (const s of [1, -1]) {
        const f = new Group();
        f.position.set(0.5, -0.02, 0.72 * s);
        const flipper = at(blob(skin, 0.48, 0.07, 0.2), 0.15, 0, 0.22 * s);
        flipper.rotation.y = -0.5 * s;
        f.add(flipper);
        g.add(f);
        front.push(f);
        const b = new Group();
        b.position.set(-0.6, -0.05, 0.6 * s);
        b.add(at(blob(skin, 0.28, 0.06, 0.15), -0.08, 0, 0.12 * s));
        g.add(b);
        back.push(b);
    }
    g.add(cone(CONE4, skin, 0.12, 0.3, 0.08, -1.12, 0, 0, Math.PI / 2));
    return { group: g, head, front, back };
}

/** Builds the creature for a session, tinted with its workspace's colour, tagged with its pane id. */
export function makeCreature(session: TankSession, colorHex: string): Creature {
    const parts =
        session.role === 'day'
            ? buildTurtle(colorHex)
            : session.role === 'conductor'
              ? buildPuffer(colorHex)
              : session.role === 'rail'
                ? buildFish(mix(colorHex, '#ffffff', 0.2), 0.34)
                : buildFish(colorHex);
    const scale = SIZE[session.role];
    parts.group.scale.setScalar(scale);
    parts.group.userData.paneId = session.paneId;
    return { ...parts, scale };
}
