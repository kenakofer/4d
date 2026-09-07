// 4D Maze -- the view.
//
// The rules live in maze.js and know nothing about any of this.
//
// WHAT IS DRAWN IS THE PASSAGES. There are no walls in the scene, because in
// four dimensions a wall is a solid you would have to see through to find your
// way, whereas a passage is a rope and a rope reads. The maze is therefore
// drawn exactly as unknot draws its knot -- tube segments between cells, a
// sphere where they meet -- and the whole difference between the two games is
// that unknot's rope is a PATH and this one is a GRAPH.
//
// That difference is the interesting part of this file. Unknot can ask "which
// way did the rope come in, and which way does it leave", and everything from
// the joint radius to the colour ramp follows from the answer. Here a cell may
// have three or four passages and there is no coming in or leaving, so:
//
//   - joints are sized from the axes meeting at a cell, not from a bend
//     (shared/junction.js, which is tested; the obvious formula is wrong)
//   - colour cannot run end to end along a strand, because there is no strand.
//     It runs with DISTANCE FROM WHERE YOU STAND instead, which is the thing a
//     maze-walker actually wants to know and which a path does not need.
//   - a junction is marked, because a place where you must choose is the only
//     thing in a maze worth seeing from across the room.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { generate, distances, Maze, DEFAULTS } from './maze.js';
import { jointRadius, needsJoint, junctionKind, axesAt, straightRuns }
  from '../../shared/junction.js';
import { Ring, Slide } from '../../shared/ring.js';
import { Orbit, bindOrbit } from '../../shared/orbit.js';
import { rockAt } from '../../shared/rock.js';
import { Props, FAR_PLANE, LOOK_DOWN_DEG } from '../../shared/props.js';
import { KEYMAP, dirVec } from '../../shared/pad.js';
import { SlicePanels } from '../../shared/slicepanels.js';
import { Gamepads } from '../../shared/gamepad.js';
import { PauseMenu } from '../../shared/pause.js';
import { addLights, sliceFrame, blocker, COLORS } from '../../shared/scene.js';
import { haloMaterial, jointHaloMaterial, fatten, fattenJoint, overshoot,
  shellGeometry, HALO_ORDER, ROPE_ORDER } from '../../shared/halo.js';
import { armMask, sleeveFraction } from '../../shared/haloshape.js';
import { Arrows } from '../../shared/warrow.js';
import { key, step } from '../../shared/grid.js';
import { HUD, FOURTH, WON, PANELS, AXIS_NAME } from './copy.js';

let scene, camera, renderer, orbit, props, panels, pause, gamepads;
let maze = null, dims = DEFAULTS.dims.slice();
let at = null;            // where the player stands, as a key
let exit = null;          // the cell to reach
let toExit = new Map();   // distance from every cell to the exit
let steps = 0, best = 0, won = false;

// viewAxes[k] says which maze axis is drawn along render axis k. Slot 3 is the
// one laid out around the ring. Same convention as the other games, so a
// player's sense of which way is which carries over.
const viewAxes = [0, 1, 2, 3];

const slide = new Slide();
let gridGroup, frames, ropeGroup;

// The rope's colour ramp. Unknot runs its ramp end to end along the strand,
// which it can because a strand has two ends. A maze has none, so the ramp runs
// with distance from the exit instead: everything you can see is coloured by
// how far it is from where you are trying to get to, which turns the colour
// into a hint rather than decoration.
const NEAR = new THREE.Color(0x37d6a0);   // close to the exit
const FAR = new THREE.Color(0xa06bff);    // far from it
const JUNCTION = new THREE.Color(0xffd166);

const TUBE = 0.115;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function writeLabels() {
  document.getElementById('title').textContent = HUD.title;
  document.getElementById('blurb').textContent = HUD.blurb;
  document.getElementById('reset').textContent = WON.playAgain;
  document.getElementById('legendJunction').textContent = FOURTH.legendJunction;
  document.getElementById('legendW').textContent = FOURTH.legend;
  document.getElementById('swJunction').style.background = '#' + JUNCTION.getHexString();
}

