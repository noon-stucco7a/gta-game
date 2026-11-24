// input.js — keyboard and mouse state for the game: a held-keys set, edge-triggered
// presses for actions like entering a car, and mouse position in view coordinates.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // True once per physical press; the game loop calls endFrame() after reading.
  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
