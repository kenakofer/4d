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

import { sendToTutorialIfNew, tutorialUrl } from '../../shared/tutorial-entry.js';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { generate, distances, Maze, DEFAULTS } from './maze.js';
import { jointRadius, needsJoint, junctionKind, axesAt, straightRuns }
  from '../../shared/junction.js';
import { Ring, Slide } from '../../shared/ring.js';
import { Orbit, bindOrbit } from '../../shared/orbit.js';
import { rockAt, pulseAt, blinkPhase } from '../../shared/rock.js';
import { Props, FAR_PLANE, LOOK_DOWN_DEG } from '../../shared/props.js';
import { KEYMAP, dirVec } from '../../shared/pad.js';
import { SlicePanels } from '../../shared/slicepanels.js';
import { Gamepads } from '../../shared/gamepad.js';
import { PauseMenu } from '../../shared/pause.js';
import { addLights, sliceFrame, blocker, COLORS } from '../../shared/scene.js';
import { Sky } from '../../shared/sky.js';
import { dropConfetti } from '../../shared/confetti.js';
import { haloMaterial, jointHaloMaterial, fatten, fattenJoint, overshoot,
  shellGeometry, HALO_ORDER, ROPE_ORDER } from '../../shared/halo.js';
import { armMask, sleeveFraction } from '../../shared/haloshape.js';
import { Arrows, sizeFor } from '../../shared/warrow.js';
import { cellMarks } from '../../shared/wallmark.js';
import { key, step } from '../../shared/grid.js';
import { HUD, FOURTH, WON, PANELS } from './copy.js';

let scene, camera, renderer, orbit, props, panels, pause, gamepads;
let maze = null, dims = DEFAULTS.dims.slice();
let at = null;            // where the player stands, as a key
let origin = null;        // where they started, which does not move
let exit = null;          // the cell to reach
let toExit = new Map();   // distance from every cell to the exit
let steps = 0, best = 0, won = false;

// viewAxes[k] says which maze axis is drawn along render axis k. Slot 3 is the
// one laid out around the ring. Same convention as the other games, so a
// player's sense of which way is which carries over.
const viewAxes = [0, 1, 2, 3];

const slide = new Slide();
let gridGroup, frames, ropeGroup;
// The cursor's two pieces: the cage around the player's cell, and its shadows
// on the walls. Built once and moved, rather than rebuilt with the rope --
// the cage never changes shape, and the marks change only when the camera
// crosses a wall's plane.
let cageMesh = null, markMesh = null;
// The solid boxes over the start and the exit. Built once and moved, like the
// cage -- a new maze puts them somewhere else, it does not need new ones.
let startBox = null, exitBox = null;

// The rope's colour ramp. Unknot runs its ramp end to end along the strand,
// which it can because a strand has two ends. A maze has none, so the ramp runs
// with distance from the exit instead: everything you can see is coloured by
// how far it is from where you are trying to get to, which turns the colour
// into a hint rather than decoration.
const NEAR = new THREE.Color(0x37d6a0);   // close to the exit
const FAR = new THREE.Color(0xa06bff);    // far from it
const JUNCTION = new THREE.Color(0xffd166);

// The three cells that are not like the others: where you are, where you began,
// and where you are going.
//
// Unknot marks the two ends of its rope, and for the same reason -- a strand
// with no ends marked is a strand you cannot orient yourself along. A maze
// needs it more, not less: the rope forks, so there is nothing else on screen
// that says which of a hundred identical junctions is the one that matters.
//
// Each is a COLOUR and a SHAPE, and the shape is what makes them findable
// across a room. A ball cannot carry this on its own: a joint's size already
// means how many passages meet at it, so inflating one of these would claim a
// junction it may not be, and its colour is one more colour among four hundred
// coloured balls. So each of the three wears a box, which is a kind of object
// the maze has none of anywhere else.
//
// They are told apart from each other by colour and by how the box behaves:
//
//   YOU     orange, a wireframe cage, blinking on the caret clock. Hollow
//           because the joint inside it is carrying the distance colour you
//           are reading, and a marker that blanks what it points at has
//           pointed at nothing.
//   START   yellow, a solid haze, still. It is a fact about the board and it
//           does not need attention -- you look for it when you want it.
//   EXIT    green, a solid haze, breathing. The one thing on screen worth
//           finding, and movement is what the eye finds first.
//
// PLAYER is orange rather than the yellow it began as. That yellow was
// JUNCTION's exactly, so the cell the player stood on was drawn in the colour
// meaning "a place where you must choose", and among a hundred junctions the
// one mark that has to be findable at a glance was camouflaged. START keeps a
// yellow because a still, solid box is not in danger of being read as a ball,
// and it is the paler end of that hue so the two do not trade places at
// distance.
const PLAYER = new THREE.Color(0xff8c1a);  // where you stand
const START = new THREE.Color(0xffe08a);   // where you came in
const EXIT = new THREE.Color(0x35ff8a);    // where you are going