function ring() {
  return new Ring({ depth: dims[viewAxes[3]], span: Math.max(...dims), wrap: false });
}

function slotOffset(k) { return ring().offset(k, slide.shown); }

// Project a maze cell to 3D render space: three axes as themselves, the fourth
// as which frame around the ring the cell belongs to.
function proj(k) {
  const p = k.split(',').map(Number);
  const off = slotOffset(p[viewAxes[3]]);
  return [p[viewAxes[0]] + off[0], p[viewAxes[1]] + off[1], p[viewAxes[2]] + off[2]];
}

// Slices other than the one being looked at are dimmed, so the frame in front
// reads as the one you are in.
function wFade(k) {
  const p = k.split(',').map(Number);
  return p[viewAxes[3]] === Math.round(slide.shown) ? 1 : 0.62;
}

function newMaze() {
  const built = generate({ dims });
  maze = built.maze;

  // Start and exit are the two ends of the longest route through the maze, so
  // the maze that gets built is the maze that gets used -- picking two cells at
  // random would usually put them a few steps apart in a board this size and
  // waste everything the generator did.
  const cells = maze.cells;
  const far = (from) => {
    const d = distances(maze, from);
    let bestCell = from, bestDist = -1;
    for (const [c, n] of d) if (n > bestDist) { bestDist = n; bestCell = c; }
    return { cell: bestCell, dist: bestDist };
  };
  const a = far(cells[0]);
  const b = far(a.cell);
  at = a.cell;
  exit = b.cell;
  best = b.dist;
  toExit = distances(maze, exit);
  steps = 0;
  won = false;

  slide.focus = at.split(',').map(Number)[viewAxes[3]];
  slide.shown = slide.focus;
  buildFrames();
  rebuildRope();
  updateHud();
  // The pad caches which directions are open and only re-reads them when told.
  // A new maze changes every one of them, so without this the buttons keep
  // describing the maze before it -- showing a way out that is not there and
  // greying out the one that is.
  if (panels) panels.update();
}

