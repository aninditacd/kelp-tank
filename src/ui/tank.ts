// Not unit-tested: WebGL has no runtime under Vitest. The pure layout and colour logic is tested
// in tests/ui/. This file is checked by screenshots from Kelpi's private instance.
import {
    AdditiveBlending,
    AmbientLight,
    BoxGeometry,
    CanvasTexture,
    DirectionalLight,
    DodecahedronGeometry,
    EdgesGeometry,
    Fog,
    Group,
    LineBasicMaterial,
    LineSegments,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
} from 'three';
import { ledgeLabel } from '../shortcuts';
import type { SessionRole, TankState } from '../tank-state';
import {
    bodyChanged,
    decideGoals,
    driftPoint,
    exitPoint,
    followPoint,
    glassSpot,
    isGone,
    type Goal,
    nudgePoint,
    speedFor,
    swimPoint,
    updatePose,
    type Box,
    type Vec3,
} from './behaviour';
import { kelpTint, workspaceHex } from './colors';
import { type Creature, makeCreature, NOSE } from './creatures';
import { type AlertFx, makeAlertFx, makeRipple, makeTickFx, type TickFx } from './effects';
import { DEPTH, layoutTank, PX_PER_UNIT, type TankLayout } from './layout';
import { entranceFor, openingView, type TankMemory, type TankSnapshot } from './memory';
import { pickPaneId } from './pick';
import { blob, toon } from './toon';
import { tooltipText } from './tooltip';
import {
    cameraFor,
    type Frame,
    fitView,
    relayView,
    scrollBy,
    type View,
    wheelAction,
    zoomAt,
} from './view';

const KELP_FOG = '#2f8297';
const SAND = '#e6d3a3';
const ROCK = '#6f8f9a';
const BUBBLE_COUNT = 9;
const BUTTON_ZOOM = 1.25;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const ROCK_GEOMETRY = new DodecahedronGeometry(1);
const BUBBLE_MATERIAL = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
});

function gradient(top: string, bottom: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const fill = context.createLinearGradient(0, 0, 0, 256);
    fill.addColorStop(0, top);
    fill.addColorStop(1, bottom);
    context.fillStyle = fill;
    context.fillRect(0, 0, 2, 256);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

function rayTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 4;
    const context = canvas.getContext('2d')!;
    const fill = context.createLinearGradient(0, 0, 64, 0);
    fill.addColorStop(0, 'rgba(255,255,255,0)');
    fill.addColorStop(0.5, 'rgba(255,255,255,1)');
    fill.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 4);
    return new CanvasTexture(canvas);
}

interface Kelp {
    leaves: Mesh[];
    x: number;
    count: number;
    seed: number;
}
interface Ray {
    mesh: Mesh;
    base: number;
    seed: number;
}
interface Bubble {
    mesh: Mesh;
    speed: number;
    seed: number;
    x0: number;
    x1: number;
}

export interface TankOptions {
    /** Called once per click on a creature, with its session's pane id. Never for empty water. */
    onSelect(paneId: string): void;
}

export interface Tank {
    setState(state: TankState): void;
    /**
     * What the tank remembered from an earlier page, or null for its very first open. Call it
     * before the first `setState`: creatures and the view start from it on the first showing.
     */
    recall(memory: TankMemory | null): void;
    /** The creatures and view to remember, or null until the tank has shown a state. */
    snapshot(): TankSnapshot | null;
    dispose(): void;
}

/** A creature while it is in the tank: the built meshes plus where it is and where it is heading. */
interface Swimmer extends Creature {
    paneId: string;
    role: SessionRole;
    colorHex: string;
    workspaceId: string;
    goal: Goal;
    box: Box;
    pos: Vector3;
    vel: Vector3;
    target: Vector3;
    spot: Vector3 | null;
    yaw: number;
    phase: number;
    retarget: number;
    tapping: boolean;
    lastTap: number;
    leaving: boolean;
    side: -1 | 1;
    gone: boolean;
    fx: AlertFx;
    /** The update creature's tick, and the clock time its update began (null until it steps). */
    tick: TickFx;
    updateT: number | null;
}