const TUBE = 0.115;

// The cursor: a cage around the cell the player stands on, and that cell's
// shadow on the walls of its frame.
//
// The ball alone was not enough, and could not be. A joint's colour is read
// against four hundred other joints and its size means how many passages meet
// there, so neither is free to shout -- and the one thing a maze-walker needs
// continuously, more than where the exit is, is where THEY are. Losing your own
// position in a tangle of identical rope is what makes a maze unplayable, and
// it is the failure a still coloured ball is worst at preventing.
//
// So the cursor is given the two things nothing else in the scene has. It is
// the only cage -- a box among tubes and balls, which reads instantly because
// it is not the same KIND of object as its surroundings. And it blinks, on
// unknot's caret clock, because the eye finds movement across a busy room
// before it finds colour.
//
// The wall marks are the other half, and they answer a different question. A
// cage says which cell; the marks say which x, which y, which z -- because a
// point in perspective is consistent with a whole line of positions, and the
// player has to know where they stand along each axis to make sense of the pad.
// Exactly unknot's reasoning, and now exactly its code: see shared/wallmark.js.
const CURSOR_CAGE = 0.46;    // half-width of the cage, just inside the cell
const CURSOR_MARK = 0.42;    // half-width of a wall square, as unknot's
// How far each surface swings when the blink is dim. The cage is a solid line
// and the wall mark a faint wash, so the same fraction is a much smaller change
// on the mark -- it gets the deeper swing to blink as visibly as the cage.
const BLINK_CAGE = 0.45;
const BLINK_MARK = 0.5;

