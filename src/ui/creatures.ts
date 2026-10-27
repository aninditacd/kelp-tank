// The creatures, ported from Dita's approved preview. Not unit-tested: WebGL. They are
// checked by screenshots from Kelpi's private instance.
import {
    BoxGeometry,
    ConeGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    type MeshToonMaterial,
    Quaternion,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from 'three';
import type { SessionRole, TankSession } from '../tank-state';
import { blob, mix, toon } from './toon';

const CONE4 = new ConeGeometry(1, 1, 4);
const CONE5 = new ConeGeometry(1, 1, 5);
const CONE8 = new ConeGeometry(1, 1, 8);
const WHITE = new MeshBasicMaterial({ color: 0xffffff });
const BLACK = new MeshBasicMaterial({ color: 0x1b1b2a });
const PINK = new MeshBasicMaterial({ color: 0xff9fb5, transparent: true, opacity: 0.8 });
/** An eyelid: the top half of a sphere, swung down over the eye to close it. */
const HEMI = new SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);

/** How big each creature is, and how far its nose reaches ahead of its centre (in its own units). */
export const SIZE: Record<SessionRole, number> = {
    day: 0.16,
    conductor: 0.17,
    rail: 0.055,
    fish: 0.12,
    brainstorming: 0.12,
    building: 0.12,
    researching: 0.13,
    reviewing: 0.12,
};
export const NOSE: Record<SessionRole, number> = {
    day: 1.75,
    conductor: 1.05,
    rail: 1.2,
    fish: 1.2,
    brainstorming: 1.2,
    building: 1.2,
    researching: 1.3,
    reviewing: 1.15,
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
    /** One lid per eye, hidden while open. `setLids` closes them. */
    lids: Mesh[];
    /** How far the top of the body sits above its centre, in the creature's own units. */
    top: number;
}

/** Closes every lid of `creature` by `closure`: 0 open (hidden), 0.5 half shut, 1 asleep. */
export function setLids(creature: Creature, closure: number) {
    for (const lid of creature.lids) {
        lid.visible = closure > 0.02;
        lid.rotation.set((lid.userData.side as number) * (-Math.PI / 2 + closure * Math.PI), 0, 0);
    }
}

function eyes(
    g: Group,
    x: number,
    y: number,
    z: number,
    r: number,
    lidHex: string,
    lids: Mesh[],
    /** How far forward the pupils look: higher looks straight ahead, as through glasses. */
    forward = 0.55,
) {
    for (const s of [1, -1]) {
        g.add(
            blob(WHITE, r, r, r)
                .translateX(x)
                .translateY(y)
                .translateZ(z * s),
        );
        const dir = new Vector3(forward, 0.05, 0.83 * s).normalize();
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
        const lid = new Mesh(HEMI, toon(lidHex));
        lid.scale.setScalar(r * 1.22);
        lid.position.set(x, y, z * s);
        lid.userData.side = s;
        lid.visible = false;
        g.add(lid);
        lids.push(lid);
    }
}

function cone(
    geometry: ConeGeometry,
    material: MeshToonMaterial | MeshBasicMaterial,
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
    const lids: Mesh[] = [];
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
    eyes(g, 0.72, 0.22, 0.5, eyeRadius, color, lids);
    for (const s of [1, -1]) g.add(at(blob(PINK, 0.16, 0.08, 0.03), 0.62, -0.12, 0.71 * s));
    g.add(at(blob(BLACK, 0.05, 0.035, 0.12), 1.19, -0.12, 0));
    return { group: g, tail, fins, lids, top: 1.0 };
}

function buildPuffer(color: string) {
    const g = new Group();
    const lids: Mesh[] = [];
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
    eyes(g, 0.6, 0.25, 0.62, 0.33, color, lids);
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
    return { group: g, tail, fins, lids, top: 1.35 };
}

function buildTurtle(color: string) {
    const g = new Group();
    const lids: Mesh[] = [];
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
    eyes(head, 0.5, 0.2, 0.22, 0.15, '#a6dcae', lids);
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
    return { group: g, head, front, back, lids, top: 0.75 };
}

// The work-kind fish: the plain fish with one prop, from the preview Dita picked on 27 Oct 2026.
// Hats sit on a dome whose rim is just under the skin, so the head fills it and nothing pokes
// through.

/** The plain fish's body radii, which the hats sit on. */
const BODY = new Vector3(1.2, 1, 0.85);
/** Where a hat sits: the top of the head, a little forward. A direction on the unit sphere. */
const HEAD = new Vector3(0.32, 0.95, 0).normalize();
const UP = new Vector3(0, 1, 0);

