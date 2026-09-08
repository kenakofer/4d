// A sky of stars behind everything.
//
// The scenes here stand in the dark: a table, a ring of rooms, some
// hyperspheres, and past them a flat dark blue that ended nowhere. That flat
// colour was doing one job -- not competing with the board -- and doing it by
// having nothing in it at all, so the room had no outside. Stars give it one at
// the same cost, because a point of light a thousand units away cannot be
// confused with anything the player is steering.
//
// It is drawn as ONE points mesh on a shell far outside the board, parented to
// nothing and never moving. The alternatives are worse: a cube texture has to
// be generated and eats memory for something that is mostly black, and stars
// pinned to the camera would slide with it and read as dirt on the lens rather
// than as a sky.
//
// Where the stars go is in skyshape.js, where the suite can reach it. This file
// only draws.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { makeStars } from './skyshape.js';
import { makeRng } from './grid.js';

// How far out the shell sits.
//
// Well inside the far plane (see FAR_PLANE in props.js, which is 6000) and well
// outside anything else: the orbs stand at a few hundred at most, so nothing in
// the scene can ever be beyond a star. Depth is written off anyway -- see
// below -- so the exact number only has to keep the shell clear of the board.
const RADIUS = 3000;

// How many. Enough to read as a sky rather than as a handful of dots, few
// enough to stay one cheap draw call.
const COUNT = 1400;

// One seed, so a given game's sky is the same on every visit -- the same reason
// the orbs have one.
const SEED = 20260907;

// A soft round dot. A square point looks like a dead pixel at this size, and
// the falloff is what makes a star read as a point of light rather than as a
// tile.
function starTexture(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The stars' colour. Barely blue and never pure white: a white star on this
// background is a hard speck, and the faint blue puts the sky in the same
// family as the rest of the palette.
const TINT = 0xbcd2ff;

export class Sky {
  // `scene` is what to hang the stars in. `size` scales every star, for a game
  // that wants a quieter or busier sky than the default.
  constructor(scene, { count = COUNT, radius = RADIUS, size = 2.6,
                       seed = SEED } = {}) {
    const stars = makeStars(count, makeRng(seed));
    const geo = new THREE.BufferGeometry();

    // Directions out to the shell, and brightness carried as a per-star colour
    // so one material can draw the whole sky.
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const base = new THREE.Color(TINT);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = stars.dirs[i * 3] * radius;
      pos[i * 3 + 1] = stars.dirs[i * 3 + 1] * radius;
      pos[i * 3 + 2] = stars.dirs[i * 3 + 2] * radius;
      const b = stars.bright[i];
      col[i * 3] = base.r * b;
      col[i * 3 + 1] = base.g * b;
      col[i * 3 + 2] = base.b * b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    // sizeAttenuation off, so a star is the same number of pixels however far
    // out the shell is put and whatever the zoom. With it on, the shell's
    // radius would silently become a brightness control.
    const mat = new THREE.PointsMaterial({
      size,
      sizeAttenuation: false,
      map: starTexture(),
      vertexColors: true,
      transparent: true,
      // Never writes depth and never tests it: the sky is behind everything by
      // definition, and letting it take part in the depth buffer means a star
      // can win against a far corner of the board on a tie. Drawn first with
      // depth off, it is simply the thing everything else is painted over.
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    // Before everything. The board's own renderOrders start at -1 (the table),
    // so this sits below all of them.
    this.points.renderOrder = -100;
    // The shell is centred on the world, not on the camera, and it never moves.
    // frustumCulled off because its bounding sphere is enormous and three would
    // otherwise be testing it against the frustum every frame to always say yes.
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.scene = scene;
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.map.dispose();
    this.points.material.dispose();
  }
}