// The boxes over the start and the exit.
//
// Solid and see-through, where the player's mark is a wireframe cage. The
// difference is doing work: a cage is a thing you are inside, which is what
// being somewhere means, and a haze is a thing you can see from outside and
// walk into, which is what a destination is. The player never has to wonder
// which of the three boxes is the one they are steering.
//
// They fill the cell rather than sitting just inside it, so from across the
// room they read as a lit block rather than an outline -- the whole point is to
// be visible from far enough away to steer toward.
const GOAL_BOX = 0.5;
// Faint. These stand over rope the player is reading, and at any real opacity
// the block became a hole in the maze with a colour in it. Enough to see the
// glow from a distance and to see straight through up close.
const GOAL_HAZE = 0.22;
// How much the exit's haze swings as it breathes. Deeper than the cursor's
// blink, and on the slow pulse rather than the hard caret switch -- the exit is
// where you are going, not where you are, and the two must never look like the
// same kind of object keeping the same time.
const GOAL_PULSE = 0.55;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function writeLabels() {
  document.getElementById('title').textContent = HUD.title;
  document.getElementById('blurb').textContent = HUD.blurb;
  document.getElementById('reset').textContent = WON.playAgain;
  // The win card. Its heading and the label under the count never change, so
  // they are written once here; the count and the sentence are filled in when
  // it is shown.
  document.getElementById('overHeading').textContent = WON.heading;
  document.getElementById('overScoreLabel').textContent = WON.yourSteps;
  document.getElementById('restartKey').textContent = WON.playAgainKey;
  document.getElementById('restartSub').textContent = WON.playAgain;
  document.getElementById('legendJunction').textContent = FOURTH.legendJunction;
  document.getElementById('legendW').textContent = FOURTH.legend;
  document.getElementById('legendPlayer').textContent = FOURTH.legendPlayer;
  document.getElementById('legendStart').textContent = FOURTH.legendStart;
  document.getElementById('legendExit').textContent = FOURTH.legendExit;
  // The swatches take their colour from the constants the scene is drawn with,
  // so a colour changed there cannot leave the key behind describing the old one.
  document.getElementById('swJunction').style.background = '#' + JUNCTION.getHexString();
  document.getElementById('swPlayer').style.background = '#' + PLAYER.getHexString();
  document.getElementById('swStart').style.background = '#' + START.getHexString();
  document.getElementById('swExit').style.background = '#' + EXIT.getHexString();
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
  // Kept apart from `at`, which walks away with the player. The start is a
  // place on the board rather than a thing about the player, and it stays
  // marked after they have left it -- a maze you cannot see the way back into
  // is missing the one landmark that says how far you have come.
  origin = a.cell;
  exit = b.cell;
  best = b.dist;
  toExit = distances(maze, exit);
  steps = 0;
  won = false;
  hideWin();

  slide.focus = at.split(',').map(Number)[viewAxes[3]];
  slide.shown = slide.focus;
  buildFrames();
  rebuildRope();
  updateCursor(true);
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
  // And stars behind it. The flat background stays as the ground they are drawn
  // on -- a star is added light, so it needs something to be added to.
  new Sky(scene);
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

  buildCursor();
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
  // The cursor's wall marks depend on where the eye is, so they cannot be laid
  // out until the camera has been put somewhere.
  updateCursor(true);
  // Drag to turn, wheel to zoom, two fingers to pinch -- the same as every
  // other game, from the same place, so it cannot drift apart from them again.
  bindOrbit(canvas, () => orbit);

  pause = new PauseMenu({
    onRestart: newMaze,
    onTutorial: () => { location.href = tutorialUrl(); },
  });
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
    // The player stands ON a passage rather than being one, so the cell they
    // are in is ringed and left showing. Filling it -- which is right for the
    // snake, whose head IS a cell -- would paint over the passage colour at the
    // one place the player is reading it from.
    m.markerStyle = 'ring';
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
      // A cell with a passage the panel cannot draw -- one that steps along an
      // axis this cross-section holds fixed. Those are the cells a flat map is
      // silently wrong about: the strand stops, or runs straight past, and
      // nothing says a way out was standing there.
      //
      // `onPanel` is the panel's own test, since only it knows which two axes
      // it draws. The maze supplies the passages and asks about each one.
      offPanel: (p, onPanel) => !!maze &&
        maze.neighbours(key(p)).some((n) => !onPanel(n.split(',').map(Number))),
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
  document.getElementById('restart').onclick = newMaze;
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
// Which joint instance is the exit's, so the loop can pulse that one ball
// without touching the other four hundred. Null when there is no rope, or when
// the player is standing on the exit and it has stopped being a destination.
let exitInstance = null;

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
    // The start and the exit always get one, whatever the geometry wants.
    //
    // A cell the rope runs straight through is normally left bare -- a ball
    // there is the lump that makes rope look beaded -- but these two are not
    // being marked because the rope bends at them. They are being marked
    // because of what they ARE, and a corridor is exactly where the player
    // most needs to see that the way out is here rather than at the next bend.
    const special = k === at || k === exit || k === origin;
    // needsJoint asks a question about ROPE: may these two cylinders meet flush
    // without a ball to cover the seam? So it has to be asked about the
    // passages that are actually drawn as rope, which the w ones are not --
    // they are arrows, and an arrow has no end to hide.
    //
    // A cell whose passages ALL step in w therefore has no rope at all, and
    // "straight through" is true of it only in a sense that does not apply: the
    // two arrows meet nothing, because there is nothing there. Left to the
    // rope's rule such a cell was drawn as neither ball nor strand -- a bare
    // point in space with two arrows aiming at it from either side, which is
    // exactly the middle of a straight run of w-moves.
    //
    // The w passages still COUNT, though, even though they are not rope: a cell
    // where rope runs straight through and a w-step branches off is a junction,
    // a place the player must choose, and asking only about the rope would drop
    // its ball and hide the choice. So a cell is left bare only when the rope's
    // rule says so AND there is nothing but rope there -- and `axes` below,
    // which sizes and colours the ball, keeps counting every passage.
    const ropeNs = maze.neighbours(k).filter((n) => axisOf(k, n) !== viewAxes[3]);
    const bare = maze.degree(k) === ropeNs.length &&
                 !needsJoint(ropeNs.length, axesAt(ropeNs, k, axisOf));
    if (!special && bare) continue;
    jointed.push({ k, axes, kind: junctionKind(maze.degree(k), axes), special });
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
  // Where the pulsing exit's ball lives in the instance buffers, so the frame
  // loop can breathe it without rebuilding the rope. Null when the exit is not
  // currently drawn.
  exitInstance = null;
  jointed.forEach(({ k, axes, kind, special }, i) => {
    const r = jointRadius(TUBE, axes);
    // A junction is marked, because a place where the player has to choose is
    // the one thing in a maze worth seeing from across the room. But only just
    // marked: at 1.9x the spheres were bigger than the passages between them
    // and the maze read as a heap of beads with rope incidental. The colour is
    // doing the work, so the size only has to be enough to notice.
    //
    // The start and exit are lifted a little further, for the same reason and
    // to the same small degree: enough to find, not enough to turn the two of
    // them into landmarks the rope hangs off.
    const scale = special ? r * 1.45 : (kind === 'junction' ? r * 1.25 : r);
    const pos = new THREE.Vector3(...proj(k));
    m4.compose(pos, new THREE.Quaternion(),
               new THREE.Vector3(scale, scale, scale));
    jointMesh.setMatrixAt(i, m4);
    // Start and exit outrank a junction: either may well BE one, and which
    // junction it is matters more than that it is one.
    let jc;
    if (k === at) jc = PLAYER.clone();
    else if (k === exit) { jc = EXIT.clone(); exitInstance = i; }
    else if (k === origin) jc = START.clone();
    else if (kind === 'junction') jc = JUNCTION.clone();
    else jc = colourAt(k);
    jointMesh.setColorAt(i, jc);
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
  // The maze is what the arrow size was tuned against -- 2.4 board-widths at 52
  // degrees -- so this comes out at 1. Said out loud rather than left to the
  // default, so that changing this game's camera is visibly a thing that
  // changes the arrows. See shared/warrow.js.
  if (!arrows) arrows = new Arrows(ropeGroup, { scale: sizeFor(2.4, 52) });
  arrows.clear();
  for (const [a, b] of hops) {
    const va = new THREE.Vector3(...proj(a)), vb = new THREE.Vector3(...proj(b));
    arrows.add(va, vb, colourAt(a));
    arrows.add(vb, va, colourAt(b));
  }
}

// ---------------------------------------------------------------------------
// The cursor
// ---------------------------------------------------------------------------

// Build the cage and the mesh its wall marks will be poured into.
//
// Once, at startup. The cage is the same box wherever the player goes, so it is
// moved rather than remade, and the marks are one mesh whose geometry is
// swapped -- both so that stepping through a maze costs no allocation on the
// hot path.
function buildCursor() {
  // A wireframe box rather than a solid one. Solid would hide the joint it
  // surrounds, and the joint is carrying the distance colour the player is
  // reading -- a cursor that blanks out what it points at has pointed at
  // nothing. Edges only, so the cell shows through its own marker.
  const box = new THREE.BoxGeometry(CURSOR_CAGE * 2, CURSOR_CAGE * 2,
                                    CURSOR_CAGE * 2);
  cageMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    // Basic, not Lambert: this is a marker, not a thing in the room, and it
    // must not go dim when the player walks into a corner the lights miss.
    // depthTest off so the cage shows through the rope it is standing among --
    // being occluded by the passage you are on is exactly the failure the
    // cursor exists to prevent.
    new THREE.LineBasicMaterial({
      color: PLAYER, transparent: true, depthTest: false, depthWrite: false }));
  box.dispose();
  cageMesh.renderOrder = HALO_ORDER + 1;
  cageMesh.material.userData.baseOpacity = 1;
  gridGroup.add(cageMesh);

  // The marks. One mesh, geometry replaced when the visible walls change.
  //
  // The stencil is unknot's, and for its reason: the squares of one cursor
  // never overlap each other, but the material is translucent and drawn with
  // depth writing off, so anything that DID overlap would blend twice and show
  // as a brighter patch. Claiming each pixel the first time keeps the wash even
  // whatever else lands on the wall.
  markMesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: PLAYER,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }));
  markMesh.renderOrder = 0;
  markMesh.material.userData.baseOpacity = markMesh.material.opacity;
  gridGroup.add(markMesh);

  // The two goal boxes. One geometry between them: they are the same block in
  // two colours, and the only difference is that one of them breathes.
  const goal = new THREE.BoxGeometry(GOAL_BOX * 2, GOAL_BOX * 2, GOAL_BOX * 2);
  const hazeFor = (colour) => new THREE.Mesh(
    goal.clone(),
    // depthWrite off so the box never hides the rope inside or behind it -- a
    // marker that occludes the maze has taken away more than it added. It is
    // still depth TESTED, unlike the player's cage: these two are places on the
    // board, and a destination that showed through the wall of the room it sits
    // in would be telling the player it is somewhere it is not.
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: GOAL_HAZE,
      depthWrite: false, side: THREE.DoubleSide }));
  startBox = hazeFor(START);
  exitBox = hazeFor(EXIT);
  goal.dispose();
  for (const b of [startBox, exitBox]) {
    // Behind the rope, so the strand reads on top of the haze rather than
    // through it.
    b.renderOrder = HALO_ORDER - 0.1;
    b.material.userData.baseOpacity = GOAL_HAZE;
    gridGroup.add(b);
  }
}