function init() {
  writeLabels();
  const canvas = document.getElementById('view');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  camera = new THREE.PerspectiveCamera(52, 1, 0.1, FAR_PLANE);
  addLights(scene);

  gridGroup = new THREE.Group();
  frames = new THREE.Group();
  ropeGroup = new THREE.Group();
  gridGroup.add(frames);
  gridGroup.add(ropeGroup);
  scene.add(gridGroup);

  const [X, Y, Z] = [dims[viewAxes[0]], dims[viewAxes[1]], dims[viewAxes[2]]];
  const r = ring();
  props = new Props({ dims3: [X, Y, Z], ring: r, depth: r.depth, orbs: true });
  gridGroup.add(props.group);

  newMaze();

  const c = [X / 2, Y / 2, Z / 2];
  const start = slotOffset(slide.shown);
  const mid = [c[0] - 0.5 + start[0], c[1] - 0.5 + start[1], c[2] - 0.5 + start[2]];
  const rest = Math.max(X * 2.4, r.radius + X * 1.6);
  orbit = new Orbit(canvas, mid, rest);
  orbit.restRadius = rest;
  orbit.el_ = (LOOK_DOWN_DEG * Math.PI) / 180;
  orbit.onChange = () => {
    camera.position.set(...orbit.position());
    camera.lookAt(...orbit.target);
  };
  camera.position.set(...orbit.position());
  camera.lookAt(...orbit.target);
  // Drag to turn, wheel to zoom, two fingers to pinch -- the same as every
  // other game, from the same place, so it cannot drift apart from them again.
  bindOrbit(canvas, () => orbit);

  pause = new PauseMenu({ onRestart: newMaze });
  // The two slice panels and the split pad that goes with them, all shared
  // furniture. What stays here is only what the panels DRAW.
  panels = new SlicePanels({
    columns: [
      { cluster: document.getElementById('padVertical'),
        svg: document.getElementById('mapWY'),
        foot: document.getElementById('mapWYFoot') },
      { cluster: document.getElementById('padHorizontal'),
        svg: document.getElementById('mapXZ'),
        foot: document.getElementById('mapXZFoot') },
    ],
    dims,
    axisName: (ax) => AXIS_NAME[ax],
    copy: PANELS,
    onPush: (axis, sign) => tryMove(axis, sign),
    // Grey out a direction with no passage behind it. The pad is the one place
    // that can say "there is no way that way" before the player spends a press
    // finding out -- in a maze drawn as passages an illegal move is not a
    // crash, it is simply nothing happening, and nothing happening is the least
    // readable feedback there is.
    isLive: (axis, sign) => {
      if (!maze || won) return false;
      const np = step(at.split(',').map(Number), dirVec(axis, sign, dims.length),
                      dims, []);
      return !!np && maze.neighbours(at).includes(key(np));
    },
    isPresent: (axis) => axis < dims.length && dims[axis] > 1,
  });
  panels.configure((m) => {
    // The maze is drawn as a NETWORK, not as filled cells. A passage is a
    // strand running from one cell into the next, exactly as the rope in the
    // room is -- and where there is no passage the cells stay apart, which is
    // how a wall appears on a panel that draws no walls.
    //
    // Filling cells instead would say the wrong thing twice over: adjacent
    // cells would merge into a slab whether or not a passage joined them, and
    // the distance colouring would stop them merging at all, leaving a field
    // of separate dots. Neither is the maze.
    m.network = {
      get cells() {
        return maze ? maze.cells.map((k) => k.split(',').map(Number)) : [];
      },
      joined: (a, b) => !!maze && maze.neighbours(key(a)).includes(key(b)),
      // The same near-far ramp as the rope, so the panel and the room agree
      // about which way is downhill.
      colour: (p) => {
        const maxDist = Math.max(1, ...[...toExit.values()]);
        const k = key(p);
        const d = toExit.has(k) ? toExit.get(k) : maxDist;
        return '#' + NEAR.clone().lerp(FAR, d / maxDist).getHexString();
      },
    };
  });
  panels.fit();

  gamepads = new Gamepads({ onPress: (axis, sign) => tryMove(axis, sign) });

  addEventListener('keydown', onKey);
  addEventListener('resize', resize);
  document.getElementById('reset').onclick = newMaze;
  resize();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// The frames the slices sit in
// ---------------------------------------------------------------------------

function buildFrames() {
  while (frames.children.length) {
    const c = frames.children.pop();
    if (c.geometry) c.geometry.dispose();
  }
  const dims3 = [dims[viewAxes[0]], dims[viewAxes[1]], dims[viewAxes[2]]];
  const r = ring();
  for (let w = 0; w < r.depth; w++) {
    frames.add(sliceFrame(dims3, slotOffset(w), w === Math.round(slide.shown)));
  }
  // The spare slot, with a blocker in it, saying that w = max does not step
  // round to w = 0. Same reasoning as unknot's; the ring is shared furniture
  // and a player should meet the same rule in both games.
  //
  // Unknot draws it only when a frame sits beside the gap, because with a short
  // rope most slices are empty and the blocker would be furniture with nothing
  // to explain. A maze fills every slice, so the gap is always between two
  // occupied frames and the blocker is always wanted.
  //
  // It is a solid the size of a room, though, and the ring turns as the focus
  // moves -- so it passes between the camera and the maze, and while it is
  // there it hides the thing the player is reading. Drawn dim and see-through
  // it still says "not this way" without blanking the board behind it.
  if (!r.wrap) {
    const b = blocker(dims3, slotOffset(r.depth));
    b.traverse((o) => {
      if (!o.material) return;
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
    });
    frames.add(b);
  }
}

// ---------------------------------------------------------------------------
// The rope
//
// Instanced, because a maze is roughly 440 cells and 440 passages where unknot
// has a few dozen -- one mesh per segment would be a thousand draw calls a
// frame. Every segment shares one cylinder and every joint one sphere; position,
// orientation and colour go in per instance.
// ---------------------------------------------------------------------------

// The rope, and the dark shells that make it read where it crosses itself. A
// maze crosses itself constantly -- that is what a maze IS -- so the halo
// matters more here than anywhere, and like the rope it has to be instanced.
let segMesh = null, jointMesh = null;
let segHalo = null, jointHalo = null;
let arrows = null;

function rebuildRope() {
  for (const m of [segMesh, jointMesh, segHalo, jointHalo]) {
    if (!m) continue;
    ropeGroup.remove(m);
    m.geometry.dispose();
  }
  segMesh = jointMesh = segHalo = jointHalo = null;
  if (!maze) return;

  const axisOf = (a, b) => Maze.axisOf(a, b);
  const maxDist = Math.max(1, ...[...toExit.values()]);
  const colourAt = (k) => {
    const d = toExit.has(k) ? toExit.get(k) : maxDist;
    return NEAR.clone().lerp(FAR, d / maxDist);
  };

  // --- joints --------------------------------------------------------------
  // Worked out first, because the segments need to know where the balls are:
  // a run of rope is cut at the cells that have one and nowhere else.
  //
  // Only where the geometry needs one. A cell the rope runs straight through is
  // left bare: its two segments are collinear and meet flush, and a ball there
  // is the lump that makes rope look beaded.
  //
  // This is where a maze departs from a path. Unknot decides by comparing the
  // step in against the step out, which needs there to be exactly one of each.
  // Here the decision is made from the set of axes meeting at the cell, which
  // is the same answer for a path and still an answer for a four-way junction.
  const jointed = [];
  const hasJoint = new Set();
  for (const k of maze.cells) {
    const axes = axesAt(maze.neighbours(k), k, axisOf);
    if (!needsJoint(maze.degree(k), axes)) continue;
    jointed.push({ k, axes, kind: junctionKind(maze.degree(k), axes) });
    hasJoint.add(k);
  }

  // --- segments ------------------------------------------------------------
  // A passage that stays inside one slice is drawn as rope. A passage that
  // steps in w is not: it is not a length of strand lying in space, it is the
  // same maze continuing in the next frame, and drawing it as rope would claim
  // a distance that is not there. It gets an arrow instead, exactly as unknot
  // does for the same reason.
  const flat = [], hops = [];
  for (const [a, b] of maze.edges()) {
    (axisOf(a, b) === viewAxes[3] ? hops : flat).push([a, b]);
  }

  // One cylinder per straight RUN, not per passage -- see straightRuns() in
  // junction.js. A corridor was a line of cylinders meeting end to end at cells
  // that carry no ball, and every one of those seams was a place for the halo
  // shells to band. Welded into one cylinder there is no seam there to band,
  // and the ends that remain are the joints, which cover their own.
  //
  // The w passages are held out of the weld: a run has to be a length of rope
  // lying in the slice, and a step that leaves the slice is not drawn as one.
  const runs = straightRuns(flat, { axisOf, jointAt: (k) => hasJoint.has(k) });

  const segGeo = new THREE.CylinderGeometry(TUBE, TUBE, 1, 10);
  // White, because an instance colour MULTIPLIES the material's own. Left at
  // three's default the product is black, which is what the rope came out as
  // the first time. The emissive lift is unknot's: the rope has to stay
  // readable where it passes into a frame's shadow.
  segMesh = new THREE.InstancedMesh(
    segGeo,
    new THREE.MeshLambertMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.24,
      transparent: true }),
    runs.length);
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), mid = new THREE.Vector3();
  // Open ended -- see shellGeometry(); a cap here bands every straight run.
  segHalo = new THREE.InstancedMesh(
    shellGeometry(TUBE, 10), haloMaterial(), runs.length);
  segHalo.renderOrder = HALO_ORDER;
  segMesh.renderOrder = ROPE_ORDER;
  runs.forEach(({ from, to }, i) => {
    va.set(...proj(from)); vb.set(...proj(to));
    mid.copy(va).add(vb).multiplyScalar(0.5);
    const dir = vb.clone().sub(va);
    q.setFromUnitVectors(up, dir.clone().normalize());
    const len = dir.length();
    m4.compose(mid, q, new THREE.Vector3(1, len, 1));
    segMesh.setMatrixAt(i, m4);
    // The two ends' colours averaged. A run is at most a few cells long -- the
    // generator bends too often for corridors -- so the distance colour it
    // stands for barely varies along it, and one colour for the run says the
    // same thing a per-cell ramp did.
    const col = colourAt(from).lerp(colourAt(to), 0.5);
    segMesh.setColorAt(i, col);
    // Fatter across the tube and longer along it -- see overshoot() in halo.js.
    // A maze joints on the axes meeting at a cell, so the smallest joint on a
    // run is the straight-through radius, and the overshoot is measured from
    // that: sized to the joint it must hide inside, not the biggest one going.
    m4.compose(mid, q, new THREE.Vector3(
      fatten(TUBE), len + 2 * overshoot(TUBE), fatten(TUBE)));
    segHalo.setMatrixAt(i, m4);
  });
  segMesh.instanceMatrix.needsUpdate = true;
  if (segMesh.instanceColor) segMesh.instanceColor.needsUpdate = true;
  segHalo.instanceMatrix.needsUpdate = true;
  ropeGroup.add(segHalo, segMesh);

  const jointGeo = new THREE.SphereGeometry(1, 12, 10);
  jointMesh = new THREE.InstancedMesh(
    jointGeo,
    new THREE.MeshLambertMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.24,
      transparent: true }),
    jointed.length);
  // Its own copy of the sphere, not jointGeo: the halo hangs per-instance
  // attributes on its geometry, and the rope's joints have no use for them.
  jointHalo = new THREE.InstancedMesh(
    jointGeo.clone(), jointHaloMaterial(), jointed.length);
  jointHalo.renderOrder = HALO_ORDER;
  jointMesh.renderOrder = ROPE_ORDER;
  // Which way this joint's arms leave, and how wide a cone each one takes out
  // of the halo ball -- see haloshape.js. Both vary per joint, so both are
  // instanced: a junction's ball is scaled up to mark it while its arms stay
  // the width they were, which makes its cone narrower than a corner's.
  const masks = new Float32Array(jointed.length);
  const fracs = new Float32Array(jointed.length);
  jointed.forEach(({ k, axes, kind }, i) => {
    const r = jointRadius(TUBE, axes);
    // A junction is marked, because a place where the player has to choose is
    // the one thing in a maze worth seeing from across the room. But only just
    // marked: at 1.9x the spheres were bigger than the passages between them
    // and the maze read as a heap of beads with rope incidental. The colour is
    // doing the work, so the size only has to be enough to notice.
    const scale = kind === 'junction' ? r * 1.25 : r;
    const pos = new THREE.Vector3(...proj(k));
    m4.compose(pos, new THREE.Quaternion(),
               new THREE.Vector3(scale, scale, scale));
    jointMesh.setMatrixAt(i, m4);
    jointMesh.setColorAt(i, kind === 'junction' ? JUNCTION.clone() : colourAt(k));
    const hs = fattenJoint(scale) * scale;
    m4.compose(pos, new THREE.Quaternion(), new THREE.Vector3(hs, hs, hs));
    jointHalo.setMatrixAt(i, m4);
    // The arms are the passages drawn as TUBE. A step that leaves the slice is
    // an arrow, not a tube, so it wears no sleeve and the ball keeps its halo
    // that way -- it drops out by itself, having no component on these axes.
    masks[i] = armMask(maze.neighbours(k)
      .filter((n) => axisOf(k, n) !== viewAxes[3])
      .map((n) => new THREE.Vector3(...proj(n)).sub(pos)));
    // Measured against the halo ball this instance actually has, which is why
    // the junction's 1.25 has to be in here and not in a constant.
    fracs[i] = sleeveFraction(fatten(TUBE) * TUBE, hs);
  });
  jointHalo.geometry.setAttribute(
    'armMask', new THREE.InstancedBufferAttribute(masks, 1));
  jointHalo.geometry.setAttribute(
    'sleeveFrac', new THREE.InstancedBufferAttribute(fracs, 1));
  jointMesh.instanceMatrix.needsUpdate = true;
  if (jointMesh.instanceColor) jointMesh.instanceColor.needsUpdate = true;
  jointHalo.instanceMatrix.needsUpdate = true;
  ropeGroup.add(jointHalo, jointMesh);

  // --- the passages that leave the slice -----------------------------------
  //
  // Two arrows per passage, one in each frame, pointing at each other. This is
  // the game with most to gain from that: a maze has a way out of the slice at
  // a large fraction of its cells, and drawn as lines between frames they were
  // a grey cobweb laid over the whole board. An arrow beside its own cell says
  // the same thing without crossing anything.
  //
  // They take the cell's own distance colour rather than a colour of their own,
  // so a way out is read exactly like every other passage: how far it leaves
  // you from the exit. The arrowhead is what says it leaves the slice.
  if (!arrows) arrows = new Arrows(ropeGroup);
  arrows.clear();
  for (const [a, b] of hops) {
    const va = new THREE.Vector3(...proj(a)), vb = new THREE.Vector3(...proj(b));
    arrows.add(va, vb, colourAt(a));
    arrows.add(vb, va, colourAt(b));
  }
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

