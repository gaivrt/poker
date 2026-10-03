// Camera over the game world (design space 1920×1080): look-at point + zoom, shake,
// mouse/gyro parallax for the background. UI and full-screen effects live outside it.
import { type Container, Ticker } from 'pixi.js';
import { animate, ease } from '../tween';

export class Camera {
  look = { x: 960, y: 540 };
  zoom = 1;
  private shakeAmp = 0;
  private shakeUntil = 0;
  private parallax = { x: 0, y: 0 };

  constructor(
    private world: Container,
    private background: Container | null,
  ) {
    Ticker.shared.add(() => this.apply());
    window.addEventListener('pointermove', (e) => {
      this.parallax.x = (e.clientX / window.innerWidth - 0.5) * 2;
      this.parallax.y = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  private apply() {
    const now = performance.now();
    let sx = 0, sy = 0;
    if (now < this.shakeUntil) {
      const left = (this.shakeUntil - now) / 400;
      sx = (Math.random() - 0.5) * 2 * this.shakeAmp * Math.min(1, left);
      sy = (Math.random() - 0.5) * 2 * this.shakeAmp * Math.min(1, left);
    }
    this.world.pivot.set(this.look.x, this.look.y);
    this.world.position.set(960 + sx, 540 + sy);
    this.world.scale.set(this.zoom);
    if (this.background) {
      // the far background drifts a little against the camera and the pointer
      this.background.position.set(-(this.look.x - 960) * 0.25 - this.parallax.x * 12, -(this.look.y - 540) * 0.25 - this.parallax.y * 8);
    }
  }

  /** Move the camera toward a point and zoom in (k = how far toward the point, 0..1). */
  push(x: number, y: number, zoom: number, ms = 400, k = 0.5) {
    const from = { ...this.look }, z0 = this.zoom;
    const to = { x: 960 + (x - 960) * k, y: 540 + (y - 540) * k };
    return animate(ms, (p) => {
      this.look.x = from.x + (to.x - from.x) * p;
      this.look.y = from.y + (to.y - from.y) * p;
      this.zoom = z0 + (zoom - z0) * p;
    }, ease.inOutCubic);
  }

  reset(ms = 450) {
    return this.push(960, 540, 1, ms, 1);
  }

  shake(amp = 10, ms = 300) {
    this.shakeAmp = amp;
    this.shakeUntil = performance.now() + ms;
  }
}