// Which walls are showing, as a short string, so the marks are rebuilt when
// that set changes and not on the frames in between.
//
// The camera rocks every frame but crosses a wall's plane only now and then.
// Rebuilding a buffer sixty times a second to produce the same six squares is
// the kind of waste that does not show up until it is next to four hundred
// instanced joints, which is where it is.
let cursorKey = '';

// Move the cursor to where the player now stands.
//
// `force` rebuilds the marks even if nothing seems to have changed -- the
// frames slide around the ring as w moves, so the same cell can need its marks
// redrawn without the camera or the cell having moved at all.
function updateCursor(force = false) {
  if (!cageMesh || !at || !orbit) return;
  // Won: the player is standing on the exit, which is pulsing to say so. Two
  // markers on one cell is one of them lying about where the other thing is,
  // so the cursor gets out of the way and lets the finish be the finish.
  cageMesh.visible = !won;
  markMesh.visible = !won;
  // The goal boxes are placed whatever the state, including after a win -- the
  // ring goes on sliding while the finish is on screen, and proj() answers in
  // world space, so a box left where it was would drift off its cell.
  //
  // Here rather than when the maze is built, for that same reason.
  if (startBox && origin) {
    const o = proj(origin);
    startBox.position.set(o[0], o[1], o[2]);
    // Hidden while the player is standing on it. The cage is already there,
    // and two boxes on one cell is one of them lying about which is which.
    startBox.visible = origin !== at;
  }
  if (exitBox && exit) {
    const e = proj(exit);
    exitBox.position.set(e[0], e[1], e[2]);
    exitBox.visible = true;
  }
  if (won) {
    // The exit stops breathing: it has been reached, so it is no longer
    // something to find. Both boxes stay -- together they are the route just
    // walked, which is worth seeing at the end.
    if (exitBox) exitBox.material.opacity = exitBox.material.userData.baseOpacity;
    return;
  }

  const p = proj(at);
  cageMesh.position.set(p[0], p[1], p[2]);

  // The marks go on the walls of the frame the player is IN, not of the ring as
  // a whole: each slice is its own room, and a shadow cast onto some other
  // slice's wall would be pointing at a place the player is not.
  const w = at.split(',').map(Number)[viewAxes[3]];
  const off = slotOffset(w);
  const dims3 = [dims[viewAxes[0]], dims[viewAxes[1]], dims[viewAxes[2]]];
  const eye = orbit.position();
  const sig = `${at}|${eye.map((v, d) =>
    (v > off[d] - 0.5 ? '1' : '0') + (v < off[d] + dims3[d] - 0.5 ? '1' : '0')
  ).join('')}`;
  if (!force && sig === cursorKey) return;
  cursorKey = sig;

  const verts = cellMarks(p, eye, off, dims3, CURSOR_MARK);
  markMesh.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeBoundingSphere();
  markMesh.geometry = g;
}

