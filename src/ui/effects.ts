// The wants-you effects and the tap ripple, ported from Dita's approved preview. Not unit-tested:
// WebGL.
import {
    AdditiveBlending,
    CanvasTexture,
    Mesh,
    MeshBasicMaterial,
    RingGeometry,
    Sprite,
    SpriteMaterial,
    SRGBColorSpace,
} from 'three';

function canvasTexture(
    w: number,
    h: number,
    draw: (context: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
}

const BUBBLE_TEXTURE = canvasTexture(128, 128, (x) => {
    x.fillStyle = '#ffffff';
    x.strokeStyle = '#ff5a6e';
    x.lineWidth = 7;
    x.beginPath();
    x.ellipse(64, 54, 52, 44, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.beginPath();
    x.moveTo(44, 90);
    x.lineTo(34, 122);
    x.lineTo(70, 96);
    x.closePath();
    x.fill();
    x.stroke();
    x.beginPath();
    x.ellipse(64, 54, 48, 40, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ff5a6e';
    x.beginPath();
    x.roundRect(55, 22, 18, 42, 9);
    x.fill();
    x.beginPath();
    x.arc(64, 78, 9, 0, Math.PI * 2);
    x.fill();
});

const TICK_TEXTURE = canvasTexture(128, 128, (x) => {
    x.fillStyle = '#6fd9a8';
    x.strokeStyle = '#ffffff';
    x.lineWidth = 7;
    x.beginPath();
    x.arc(64, 64, 46, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 13;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(42, 66);
    x.lineTo(57, 81);
    x.lineTo(88, 47);
    x.stroke();
});

const GLOW_TEXTURE = canvasTexture(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
});

const RING = new RingGeometry(0.02, 0.032, 32);

/** The "!" bubble and glow sprites one creature owns. Both start hidden. */
export function makeAlertFx() {
    const bubble = new Sprite(
        new SpriteMaterial({
            map: BUBBLE_TEXTURE,
            fog: false,
            transparent: true,
            depthTest: false,
        }),
    );
    bubble.renderOrder = 10;
    const glow = new Sprite(
        new SpriteMaterial({
            map: GLOW_TEXTURE,
            color: '#fff1a0',
            fog: false,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
        }),
    );
    bubble.visible = false;
    glow.visible = false;
    return { bubble, glow, amount: 0 };
}
export type AlertFx = ReturnType<typeof makeAlertFx>;

/** The small mint tick an update creature wears for a moment. It starts hidden. */
export function makeTickFx() {
    const tick = new Sprite(
        new SpriteMaterial({
            map: TICK_TEXTURE,
            fog: false,
            transparent: true,
            depthTest: false,
        }),
    );
    tick.renderOrder = 10;
    tick.visible = false;
    return tick;
}
export type TickFx = ReturnType<typeof makeTickFx>;

/** A white ring that the tank grows and fades where a creature taps the glass. */
export function makeRipple(): Mesh {
    return new Mesh(
        RING,
        new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            fog: false,
            depthWrite: false,
        }),
    );
}