/** The point on the body's surface (scaled by `k`) in unit-sphere direction `d`, and the normal there. */
function onBody(d: Vector3, k = 1) {
    const point = new Vector3(d.x * BODY.x * k, d.y * BODY.y * k, d.z * BODY.z * k);
    const normal = new Vector3(d.x / BODY.x, d.y / BODY.y, d.z / BODY.z).normalize();
    return { point, normal };
}

// Shared like the other creatures' materials and shapes, so building a creature allocates no new
// GPU resources and leaving one frees nothing.
const NAVY = twoSided('#34407a');
const HAT_YELLOW = twoSided('#ffc93c');
const GOLD = new MeshBasicMaterial({ color: 0xffe27a });
const MOUTH = new MeshBasicMaterial({ color: 0x2a1530 });
const BULB = new MeshBasicMaterial({ color: 0xfff1a0 });
const HALO = new MeshBasicMaterial({
    color: 0xffe066,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
});
const DOME = new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const BOX = new BoxGeometry(1.35, 1.05, 0.95);
const RING = new TorusGeometry(0.33, 0.04, 8, 28);

function twoSided(hex: string): MeshToonMaterial {
    const material = toon(hex).clone();
    material.side = DoubleSide;
    return material;
}

/** A half dome on the head, `w` wide and `h` tall, its rim sunk `sink` under the skin. */
function dome(material: MeshToonMaterial, w: number, h: number, sink: number) {
    const { point, normal } = onBody(HEAD);
    const mesh = new Mesh(DOME, material);
    mesh.scale.set(w, h, w);
    mesh.position.copy(point).addScaledVector(normal, -sink);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, normal));
    return mesh;
}

function buildWizard(color: string) {
    const parts = buildFish(color);
    const navy = NAVY;
    const gold = GOLD;
    parts.group.add(dome(navy, 0.46, 0.2, 0.08));
    const { point, normal } = onBody(HEAD, 1.08);
    const hat = new Group();
    hat.position.copy(point);
    hat.quaternion.setFromUnitVectors(UP, normal);
    const tip = new Group();
    tip.rotation.z = 0.25;
    tip.add(cone(CONE8, navy, 0.4, 1.0, 0.4, 0, 0.48, 0));
    tip.add(at(blob(gold, 0.09, 0.09, 0.09), 0, 1.0, 0));
    for (const [y, a, s] of [
        [0.3, 0.9, 0.07],
        [0.6, -0.4, 0.055],
        [0.22, -1.7, 0.05],
    ] as const) {
        const r = 0.4 * (1 - y) + 0.01;
        tip.add(at(blob(gold, s, s, s * 0.5), Math.sin(a) * r, y, Math.cos(a) * r));
    }
    hat.add(tip);
    parts.group.add(hat);
    return { ...parts, top: 1.9 };
}

function buildHardHat(color: string) {
    const parts = buildFish(color);
    const yellow = HAT_YELLOW;
    const angle = 0.5;
    parts.group.add(dome(yellow, 0.6, 0.46, 0.1));
    const top = onBody(HEAD, 1.33);
    const ridge = blob(toon('#eaa21c'), 0.5, 0.1, 0.1);
    ridge.position.copy(top.point);
    ridge.quaternion.setFromUnitVectors(UP, top.normal);
    parts.group.add(ridge);
    // The peak juts forward from the helmet's front edge, flat on the tangent there, so it never
    // dips into the body.
    const a = Math.atan2(HEAD.x, HEAD.y) + angle;
    const edge = onBody(new Vector3(Math.sin(a), Math.cos(a), 0), 1.06);
    const tangent = new Vector3(edge.normal.y, -edge.normal.x, 0);
    const peak = blob(yellow, 0.3, 0.04, 0.48);
    peak.position.copy(edge.point).addScaledVector(tangent, 0.2).addScaledVector(edge.normal, 0.04);
    peak.quaternion.setFromUnitVectors(UP, edge.normal);
    parts.group.add(peak);
    return { ...parts, top: 1.45 };
}