// Blink the cursor, on the same clock as unknot's caret.
//
// Both pieces ride on material opacity, which they can because each is its own
// mesh -- unlike the exit's ball, which is one instance among four hundred and
// has to blink on colour instead.
function blinkCursor(ms) {
  if (!cageMesh) return;
  // Won: the cursor is hidden, so leave both materials at rest rather than
  // frozen wherever the last blink happened to stop. Otherwise the next maze
  // opens with a cage stuck at half strength until the clock next ticks over.
  const phase = won ? 0 : blinkPhase(ms);
  cageMesh.material.opacity =
    cageMesh.material.userData.baseOpacity * (1 - BLINK_CAGE * phase);
  markMesh.material.opacity =
    markMesh.material.userData.baseOpacity * (1 - BLINK_MARK * phase);
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
  if (at === exit) { won = true; showWin(); }
  rebuildRope();
  updateCursor(true);
  updateHud();
  // Which directions are open changed with the step, and the pad only
  // re-reads `isLive` when it is told to.
  if (panels) panels.update();
}

function onKey(e) {
  if (pause && pause.open) return;
  // Space starts the next maze once this one is finished. The copy has
  // promised this key on the card's button all along; until now nothing read
  // it, so the one instruction on screen at the end did nothing.
  //
  // Only while the card is up. A bare restart key during play is exactly what
  // the pause menu exists to prevent -- a key next to the movement keys will
  // eventually be hit by accident and throw away a good run.
  if (won && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    newMaze();
    return;
  }
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
  status.innerHTML = PANELS.single(HUD.steps, steps);
}

