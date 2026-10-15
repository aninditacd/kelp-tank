import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry } from 'three';
import { pickPaneId } from '../../src/ui/pick';

describe('pickPaneId', () => {
    it('a click on any part of a creature gives its pane id, and empty water gives none', () => {
        const camera = new PerspectiveCamera(30, 1, 0.1, 50);
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);

        const creature = new Group();
        creature.userData.paneId = 'pane-1';
        const body = new Group();
        body.add(new Mesh(new SphereGeometry(1, 16, 12), new MeshBasicMaterial()));
        creature.add(body);
        creature.updateMatrixWorld(true);

        expect(pickPaneId({ x: 0, y: 0 }, camera, [creature])).toBe('pane-1');
        expect(pickPaneId({ x: 0.9, y: 0.9 }, camera, [creature])).toBeNull();
    });
});