/** The goals that put a creature at the front glass. */
const atGlass = (goal: Goal) => goal.kind === 'glass' || goal.kind === 'update';

function lerpAngle(a: number, b: number, t: number): number {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

/**
 * Draws the kelp tank on `canvas`, kept at the size of its container: water, glass, sand, light
 * rays, bubbles, one rock ledge with kelp and a name chip per workspace, and a creature per
 * session. Where each creature heads is decided in `behaviour.ts`; this file moves and draws it.
 */
export function createTank(canvas: HTMLCanvasElement, options: TankOptions): Tank {
    const parent = canvas.parentElement!;
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new AmbientLight(0xffffff, 1.1));
    const sun = new DirectionalLight(0xffffff, 1.7);
    sun.position.set(1, 4, 3);
    scene.add(sun);

    const water = gradient('#62c6d8', '#134257');
    const rayMap = rayTexture();
    scene.background = water;

    let state: TankState = { workspaces: [], sessions: [] };
    let signature = '';
    let layout: TankLayout = layoutTank(1, 1, 0);
    let built: Group | null = null;
    let disposables: { dispose(): void }[] = [];
    let chips: { chip: HTMLElement; labelY: number }[] = [];
    let frameOf: Frame | null = null;
    let view: View = { zoom: 1, x: 0, y: 0 };
    let kelps: Kelp[] = [];
    let rays: Ray[] = [];
    let bubbles: Bubble[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    const swimmers = new Map<string, Swimmer>();
    const ripples: { mesh: Mesh; age: number }[] = [];
    // `received` turns on with the first state from Kelpi, and `settled` once creatures for it
    // exist. Until then nothing counts as arriving, so the empty start-up layout never makes the
    // first real creatures swim in.
    let received = false;
    let settled = false;
    let remembered: TankMemory | null = null;
    let viewRestored = false;
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    parent.append(tip);

    function clear() {
        if (built) scene.remove(built);
        for (const item of disposables) item.dispose();
        for (const { chip } of chips) chip.remove();
        built = null;
        disposables = [];
        chips = [];
        kelps = [];
        rays = [];
        bubbles = [];
    }

    function kelp(group: Group, x: number, z: number, y0: number, tall: number, color: string) {
        const step = 0.085;
        const count = Math.max(3, Math.round(tall / step));
        const material = toon(color);
        const leaves: Mesh[] = [];
        for (let i = 0; i < count; i++) {
            const leaf = blob(material, 0.05, 0.075, 0.014);
            leaf.position.set(x, y0 + i * step + 0.04, z);
            leaf.rotation.z = i % 2 ? 0.55 : -0.55;
            group.add(leaf);
            leaves.push(leaf);
        }
        kelps.push({ leaves, x, count, seed: Math.random() * 6 });
    }

    function build() {
        clear();
        layout = layoutTank(width, height, state.workspaces.length);
        const W = layout.width;
        const H = layout.height;
        const group = new Group();
        built = group;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const next: Frame = {
            tankWidth: W,
            tankHeight: H,
            viewWidth: width / PX_PER_UNIT,
            viewHeight: height / PX_PER_UNIT,
        };
        // The first layout with a real state opens at the remembered view, or the reset view;
        // later ones keep the zoom and scroll.
        if (received && !viewRestored) {
            viewRestored = true;
            view = openingView(remembered?.view ?? null, next);
        } else {
            view = frameOf ? relayView(view, frameOf, next) : fitView(next);
        }
        frameOf = next;

        const floorGeometry = new BoxGeometry(W, 0.05, DEPTH);
        disposables.push(floorGeometry);
        const floor = new Mesh(floorGeometry, toon(SAND));
        floor.position.set(0, -0.025, 0);
        group.add(floor);
        for (let i = 0; i < 5; i++) {
            const pebble = blob(toon('#b9c7c9'), rnd(0.03, 0.06), 0.025, rnd(0.03, 0.05));
            pebble.position.set(
                rnd(-W / 2 + 0.1, W / 2 - 0.1),
                0.01,
                rnd(-DEPTH / 2 + 0.1, DEPTH / 2 - 0.2),
            );
            group.add(pebble);
        }

        const glassGeometry = new EdgesGeometry(new BoxGeometry(W, H, DEPTH));
        const glassMaterial = new LineBasicMaterial({
            color: 0xe8fbff,
            transparent: true,
            opacity: 0.45,
            fog: false,
        });
        disposables.push(glassGeometry, glassMaterial);
        const glass = new LineSegments(glassGeometry, glassMaterial);
        glass.position.set(0, H / 2, 0);
        group.add(glass);

        const rayGeometry = new PlaneGeometry(0.22, H * 1.2);
        disposables.push(rayGeometry);
        for (let i = 0; i < 3; i++) {
            const material = new MeshBasicMaterial({
                map: rayMap,
                transparent: true,
                opacity: 0.07,
                blending: AdditiveBlending,
                depthWrite: false,
                fog: false,
            });
            disposables.push(material);
            const mesh = new Mesh(rayGeometry, material);
            mesh.position.set(rnd(-W / 2, W / 2), H * 0.55, -DEPTH / 2 + 0.05);
            mesh.rotation.z = rnd(-0.25, 0.1);
            group.add(mesh);
            rays.push({ mesh, base: mesh.rotation.z, seed: Math.random() * 6 });
        }

        state.workspaces.forEach((workspace, i) => {
            const ledge = layout.ledges[i];
            const rock = new Mesh(ROCK_GEOMETRY, toon(ROCK));
            rock.scale.set((ledge.rockX1 - ledge.rockX0) / 2, ledge.halfThickness, 0.5);
            rock.position.set(
                (ledge.rockX0 + ledge.rockX1) / 2,
                (ledge.rockY0 + ledge.rockY1) / 2,
                -0.12,
            );
            group.add(rock);

            const tint = kelpTint(workspace.color);
            for (let j = 0; j < 3; j++) {
                const x = ledge.side * (W / 2 - 0.1 - j * 0.1);
                kelp(
                    group,
                    x,
                    -0.32 + j * 0.16,
                    ledge.y + 0.05,
                    ledge.kelpHeight * rnd(0.65, 1),
                    tint,
                );
            }

            const chip = document.createElement('div');
            chip.className = 'ws-label';
            const dot = document.createElement('i');
            dot.style.background = workspaceHex(workspace.color);
            chip.append(dot, ledgeLabel(workspace));
            chip.style.maxWidth = Math.max(40, width - 12) + 'px';
            parent.append(chip);
            chips.push({ chip, labelY: ledge.labelY });
        });

        if (layout.ledges.length === 0) {
            kelp(group, -W / 2 + 0.1, -0.35, 0.03, rnd(0.55, 0.85), kelpTint('green'));
            kelp(group, -W / 2 + 0.2, -0.2, 0.03, rnd(0.4, 0.6), kelpTint('green'));
            kelp(group, W / 2 - 0.12, -0.3, 0.03, rnd(0.5, 0.75), kelpTint('green'));
        }

        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const ledge = layout.ledges.length ? layout.ledges[i % layout.ledges.length] : null;
            const x0 = ledge ? ledge.swim.x0 : -W / 2 + 0.1;
            const x1 = ledge ? ledge.swim.x1 : W / 2 - 0.1;
            const mesh = blob(BUBBLE_MATERIAL, 0.018, 0.018, 0.018);
            mesh.position.set(rnd(x0, x1), rnd(0.1, H - 0.1), rnd(-0.3, 0.2));
            group.add(mesh);
            bubbles.push({ mesh, speed: rnd(0.15, 0.3), seed: Math.random() * 6, x0, x1 });
        }

        scene.add(group);
        applyView();
        relayCreatures();
    }

    /** Points the camera at `view`, and keeps each ledge's name chip beside its ledge. */
    function applyView() {
        if (!frameOf) return;
        const cam = cameraFor(view, frameOf);
        camera.position.set(cam.x, cam.y, cam.distance);
        camera.lookAt(cam.x, cam.y, 0);
        camera.updateMatrixWorld();
        scene.fog = new Fog(KELP_FOG, cam.distance - DEPTH / 2, cam.distance + DEPTH * 3);
        for (const { chip, labelY } of chips) {
            const at = new Vector3(-layout.width / 2, labelY, DEPTH / 2).project(camera);
            const top = ((1 - at.y) / 2) * height + 2;
            chip.hidden = top < -20 || top > height;
            chip.style.left = Math.max(4, ((at.x + 1) / 2) * width + 4) + 'px';
            chip.style.top = Math.max(4, top) + 'px';
        }
    }

    function moveView(next: View) {
        if (!frameOf) return;
        view = next;
        applyView();
    }

    function resize() {
        const w = Math.round(parent.clientWidth);
        const h = Math.round(parent.clientHeight);
        if (w < 2 || h < 2 || (w === width && h === height)) return;
        width = w;
        height = h;
        renderer.setSize(width, height);
        build();
        sync();
    }

    const boxFor = (workspaceId: string): Box | null => {
        const ledge = layout.ledges[state.workspaces.findIndex((w) => w.id === workspaceId)];
        if (!ledge) return null;
        return { ...ledge.swim, z0: -DEPTH / 2 + 0.15, z1: DEPTH / 2 - 0.15 };
    };
    const marginOf = (c: Swimmer, factor: number) => c.scale * factor;

    function glassTarget(c: Swimmer) {
        const p = glassSpot(
            c.box,
            marginOf(c, 1.4),
            NOSE[c.role] * c.scale,
            DEPTH / 2,
            Math.random,
        );
        c.spot = new Vector3(p.x, p.y, p.z);
    }

    /** Brings the creatures in line with `state`: spawn, retarget and send leavers off. */
    function sync() {
        if (width === 0 || !received) return;
        const goals = decideGoals(state);
        const present = new Set(state.sessions.map((s) => s.paneId));
        for (const s of state.sessions) {
            let c = swimmers.get(s.paneId);
            const box = boxFor(s.workspaceId);
            const goal = goals.get(s.paneId)!;
            const workspace = state.workspaces.find((w) => w.id === s.workspaceId);
            const colorHex = workspace ? workspaceHex(workspace.color) : null;
            // The body is fixed when built, so a late-resolving title or a recolour rebuilds it
            // where the creature swims now.
            let restoreAt: Vector3 | null = null;
            if (c && colorHex && !c.leaving && bodyChanged(c, { role: s.role, colorHex })) {
                restoreAt = c.pos.clone();
                removeSwimmer(c);
                c = undefined;
            }
            if (!c) {
                // Never spawn a creature for a session first seen as closed, or with no ledge.
                if (goal.kind === 'leave' || !box || !workspace || !colorHex) continue;
                const made = makeCreature(s, colorHex);
                const start = swimPoint(box, made.scale * 1.3, Math.random);
                c = {
                    ...made,
                    paneId: s.paneId,
                    role: s.role,
                    colorHex,
                    workspaceId: s.workspaceId,
                    goal,
                    box,
                    pos: new Vector3(start.x, start.y, start.z),
                    vel: new Vector3(),
                    target: new Vector3(start.x, start.y, start.z),
                    spot: null,
                    yaw: 0,
                    phase: Math.random() * 10,
                    retarget: 0,
                    tapping: false,
                    lastTap: -1,
                    leaving: false,
                    side: 1,
                    gone: false,
                    fx: makeAlertFx(),
                    tick: makeTickFx(),
                    // A page that opens on an update shows it already rested, with no tick.
                    updateT: !settled && goal.kind === 'update' ? -Infinity : null,
                };
                const entrance = restoreAt
                    ? null
                    : entranceFor(
                          s.paneId,
                          goal,
                          !settled,
                          remembered?.fish ?? null,
                          box,
                          made.scale * 1.3,
                      );
                if (restoreAt) {
                    c.pos.copy(restoreAt);
                } else if (entrance?.kind === 'at') {
                    c.pos.set(entrance.pos.x, entrance.pos.y, entrance.pos.z);
                    c.target.copy(c.pos);
                } else if (entrance?.kind === 'swimIn') {
                    c.side = Math.random() < 0.5 ? -1 : 1;
                    c.pos.x = c.side * (layout.width / 2 + 0.3);
                }
                if (entrance?.kind === 'glass') {
                    // Already at the glass, tapping and glowing, so it is never seen swimming there.
                    c.goal = goal;
                    glassTarget(c);
                    // A remembered waiting fish taps the same stretch of glass as before.
                    if (entrance.near) c.spot!.set(entrance.near.x, entrance.near.y, c.spot!.z);
                    c.pos.copy(c.spot!);
                    c.target.copy(c.spot!);
                    c.tapping = true;
                    c.fx.amount = entrance.glow;
                } else {
                    c.goal = { kind: 'swim' };
                }
                c.yaw = c.pos.x > 0 ? Math.PI : 0;
                scene.add(c.group, c.fx.bubble, c.fx.glow, c.tick);
                swimmers.set(s.paneId, c);
            }
            if (box) {
                c.box = box;
                c.workspaceId = s.workspaceId;
            }
            if (c.leaving && goal.kind !== 'leave') c.leaving = false;
            if (goal.kind !== c.goal.kind) {
                c.tapping = false;
                c.retarget = 0;
            }
            if (goal.kind !== 'update') c.updateT = null;
            if (atGlass(goal) && (!atGlass(c.goal) || c.spot === null)) glassTarget(c);
            c.goal = goal;
            if (goal.kind === 'leave' && !c.leaving) {
                c.leaving = true;
                c.tapping = false;
                c.side = c.pos.x >= 0 ? 1 : -1;
            }
        }
        for (const c of swimmers.values()) {
            if (!present.has(c.paneId) && !c.leaving) {
                c.leaving = true;
                c.tapping = false;
                c.side = c.pos.x >= 0 ? 1 : -1;
                c.goal = { kind: 'leave' };
            }
        }
        settled = true;
    }

    /** After a re-layout: refresh each creature's ledge and keep it inside the new walls. */
    function relayCreatures() {
        for (const c of swimmers.values()) {
            const box = boxFor(c.workspaceId);
            if (box) c.box = box;
            if (c.leaving) continue;
            const limit = layout.width / 2 - 0.05;
            c.pos.x = Math.max(-limit, Math.min(limit, c.pos.x));
            c.retarget = 0;
            if (atGlass(c.goal)) glassTarget(c);
        }
    }

    function removeSwimmer(c: Swimmer) {
        scene.remove(c.group, c.fx.bubble, c.fx.glow, c.tick);
        c.fx.bubble.material.dispose();
        c.fx.glow.material.dispose();
        c.tick.material.dispose();
        swimmers.delete(c.paneId);
    }

    function step(c: Swimmer, dt: number, t: number) {
        const goal = c.goal;
        const world = layout.width;
        const margin = marginOf(c, 1.3);
        const leader =
            goal.kind === 'nudge' || goal.kind === 'follow' ? swimmers.get(goal.leader) : undefined;
        // An update creature waits at the glass while its tick shows, then rests like an idle one.
        const pose = goal.kind === 'update' ? updatePose(t - (c.updateT ??= t)) : null;
        const toGlass = goal.kind === 'glass' || pose?.at === 'glass';
        const drifting = goal.kind === 'drift' || pose?.at === 'drift';
        let speed = speedFor(c.role, pose?.at === 'drift' ? { kind: 'drift' } : goal);
        const aim = (p: Vec3) => c.target.set(p.x, p.y, p.z);

        if (c.leaving) {
            aim(exitPoint(c.pos, world));
            if (isGone(c.pos, world)) c.gone = true;
        } else if (toGlass && c.spot) {
            c.target.copy(c.spot);
            // Only a creature asking for the owner taps; an update just waits at the glass.
            if (goal.kind === 'glass' && !c.tapping && c.pos.distanceTo(c.spot) < 0.03) {
                c.tapping = true;
            }
        } else if (goal.kind === 'nudge') {
            c.tapping = false;
            if (leader) {
                const wobble = Math.max(0, Math.sin(t * 3 + c.phase)) * 0.05;
                aim(nudgePoint(leader.pos, goal.slot, wobble));
            }
        } else if (goal.kind === 'follow' && leader) {
            const heading =
                leader.vel.lengthSq() > 1e-4
                    ? leader.vel.clone().normalize()
                    : new Vector3(Math.cos(leader.yaw), 0, -Math.sin(leader.yaw));
            aim(followPoint(leader.pos, heading, goal.slot));
        } else {
            c.retarget -= dt;
            if (c.retarget <= 0 || c.pos.distanceTo(c.target) < (drifting ? 0.05 : 0.08)) {
                aim(
                    drifting
                        ? driftPoint(c.box, margin, Math.random)
                        : swimPoint(c.box, margin, Math.random),
                );
                c.retarget = drifting ? rnd(5, 8) : rnd(2, 4.5);
            }
        }

        if (c.tapping && c.spot) {
            const cycle = (t + c.phase) * 0.75;
            const local = cycle % 1;
            const window = local < 0.1 ? 0 : local >= 0.16 && local < 0.26 ? 1 : -1;
            const bump =
                window === 0
                    ? Math.sin((Math.PI * local) / 0.1)
                    : window === 1
                      ? Math.sin((Math.PI * (local - 0.16)) / 0.1)
                      : 0;
            const key = Math.floor(cycle) * 2 + window;
            if (window >= 0 && key !== c.lastTap && bump > 0.9) {
                c.lastTap = key;
                const ring = makeRipple();
                ring.position.set(c.pos.x, c.pos.y, DEPTH / 2 + 0.002);
                scene.add(ring);
                ripples.push({ mesh: ring, age: 0 });
            }
            c.pos.set(
                c.spot.x,
                c.spot.y + Math.sin(t * 2 + c.phase) * 0.01,
                c.spot.z + bump * 0.035,
            );
            c.vel.set(0, 0, 0);
            c.yaw = lerpAngle(c.yaw, -Math.PI / 2, 1 - Math.exp(-dt * 6));
        } else {
            const want = c.target.clone().sub(c.pos);
            const d = want.length();
            if (d > 1e-4) want.multiplyScalar(Math.min(speed, d * 1.8) / d);
            c.vel.lerp(want, 1 - Math.exp(-dt * 2.5));
            c.pos.addScaledVector(c.vel, dt);
            if (Math.hypot(c.vel.x, c.vel.z) > 0.015) {
                c.yaw = lerpAngle(c.yaw, Math.atan2(-c.vel.z, c.vel.x), 1 - Math.exp(-dt * 5));
            }
        }
        speed = c.vel.length();
        c.group.position.copy(c.pos);
        c.group.rotation.set(0, c.yaw, MathUtils.clamp(c.vel.y * 1.5, -0.5, 0.5));

        const excited = c.tapping ? 1.6 : 1;
        const rate = (drifting ? 3 : 6 + speed * 18) * excited;
        if (c.tail) c.tail.rotation.y = Math.sin(t * rate + c.phase) * 0.4;
        c.fins?.forEach((fin, i) => {
            fin.rotation.x = (i ? -1 : 1) * Math.sin(t * rate * 0.6 + c.phase) * 0.5;
        });
        if (c.front && c.back && c.head) {
            const flap = (drifting ? 1.2 : 2.4) * excited;
            c.front.forEach((fl, i) => {
                fl.rotation.x = (i ? -1 : 1) * Math.sin(t * flap + c.phase) * 0.55;
            });
            c.back.forEach((fl, i) => {
                fl.rotation.x = (i ? -1 : 1) * Math.sin(t * flap + c.phase + 1.2) * 0.3;
            });
            c.head.rotation.z = Math.sin(t * 1.3 + c.phase) * 0.08;
        }

        // The "!" bubble and glow, for a wants-you creature that is asking Dita directly.
        const on = goal.kind === 'glass' && goal.alert && !c.leaving;
        const fx = c.fx;
        fx.amount += ((on ? 1 : 0) - fx.amount) * (1 - Math.exp(-dt * 5));
        const a = fx.amount;
        const show = a > 0.01;
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + c.phase);
        fx.bubble.visible = show;
        if (show) {
            const size = 0.24 * (0.6 + 0.4 * a);
            fx.bubble.scale.set(size, size, 1);
            fx.bubble.position.set(
                c.pos.x + 0.05,
                Math.min(
                    c.pos.y + c.scale * 1.25 + 0.1 + Math.sin(t * 3 + c.phase) * 0.015,
                    layout.height - 0.1,
                ),
                c.pos.z,
            );
            fx.bubble.material.opacity = a;
        }
        const tickAmount = pose && !c.leaving ? pose.tick : 0;
        c.tick.visible = tickAmount > 0.01;
        if (c.tick.visible) {
            const size = 0.17 * (0.7 + 0.3 * tickAmount);
            c.tick.scale.set(size, size, 1);
            c.tick.position.set(
                c.pos.x + 0.04,
                Math.min(c.pos.y + c.scale * 1.15 + 0.08, layout.height - 0.1),
                c.pos.z,
            );
            c.tick.material.opacity = tickAmount;
        }
        fx.glow.visible = show;
        if (show) {
            const size = c.scale * (5.5 + pulse * 1.5);
            fx.glow.scale.set(size, size, 1);
            fx.glow.position.set(c.pos.x, c.pos.y, c.pos.z - 0.05);
            fx.glow.material.opacity = a * (0.55 + pulse * 0.35);
        }
    }

    function pointer(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const ndc = { x: (x / rect.width) * 2 - 1, y: -(y / rect.height) * 2 + 1 };
        const groups = [...swimmers.values()].filter((c) => !c.leaving).map((c) => c.group);
        return { paneId: pickPaneId(ndc, camera, groups), x, y };
    }
    const onMove = (e: MouseEvent) => {
        const { paneId, x, y } = pointer(e);
        const session = state.sessions.find((s) => s.paneId === paneId);
        const workspace = state.workspaces.find((w) => w.id === session?.workspaceId);
        canvas.style.cursor = session ? 'pointer' : 'default';
        if (!session || !workspace) {
            tip.hidden = true;
            return;
        }
        const text = tooltipText(session, workspace);
        const name = document.createElement('b');
        name.textContent = text.name;
        tip.replaceChildren(name, text.detail);
        tip.hidden = false;
        tip.style.left =
            Math.max(4, Math.min(x - tip.offsetWidth / 2, width - tip.offsetWidth - 4)) + 'px';
        tip.style.top = Math.max(4, y - tip.offsetHeight - 14) + 'px';
    };
    const onLeave = () => {
        tip.hidden = true;
    };
    const onClick = (e: MouseEvent) => {
        const { paneId } = pointer(e);
        if (paneId) options.onSelect(paneId);
    };
    // A pinch or Cmd-scroll zooms around the pointer; any other wheel scrolls a tall tank.
    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!frameOf) return;
        const action = wheelAction(e, height);
        if (action.kind === 'scroll')
            return moveView(scrollBy(view, frameOf, action.dx, action.dy));
        const rect = canvas.getBoundingClientRect();
        const ndc = {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
        moveView(zoomAt(view, frameOf, action.factor, ndc));
    };
    const zoomBar = document.createElement('div');
    zoomBar.className = 'zoom-bar';
    const button = (label: string, title: string, act: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.addEventListener('click', act);
        zoomBar.append(b);
    };
    const centre = { x: 0, y: 0 };
    button('+', 'Zoom in', () => frameOf && moveView(zoomAt(view, frameOf, BUTTON_ZOOM, centre)));
    button(
        '−',
        'Zoom out',
        () => frameOf && moveView(zoomAt(view, frameOf, 1 / BUTTON_ZOOM, centre)),
    );
    button('⤢', 'Fit the tank', () => frameOf && moveView(fitView(frameOf)));
    parent.append(zoomBar);

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);

    const clock = { last: performance.now() };
    function tick(now: number) {
        const dt = Math.min((now - clock.last) / 1000, 0.05);
        clock.last = now;
        const t = now / 1000;
        for (const k of kelps)
            k.leaves.forEach((leaf, i) => {
                leaf.position.x =
                    k.x +
                    Math.sin(t * 0.9 + k.seed + i * 0.35) * 0.04 * (i / k.count) +
                    (i % 2 ? 0.012 : -0.012);
            });
        for (const r of rays) r.mesh.rotation.z = r.base + Math.sin(t * 0.3 + r.seed) * 0.05;
        for (const b of bubbles) {
            b.mesh.position.y += b.speed * dt;
            b.mesh.position.x += Math.sin(t * 2 + b.seed) * 0.002;
            if (b.mesh.position.y > layout.height - 0.05) {
                b.mesh.position.y = 0.05;
                b.mesh.position.x = rnd(b.x0, b.x1);
            }
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
            const ripple = ripples[i];
            ripple.age += dt;
            ripple.mesh.scale.setScalar(1 + ripple.age * 7);
            (ripple.mesh.material as MeshBasicMaterial).opacity = Math.max(
                0,
                0.9 - ripple.age * 1.6,
            );
            if (ripple.age > 0.6) {
                scene.remove(ripple.mesh);
                (ripple.mesh.material as MeshBasicMaterial).dispose();
                ripples.splice(i, 1);
            }
        }
        for (const c of [...swimmers.values()]) {
            step(c, dt, t);
            if (c.gone) removeSwimmer(c);
        }
        if (width > 0) renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();
    frame = requestAnimationFrame(tick);

    return {
        /**
         * Shows `next`. The ledges are re-laid only when the workspaces' ids, names, colours,
         * shortcuts or order change; the creatures are brought in line every time.
         */
        setState(next: TankState) {
            state = next;
            received = true;
            const wanted = JSON.stringify(
                next.workspaces.map((w) => [w.id, w.name, w.color, w.shortcut]),
            );
            if (wanted !== signature) {
                signature = wanted;
                if (width > 0) build();
            }
            sync();
        },
        recall(memory) {
            remembered = memory;
        },
        snapshot() {
            if (!settled) return null;
            return {
                fish: [...swimmers.values()].map((c) => ({
                    paneId: c.paneId,
                    pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z },
                    leaving: c.leaving,
                })),
                view: { ...view },
            };
        },
        dispose() {
            cancelAnimationFrame(frame);
            observer.disconnect();
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerleave', onLeave);
            canvas.removeEventListener('click', onClick);
            for (const c of [...swimmers.values()]) removeSwimmer(c);
            for (const r of ripples) (r.mesh.material as MeshBasicMaterial).dispose();
            tip.remove();
            zoomBar.remove();
            clear();
            renderer.dispose();
        },
    };
}
