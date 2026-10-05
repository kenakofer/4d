// 50D Snake -- the view.
//
// The rules live in snake50.js. Everything here is about reading a position in
// fifty dimensions, and the answer is the one 4D Snake's minimaps already give:
// a flat slice through the head, holding every axis but two at the head's own
// coordinates. Fifty axes make twenty-five such slices, so there are twenty-five
// panels, and nothing else is drawn of the board. There are no rooms: a ring of
// 5^48 cubes is not something anyone could look at.
//
// Behind them is only the shared starfield, rocking gently as every game's view
// does. The table and the orbs are gone: they are cut along a fourth axis, and
// with fifty there is no one axis for them to follow.
//
// The keys split the work the way the panels do. WASD chooses which slice the
// arrows act in, walking a five-by-five grid; the arrows then move the head
// along that slice's two axes.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { Snake50, PANEL_COUNT, panelAxes } from './snake50.js';
import { step } from '../../shared/grid.js';
import { Orbit, bindOrbit } from '../../shared/orbit.js';
import { Sky } from '../../shared/sky.js';
import { rockAt } from '../../shared/rock.js';
import { Pad, DIRECTIONS } from '../../shared/pad.js';
import { SliceMap } from '../../shared/slicemap.js';
import { FAR_PLANE } from '../../shared/props.js';
import { PauseMenu } from '../../shared/pause.js';
import { pulseAt, COLORS } from '../../shared/scene.js';
import { HUD, GAME_OVER, VERBS, INTO, DIED_PLAINLY, DIED, AXIS,
         PANEL_CAPTION, PAD, MODE, COMPLETE } from './copy.js';

const el = (id) => document.getElementById(id);

// The panels are laid out five across, in axis order, so slice k sits at row
// k / 5, column k % 5.
const COLS = 5;
const ROWS = PANEL_COUNT / COLS;

// The head's colour in 4D Snake's room and on its maps.
const HEAD_COLOUR = '#ff8c1a';
const LAVA_FILL = { colour: '#ff2b1d', opacity: 0.8 };

// The camera only looks at the sky, so where it stands matters only for how
// the stars swing as the view rocks or is dragged.
const REST = 20;

let scene, camera, renderer, orbit, pad, pause;
let game;
let active = 0;          // which slice the arrows move in
// Looking around. Space switches the arrows from steering the head to moving
// a separate view cell, and every slice is then taken through that cell
// instead of the head. Lava that blocks the way is two axes thick, so the way
// round it is along some third axis -- and the only way to see which is to
// move the view onto the lava and look at the other panels from there. The
// snake does not move while you look; Space again puts the view back on the
// head and the arrows back on the snake.
let looking = false;
let eye = null;
let maps = [];
const t0 = performance.now();

function writeLabels() {
  const set = (id, text) => { const e = el(id); if (e) e.textContent = text; };
  set('title', HUD.title);
  set('blurb', HUD.blurb);
  set('scoreLabel', HUD.score);
  set('lengthLabel', HUD.length);
  set('alignedLabel', HUD.aligned);
  set('completeLabel', HUD.complete);
  set('padFoot', HUD.padFoot);
  set('spaceKey', MODE.key);
  set('overHeading', GAME_OVER.heading);
  set('overScoreLabel', GAME_OVER.finalScore);
  set('restartKey', GAME_OVER.playAgainKey);
  set('restartSub', GAME_OVER.playAgain);
}

