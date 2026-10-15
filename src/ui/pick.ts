import { type Camera, type Object3D, Raycaster, Vector2 } from 'three';

const raycaster = new Raycaster();

/**
 * The pane id of the creature under a pointer, or null for empty water. `ndc` is the pointer in
 * normalised device coordinates (-1 to 1). Each creature's group carries `userData.paneId`; the
 * ray can hit any mesh inside it, so this walks up to the owning group.
 */
export function pickPaneId(
    ndc: { x: number; y: number },
    camera: Camera,
    creatures: Object3D[],
): string | null {
    raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
    const hit = raycaster.intersectObjects(creatures, true)[0];
    let object: Object3D | null = hit ? hit.object : null;
    while (object) {
        const id: unknown = object.userData.paneId;
        if (typeof id === 'string') return id;
        object = object.parent;
    }
    return null;
}
