// Shared three.js bits for the scene, from Dita's approved preview. Not unit-tested: WebGL.
import {
    Color,
    DataTexture,
    Mesh,
    MeshBasicMaterial,
    MeshToonMaterial,
    NearestFilter,
    RedFormat,
    SphereGeometry,
} from 'three';

export const SPHERE = new SphereGeometry(1, 24, 16);

const STEPS = new DataTexture(new Uint8Array([95, 175, 255]), 3, 1, RedFormat);
STEPS.minFilter = STEPS.magFilter = NearestFilter;
STEPS.needsUpdate = true;

const cache = new Map<string, MeshToonMaterial>();
/** A three-step toon material for `hex`, shared by every mesh of that colour. */
export function toon(hex: string): MeshToonMaterial {
    let material = cache.get(hex);
    if (!material) {
        material = new MeshToonMaterial({ color: hex, gradientMap: STEPS });
        cache.set(hex, material);
    }
    return material;
}

/** `a` mixed `amount` of the way towards `b`, as a hex string. */
export function mix(a: string, b: string, amount: number): string {
    return '#' + new Color(a).lerp(new Color(b), amount).getHexString();
}

/** A sphere scaled to an ellipsoid. */
export function blob(
    material: MeshToonMaterial | MeshBasicMaterial,
    sx: number,
    sy: number,
    sz: number,
): Mesh {
    const mesh = new Mesh(SPHERE, material);
    mesh.scale.set(sx, sy, sz);
    return mesh;
}