function buildAngler(color: string) {
    const parts = buildFish(color);
    const g = parts.group;
    g.add(at(blob(MOUTH, 0.32, 0.18, 0.45), 1.0, -0.32, 0));
    for (let i = -2; i <= 2; i++) {
        const tooth = cone(CONE4, WHITE, 0.05, 0.12, 0.05, 1.12, -0.2, i * 0.13, Math.PI);
        g.add(tooth);
    }
    const stalk = toon(mix(color, '#000000', 0.15));
    const lure = new Group();
    lure.position.set(0.3, 0.95, 0);
    for (const [x, y] of [
        [0, 0],
        [0.18, 0.28],
        [0.45, 0.42],
        [0.75, 0.38],
        [0.95, 0.22],
    ] as const) {
        lure.add(at(blob(stalk, 0.06, 0.06, 0.06), x, y, 0));
    }
    lure.add(at(blob(BULB, 0.15, 0.15, 0.15), 1.02, 0.1, 0));
    lure.add(at(blob(HALO, 0.3, 0.3, 0.3), 1.02, 0.1, 0));
    g.add(lure);
    return { ...parts, top: 1.35 };
}

function buildSpectacled(color: string) {
    const g = new Group();
    const lids: Mesh[] = [];
    const body = toon(color);
    const fin = toon(mix(color, '#ffffff', 0.25));
    g.add(new Mesh(BOX, body));
    g.add(at(blob(body, 0.95, 0.72, 0.66), 0.05, 0, 0));
    g.add(at(blob(toon(mix(color, '#ffffff', 0.55)), 0.8, 0.35, 0.6), 0.1, -0.45, 0));
    const tail = new Group();
    tail.position.x = -0.95;
    tail.add(cone(CONE4, fin, 0.45, 0.6, 0.16, -0.3, 0, 0, -Math.PI / 2));
    g.add(tail);
    const fins: Group[] = [];
    for (const s of [1, -1]) {
        const f = new Group();
        f.position.set(0.3, -0.25, 0.64 * s);
        f.add(at(blob(fin, 0.26, 0.08, 0.15), -0.12, 0, 0.06 * s));
        g.add(f);
        fins.push(f);
    }
    eyes(g, 0.86, 0.25, 0.33, 0.3, color, lids, 1.2);
    for (const s of [1, -1]) {
        const ring = new Mesh(RING, BLACK);
        ring.position.set(1.0, 0.25, 0.33 * s);
        ring.rotation.y = Math.PI / 2 - 0.35 * s;
        g.add(ring);
        g.add(at(blob(BLACK, 0.4, 0.025, 0.025), 0.7, 0.28, 0.63 * s));
    }
    g.add(at(blob(BLACK, 0.025, 0.025, 0.12), 1.05, 0.3, 0));
    for (const s of [1, -1]) g.add(at(blob(PINK, 0.12, 0.06, 0.03), 0.95, -0.15, 0.58 * s));
    g.add(at(blob(BLACK, 0.05, 0.04, 0.1), 0.92, -0.3, 0));
    return { group: g, tail, fins, lids, top: 0.75 };
}

function buildFor(role: SessionRole, colorHex: string) {
    switch (role) {
        case 'day':
            return buildTurtle(colorHex);
        case 'conductor':
            return buildPuffer(colorHex);
        case 'rail':
            return buildFish(mix(colorHex, '#ffffff', 0.2), 0.34);
        case 'brainstorming':
            return buildWizard(colorHex);
        case 'building':
            return buildHardHat(colorHex);
        case 'researching':
            return buildAngler(colorHex);
        case 'reviewing':
            return buildSpectacled(colorHex);
        case 'fish':
            return buildFish(colorHex);
    }
}

/** Builds the creature for a session, tinted with its workspace's colour, tagged with its pane id. */
export function makeCreature(session: TankSession, colorHex: string): Creature {
    const parts = buildFor(session.role, colorHex);
    const scale = SIZE[session.role];
    parts.group.scale.setScalar(scale);
    parts.group.userData.paneId = session.paneId;
    return { ...parts, scale };
}

/** A baby fish's size: about two thirds of a rail's. */
export const BABY_SIZE = SIZE.rail * 0.67;

/**
 * Builds a baby fish for one of a session's background agents: a round little fry in a paler tint
 * of the workspace colour, with oversized eyes. It carries its parent's pane id, so hovering or
 * clicking it acts on the parent session.
 */
export function makeBaby(colorHex: string, parentPaneId: string): Creature {
    const parts = buildFish(mix(colorHex, '#ffffff', 0.45), 0.42);
    // Shorter nose to tail than a grown fish, so it reads as round.
    parts.group.scale.set(BABY_SIZE * 0.85, BABY_SIZE, BABY_SIZE);
    parts.group.userData.paneId = parentPaneId;
    return { ...parts, scale: BABY_SIZE };
}
