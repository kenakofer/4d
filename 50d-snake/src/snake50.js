// Snake in fifty dimensions, five cells to a side.
//
// The rules are 4D Snake's, unchanged: snake.js is written over the length of
// a cell, so a turn, a reversal, growth and every way of dying already work in
// fifty dimensions. What does not survive the trip is SETUP. 4D Snake places
// its apple by listing every free cell and picking one, which is 1296 cells at
// 6^4 and about 10^35 at 5^50 -- and it lays lava as small solid blocks, which
// in a space this size would be a few specks nobody ever meets.
//
// So this file overrides the three placements and nothing else. Like snake.js
// it knows nothing about drawing, and runs under Node.

import { Snake } from '../../snake/src/snake.js';
import { Box, step } from '../../shared/grid.js';

export { CAUSE } from '../../snake/src/snake.js';

export const DEFAULTS50 = {
  dims: Array(50).fill(5),
  wrap: Array(50).fill(false),
  startLength: 4,
  // Lava here is a SLAB: full width along every axis but a couple, and thin
  // along those. See placeLava().
  lavaCount: 16,
  lavaPins: [2, 1],
  applePoints: 10,
  growPerApple: 2,
};

// How the panels pair up the axes: panel k shows axes 2k and 2k+1.
export const PANEL_COUNT = 25;
export const panelAxes = (k) => [2 * k, 2 * k + 1];

export class Snake50 extends Snake {
  constructor(opts = {}) {
    super({ ...DEFAULTS50, ...opts });
  }

  // Slabs rather than blocks.
  //
  // A block small on every axis is invisible at fifty dimensions: it fills
  // (3/5)^50 of the space, and no slice through the head ever crosses it. A
  // slab is pinned along a couple of axes and spans the board along every
  // other, so it fills a fixed fraction of the space -- 2 in 25 for the
  // default -- whatever the dimension count.
  //
  // It is also exactly as fair as 4D Snake's lava. A step along axis a lands in
  // a slab only if the head already sits inside it on every pinned axis but a,
  // which is precisely when the panel holding a draws it. Anything one move
  // away is on the panel for that move.
  placeLava(avoid = []) {
    if (this.cfg.lava) {
      return this.cfg.lava.map((b) =>
        (b instanceof Box ? b : new Box(b.origin, b.size)));
    }
    const out = [];
    for (let i = 0; i < this.cfg.lavaCount; i++) {
      // A slab covers 2 cells in 25, so with a long snake to dodge a few draws
      // can miss; a bounded retry, and a slab that never fits is left out
      // rather than laid over the snake.
      for (let tries = 0; tries < 400; tries++) {
        const b = this.randomSlab();
        if (avoid.some((p) => b.contains(p))) continue;
        out.push(b);
        break;
      }
    }
    return out;
  }

  randomSlab() {
    const origin = Array(this.D).fill(0);
    const size = this.dims.slice();
    const used = new Set();
    for (const width of this.cfg.lavaPins) {
      let d;
      do { d = Math.floor(this.rng() * this.D); } while (used.has(d));
      used.add(d);
      size[d] = width;
      origin[d] = Math.floor(this.rng() * (this.dims[d] - width + 1));
    }
    return new Box(origin, size);
  }

  // Eating an apple reshuffles the lava.
  //
  // Every slab is drawn again, clear of every segment of the snake -- lava
  // landing on the body would be a death the player did nothing to earn. The
  // apple the eat just placed is then moved if a slab has landed on it.
  //
  // The cells are checked as they stand AFTER the move, so the tail the move
  // released is free for lava and the cell the head now occupies is not.
  move(dir) {
    const plan = super.move(dir);
    if (plan.kind === 'move' && plan.eats && !this.cfg.lava) {
      this.lava = this.placeLava(this.body);
      this._glowCache = null;
      if (this.apple && this.isLava(this.apple)) this.placeApple();
    }
    return plan;
  }

  // The halo 4D Snake draws round its lava walks every cell of every block,
  // which a slab has 5^48 of. The panels show the slabs themselves, so there
  // is no halo here.
  lavaGlow() {
    return new Set();
  }

  // A straight run along axis 0, so the opening position lies flat in the
  // first panel -- the one the arrow keys start out moving in.
  //
  // 4D Snake demands that EVERY direction from the head be survivable. With a
  // hundred directions and slabs across the whole space that is almost never
  // true of any cell, and insisting on it found no start at all. What it is
  // for still holds, though: the first press must not be the last. The first
  // press can only be an arrow key, and the arrows start out moving in the
  // first panel's plane -- so that plane is the one that has to be clear.
  // Everything else around the head is drawn on some panel before the player
  // can reach it.
  placeSnake() {
    if (this.cfg.body) return this.cfg.body.map((p) => p.slice());
    const n = this.cfg.startLength;
    const along = [1, ...Array(this.D - 1).fill(0)];
    let body = null;
    for (let tries = 0; tries < 2000; tries++) {
      const tail = this.dims.map((s) => Math.floor(this.rng() * s));
      tail[0] = 0;
      // Off the walls of the first panel's other axis, so both turns are open.
      tail[1] = 1 + Math.floor(this.rng() * Math.max(1, this.dims[1] - 2));
      const cells = [];
      let p = tail;
      for (let i = 0; i < n && p; i++) {
        cells.push(p);
        p = step(p, along, this.dims, this.wrap);
      }
      if (cells.length < n || cells.some((c) => this.isLava(c))) continue;
      body = cells.reverse();
      if (this.openInFirstPanel(body)) return body;
    }
    // Lava everywhere the rule would accept, which the default density makes
    // vanishingly unlikely. A legal start rather than none.
    return body || Array.from({ length: n }, (_, i) => {
      const p = Array(this.D).fill(1);
      p[0] = n - 1 - i;
      return p;
    });
  }

  // Is every move the arrows offer at the start -- along axes 0 and 1, bar the
  // neck -- onto the board and clear of lava and body?
  openInFirstPanel(body) {
    const [head, neck] = body;
    for (const d of [0, 1]) {
      for (const sign of [-1, 1]) {
        const dir = Array(this.D).fill(0);
        dir[d] = sign;
        const to = step(head, dir, this.dims, this.wrap);
        if (!to) return false;
        if (neck && to.every((v, i) => v === neck[i])) continue;
        if (this.isLava(to) || body.some((b) => b.every((v, i) => v === to[i]))) {
          return false;
        }
      }
    }
    return true;
  }

  // Any free cell, drawn uniformly. The space cannot be listed, so draw and
  // retry: sixteen slabs cover about three quarters of it, so a free cell
  // turns up within a handful of draws.
  placeApple() {
    if (this.cfg.apple && !this._appleWasPlaced) {
      this._appleWasPlaced = true;
      this.apple = this.cfg.apple.slice();
      return this.apple;
    }
    for (let tries = 0; tries < 10000; tries++) {
      const p = this.dims.map((s) => Math.floor(this.rng() * s));
      if (this.isLava(p) || this.occupied(p)) continue;
      this.apple = p;
      return p;
    }
    this.apple = null;
    return null;
  }
}