function init() {
  writeLabels();
  renderer = new THREE.WebGLRenderer({ canvas: el('view'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  new Sky(scene);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, FAR_PLANE);

  orbit = new Orbit(renderer.domElement, [0, 0, 0], REST);
  orbit.restRadius = REST;
  orbit.maxR = REST * 3;
  orbit.onChange = () => {
    camera.position.set(...orbit.position());
    camera.lookAt(...orbit.target);
  };
  orbit.az = Orbit.AZ0;
  orbit.el_ = 0;
  orbit.onChange();

  buildPanels();
  newGame();
  bindInput();
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(render);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitSlices();
}

// Make the grid of slices as large as the free space allows, and centre it
// there.
//
// The free space is the window less the HUD and the pad: beside them when they
// stand in a column down the left, above the pad when it sits under the grid.
// The grid's height is its width plus the captions and gaps, which do not
// scale, so it is sized by measuring rather than by formula -- a few rounds of
// scaling to the height that is free converge at once.
//
// A phone lays the page out in CSS alone, so this stands aside there.
const MARGIN = 14;
function fitSlices() {
  const grid = el('slices');
  if (innerWidth <= 620) {
    grid.style.cssText = '';
    const hud = el('hud').getBoundingClientRect();
    const padTop = el('padPanel').getBoundingClientRect().top;
    grid.style.top = `${hud.bottom + 8}px`;
    grid.style.left = '8px';
    grid.style.width = `${Math.min(innerWidth - 16, padTop - hud.bottom - 16)}px`;
    return;
  }
  const hud = el('hud').getBoundingClientRect();
  const pad = el('padPanel').getBoundingClientRect();
  const left = hud.right + MARGIN;
  // The pause button sits in the top right corner.
  const right = innerWidth - 60;
  const top = MARGIN;
  // A pad in the left column leaves the full height; one under the grid does
  // not.
  const bottom = pad.right <= left ? innerHeight - MARGIN : pad.top - MARGIN;
  const W = right - left, H = bottom - top;
  let w = Math.min(W, H);
  for (let i = 0; i < 4; i++) {
    grid.style.width = `${w}px`;
    w = Math.min(W, w * H / grid.offsetHeight);
  }
  grid.style.width = `${Math.floor(w)}px`;
  grid.style.left = `${left + (W - grid.offsetWidth) / 2}px`;
  grid.style.top = `${top + (H - grid.offsetHeight) / 2}px`;
}

// One panel per slice. Built once: the slices never change which axes they
// show, only where they are taken.
function buildPanels() {
  const host = el('slices');
  host.innerHTML = '';
  maps = [];
  for (let k = 0; k < PANEL_COUNT; k++) {
    const [h, v] = panelAxes(k);
    const box = document.createElement('div');
    box.className = 'slice';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = PANEL_CAPTION(AXIS(h), AXIS(v));
    box.append(svg, cap);
    // Clicking a slice chooses it, for anyone who reaches for the mouse.
    box.addEventListener('click', () => choose(k));
    host.appendChild(box);
    maps.push({ box, svg, map: null });
  }
}

let lastOpts = null;
function newGame(opts) {
  lastOpts = opts || null;
  game = new Snake50(opts);
  for (let k = 0; k < PANEL_COUNT; k++) {
    const m = new SliceMap(maps[k].svg, {
      axes: panelAxes(k), dims: game.dims, wrap: game.wrap,
    });
    m.cellFill = (p) => (game.isLava(p) ? LAVA_FILL : null);
    m.markerColour = HEAD_COLOUR;
    maps[k].map = m;
  }
  setLooking(false);
  // Every run opens on the first slice, which is where the snake is laid.
  choose(0);
  el('over').classList.remove('show');
  updateHUD();
  if (pad) { pad.resetTaught(); pad.update(); }
}

// Make slice `k` the one the arrows move in.
function choose(k) {
  active = k;
  maps.forEach((m, i) => m.box.classList.toggle('active', i === k));
  nameArrows();
  if (pad) pad.update();
}

// The arrows' names say which axes they move along, so they change with the
// slice. Written into the existing buttons rather than rebuilding the pad,
// which would cut short a button's flash.
function nameArrows() {
  if (!pad) return;
  const [h, v] = panelAxes(active);
  pad.dirs.forEach((b, i) => {
    if (b.axis !== 0 && b.axis !== 2) return;
    const axis = b.axis === 0 ? h : v;
    // Up on the screen is up the panel's vertical axis, which is the pad's
    // north: sign -1 on axis 2.
    const sign = b.axis === 0 ? b.sign : -b.sign;
    const name = sign > 0 ? PAD.plus(AXIS(axis)) : PAD.minus(AXIS(axis));
    const btn = pad.buttons[i];
    if (btn) btn.querySelector('.nm').textContent = name;
  });
}

// The pad's directions, with WASD renamed for what it does here. The keys,
// axes and signs are the shared ones, so the clusters lay out exactly as they
// do in every other game.
const NAMES = {
  'w': PAD.sliceUp, 's': PAD.sliceDown, 'a': PAD.sliceLeft, 'd': PAD.sliceRight,
};
const DIRS = DIRECTIONS.map((b) => ({ ...b, name: NAMES[b.key] || b.name }));

// What a pad press means. Axes 1 and 3 are WASD, which walk the grid of
// slices; axes 0 and 2 are the arrows, which move the head in the chosen one.
function selectTarget(axis, sign) {
  const r = Math.floor(active / COLS), c = active % COLS;
  const nr = axis === 1 ? r - sign : r;
  const nc = axis === 3 ? c + sign : c;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return null;
  return nr * COLS + nc;
}

function setLooking(on) {
  looking = on;
  eye = on ? game.head.slice() : null;
  el('spaceName').textContent = on ? MODE.looking : MODE.steering;
  el('spaceBtn').classList.toggle('looking', on);
  el('slices').classList.toggle('looking', on);
}

function toggleLooking() {
  setLooking(!looking);
  updateHUD();
  pad.update();
}

// Where every slice is taken: the view cell while looking, the head otherwise.
const focusCell = () => (looking ? eye : game.head);

// Where the view would go for an arrow press, or null at the edge of the board.
const eyeTarget = (axis, sign) => step(eye, moveDir(axis, sign), game.dims, game.wrap);

function moveDir(axis, sign) {
  const [h, v] = panelAxes(active);
  const dir = Array(game.D).fill(0);
  if (axis === 0) dir[h] = sign;
  else dir[v] = -sign;
  return dir;
}

function onPush(axis, sign) {
  if (axis === 1 || axis === 3) {
    const k = selectTarget(axis, sign);
    if (k === null) { pad.flash(axis, sign, false); return; }
    choose(k);
    pad.flash(axis, sign, true);
    return;
  }
  if (game.over) return;
  if (looking) {
    const to = eyeTarget(axis, sign);
    if (!to) { pad.flash(axis, sign, false); return; }
    eye = to;
    updateHUD();
    pad.update();
    pad.flash(axis, sign, true);
    return;
  }
  const plan = game.move(moveDir(axis, sign));
  if (plan.kind === 'reversal') { pad.flash(axis, sign, false); return; }
  updateHUD();
  pad.update();
  pad.flash(axis, sign, plan.kind !== 'die');
  if (game.over) showGameOver();
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function deathSentence() {
  const into = INTO[game.cause];
  if (!into) return '';
  const d = game.fatalDir;
  if (!d) return `${DIED_PLAINLY} ${into}.`;
  const axis = d.findIndex((x) => x !== 0);
  return DIED(pick(VERBS), AXIS(axis), d[axis], into);
}

function showGameOver() {
  el('overScore').textContent = game.score;
  el('overCause').textContent = deathSentence();
  el('over').classList.add('show');
}

// Is the head level with the apple on both of slice k's axes?
function aligned(k) {
  if (!game.apple) return false;
  const [h, v] = panelAxes(k);
  return game.head[h] === game.apple[h] && game.head[v] === game.apple[v];
}

// How much of the board the snake fills, as a percentage -- which is how a game
// of snake is won, and at 5^50 cells is a number with thirty-odd zeros in it.
// Written out in full rather than in scientific notation, because the zeros
// are the joke.
function percentFilled() {
  const cells = game.dims.reduce((a, s) => a * s, 1);
  const p = (game.length * 100) / cells;
  const places = Math.min(100, Math.max(0, 1 - Math.floor(Math.log10(p))));
  return p.toFixed(places);
}

function updateHUD() {
  el('score').textContent = game.score;
  el('length').textContent = game.length;
  let n = 0;
  maps.forEach((m, k) => {
    m.map.focus = focusCell();
    // While looking, the view cell is a ring and the head is drawn where it
    // actually is, if it is in the slice at all.
    m.map.lead = looking ? game.head : null;
    m.map.markerStyle = looking ? 'ring' : 'fill';
    m.map.body = game.body;
    m.map.apple = game.apple;
    m.map.draw();
    const a = aligned(k);
    if (a) n++;
    m.box.classList.toggle('aligned', a);
  });
  el('aligned').textContent = `${n}/${PANEL_COUNT}`;
  el('complete').textContent = COMPLETE(percentFilled());
}

function bindInput() {
  pad = new Pad([el('padSelect'), el('padMove')], {
    dirs: DIRS,
    teachOnly: true,
    onPush: (axis, sign) => onPush(axis, sign),
    isLive: (axis, sign) => {
      if (axis === 1 || axis === 3) return selectTarget(axis, sign) !== null;
      if (game.over) return false;
      if (looking) return !!eyeTarget(axis, sign);
      return game.plan(moveDir(axis, sign)).kind !== 'reversal';
    },
  });
  pad.bindKeys(window, () => !(pause && pause.open));
  nameArrows();

  addEventListener('keydown', (ev) => {
    if (ev.key === ' ' || ev.code === 'Space') {
      if (pause && pause.open) return;
      ev.preventDefault();
      if (ev.repeat) return;
      if (game.over) { newGame(lastOpts); return; }
      toggleLooking();
    }
  });
  el('spaceBtn').addEventListener('click', (ev) => {
    // Off the button straight away, or the next Space press would also
    // "click" it and toggle twice.
    ev.currentTarget.blur();
    if (!game.over) toggleLooking();
  });
  el('restart').addEventListener('click', () => newGame(lastOpts));

  pause = new PauseMenu({ onRestart: () => newGame(lastOpts) });

  bindOrbit(renderer.domElement, () => orbit);

  // The pad folds away once every key has been used, which frees room the
  // grid should grow into.
  new ResizeObserver(fitSlices).observe(el('padPanel'));
}

function render(now) {
  const t = now || performance.now();
  const r = rockAt(t - t0);
  orbit.rock(r.yaw, r.tilt);
  orbit.onChange();

  // The apple breathes on every panel from one clock, as it does in 4D Snake.
  const fade = game.over ? 1 : pulseAt(t - t0);
  for (const m of maps) {
    m.map.appleFade = fade;
    m.map.pulseApple();
  }

  renderer.render(scene, camera);
}

init();

// Handle for inspection from the console.
window.__snake50 = {
  newGame,
  choose,
  draw: () => render(performance.now()),
  get game() { return game; },
  get active() { return active; },
  get looking() { return looking; },
  get eye() { return eye; },
  get orbit() { return orbit; },
};