// A move is legal only along a passage. There is no collision to detect and no
// wall to bump into -- if there is no rope going that way, there is no way.
function tryMove(axis, sign) {
  if (won || !maze) return;
  const p = at.split(',').map(Number);
  const np = step(p, dirVec(axis, sign, dims.length), dims, []);
  if (!np) return;
  const nk = key(np);
  if (!maze.neighbours(at).includes(nk)) return;
  at = nk;
  steps++;
  slide.focus = np[viewAxes[3]];
  if (at === exit) won = true;
  rebuildRope();
  updateHud();
  // Which directions are open changed with the step, and the pad only
  // re-reads `isLive` when it is told to.
  if (panels) panels.update();
}

function onKey(e) {
  if (pause && pause.open) return;
  const m = KEYMAP[e.key];
  if (!m) return;
  e.preventDefault();
  tryMove(m.axis, m.sign);
}

function updateHud() {
  const status = document.getElementById('status');
  if (won) {
    status.innerHTML = `<b>${WON.heading}</b> &mdash; ` + WON.summary(steps, best);
    return;
  }
  const left = toExit.has(at) ? toExit.get(at) : 0;
  status.innerHTML = PANELS.pair(HUD.steps, steps, HUD.toGo, left);
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

const t0 = performance.now();
let last = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (gamepads) gamepads.poll();
  if (slide.step(dt)) {
    buildFrames();
    rebuildRope();
  }
  // The scenery follows the CAMERA's lateral angle, not the player's w. The
  // slices are what move with w; the table and the sky are the room they stand
  // in, and turning them with a gameplay move would make the room lurch.
  //
  // The rock is set BEFORE the scenery is updated, because props.update reads
  // orbit.rockYaw to place the table -- so rocking afterwards would shape the
  // room from the previous frame's swing.
  if (orbit) {
    const r = rockAt(t - t0);
    orbit.rock(r.yaw, r.tilt);
  }
  if (props && orbit) {
    props.update(slide.shown, orbit.az - Orbit.AZ0, orbit.rockYaw, t - t0, camera);
  }
  if (panels && maze) panels.draw(at.split(',').map(Number));
  if (arrows) arrows.face(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

init();