// Reaching the exit.
//
// The card and the shower, together. Until now this was a line of text in the
// side panel -- and the step count was already there, so the one moment the
// whole maze is played for looked like the counter ticking over.
//
// The board is left showing behind the card, which is why that card is built
// the way it is: the route just walked is worth looking at, and the start and
// exit boxes are still standing on it at either end of it.
function showWin() {
  document.getElementById('overScore').textContent = steps;
  document.getElementById('overCause').textContent = WON.summary(steps, best);
  document.getElementById('over').classList.add('show');
  // Focused so Space and Enter reach the button wherever the browser routes
  // keys first -- the same care the tutorial's card takes.
  document.getElementById('restart').focus();
  dropConfetti();
}

function hideWin() {
  document.getElementById('over').classList.remove('show');
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
    // The frames have moved around the ring, so the walls the marks are painted
    // on are somewhere new even though the player has not taken a step.
    updateCursor(true);
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
  // Cheap unless the camera has crossed a wall's plane, which is rare -- see
  // updateCursor.
  updateCursor();
  blinkCursor(t - t0);
  pulseExit(t - t0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Breathe the exit's ball.
//
// The colour is scaled rather than the geometry: a ball that grew and shrank
// would fight the one thing joint SIZE already means here -- how many passages
// meet at a cell -- and a reader who had learned that would be told a lie twice
// a second. Brightness carries no such meaning, so it is free to carry this.
//
// Only the one instance is rewritten, and only its colour buffer is flagged.
// The maze has some four hundred joints and this runs every frame.
function pulseExit(ms) {
  if (won) return;
  const f = 0.55 + 0.45 * pulseAt(ms);
  // The box breathes on the same clock as the ball inside it, so the two read
  // as one object rather than two markers that happen to share a cell.
  if (exitBox) {
    exitBox.material.opacity = exitBox.material.userData.baseOpacity *
      (1 - GOAL_PULSE * (1 - pulseAt(ms)));
  }
  if (!jointMesh || exitInstance === null) return;
  jointMesh.setColorAt(exitInstance, EXIT.clone().multiplyScalar(f));
  if (jointMesh.instanceColor) jointMesh.instanceColor.needsUpdate = true;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// A player who has never done the movement tutorial goes there first.
//
// It runs on Snake's board -- the fourth dimension has to be used to be
// learned, and that is the simplest game to use it in -- and hands the player
// back here when it ends. If it redirects, there is no point building a scene
// nobody will see.
if (!sendToTutorialIfNew()) init();
