// Keyboard + mouse input. The camera consumes look deltas each frame; the
// player consumes edge-triggered actions (interact, shoot, jump, horn).

export class Input {
  constructor() {
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
    this.mouseDown = false;
    this.shootQueued = false;
    this.interactQueued = false;
    this.hornQueued = false;
    this.pauseQueued = false;
    this.muteQueued = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.interactQueued = true;
      if (e.code === 'KeyH') this.hornQueued = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseQueued = true;
      if (e.code === 'KeyM') this.muteQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button, .ui-panel, a')) return;
      this.mouseDown = true;
      this.shootQueued = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.lookDX += e.clientX - this.lastX;
      this.lookDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
    window.addEventListener('contextmenu', (e) => {
      if (e.target && e.target.tagName === 'CANVAS') e.preventDefault();
    });
  }

  isDown(code) { return this.keys.has(code); }
  get sprint() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  get jump() { return this.isDown('Space'); }
  get handbrake() { return this.isDown('Space'); }

  // WASD / arrows as -1..1 axes. y: +1 forward, x: +1 right.
  axes() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    return { x, y };
  }

  consumeLook() {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
  consumeShoot() {
    const s = this.shootQueued;
    this.shootQueued = false;
    return s;
  }
  consumeInteract() {
    const s = this.interactQueued;
    this.interactQueued = false;
    return s;
  }
  consumeHorn() {
    const s = this.hornQueued;
    this.hornQueued = false;
    return s;
  }
  consumePause() {
    const s = this.pauseQueued;
    this.pauseQueued = false;
    return s;
  }
  consumeMute() {
    const s = this.muteQueued;
    this.muteQueued = false;
    return s;
  }
}
