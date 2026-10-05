// 50D Snake model tests. Run with: npm test
//
// The move rules are 4D Snake's and are tested there, in 2 to 5 dimensions.
// What is tested here is what this game changes -- placement in a space that
// cannot be listed -- and that the inherited rules still hold at fifty.
import { Snake50, CAUSE, PANEL_COUNT, panelAxes } from '../src/snake50.js';
import { Box, eq as cellEq } from '../../shared/grid.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

const D = 50;
const unit = (d, s) => { const v = Array(D).fill(0); v[d] = s; return v; };
const cell = (over = {}) => {
  const p = Array(D).fill(2);
  for (const [d, v] of Object.entries(over)) p[d] = v;
  return p;
};

// A placed board, as 4D Snake's suite builds them.
function board(body, opts = {}) {
  const g = new Snake50({ seed: 1, lavaCount: 0, ...opts });
  g.lava = (opts.lava || []).map((b) => new Box(b.origin, b.size));
  g.body = body.map((p) => p.slice());
  g.pending = 0;
  g.apple = opts.apple || cell({ 49: 4, 48: 4 });
  g.over = false;
  g.cause = null;
  return g;
}

console.log('\nthe board');
{
  const g = new Snake50({ seed: 7 });
  eq('fifty axes', g.D, 50);
  ok('five cells along each', g.dims.every((s) => s === 5));
  eq('snake starts 4 long', g.length, 4);
  ok('an apple exists', !!g.apple);
  ok('the apple is not on the snake', !g.occupied(g.apple));
  ok('the apple is not in lava', !g.isLava(g.apple));
  eq('sixteen slabs of lava', g.lava.length, 16);
}

console.log('\nthe panels');
{
  const seen = [];
  for (let k = 0; k < PANEL_COUNT; k++) seen.push(...panelAxes(k));
  eq('twenty-five panels show every axis exactly once',
     seen.slice().sort((a, b) => a - b), [...Array(D).keys()]);
}

console.log('\nlava is slabs');
{
  const g = new Snake50({ seed: 3 });
  ok('each slab is pinned along exactly two axes',
     g.lava.every((b) => b.size.filter((s, d) => s < g.dims[d]).length === 2));
  ok('and spans the board along every other',
     g.lava.every((b) => b.size.every((s, d) => s < g.dims[d] || b.origin[d] === 0)));
  ok('pinned widths are 1 and 2',
     g.lava.every((b) => b.size.filter((s) => s < 5).sort().join() === '1,2'));
}

console.log('\nfair starts');
{
  let bad = 0, offPanel = 0, lava = 0;
  for (let s = 0; s < 300; s++) {
    const g = new Snake50({ seed: s });
    if (!g.openInFirstPanel(g.body)) bad++;
    if (g.body.some((p) => g.isLava(p))) lava++;
    // Laid along axis 0, so the whole snake is in the first panel.
    if (g.body.some((p) => p.some((v, d) => d > 1 && v !== g.head[d]))) offPanel++;
  }
  eq('every move the first panel offers is safe, over 300 seeds', bad, 0);
  eq('no snake starts in lava', lava, 0);
  eq('the opening snake lies in the first panel', offPanel, 0);
}

console.log('\napples');
{
  // Dense lava: one slab pinned along a single axis is a fifth of the space.
  const g = new Snake50({ seed: 11, lavaCount: 4, lavaPins: [2] });
  let bad = 0;
  for (let i = 0; i < 200; i++) {
    const a = g.placeApple();
    if (!a || g.isLava(a) || g.occupied(a)) bad++;
  }
  eq('two hundred apples, none in lava or snake', bad, 0);
}

console.log('\nmoving in fifty dimensions');
{
  const body = [cell({ 0: 3 }), cell({ 0: 2 }), cell({ 0: 1 })];
  const g = board(body);
  const plan = g.move(unit(37, 1));
  eq('a step along axis 37 moves', plan.kind, 'move');
  eq('the head is one along axis 37', g.head[37], 3);
  eq('and nowhere else', g.head.filter((v, d) => v !== cell({ 0: 3 })[d]).length, 1);
  eq('pressing back into the neck is refused', g.move(unit(37, -1)).kind, 'reversal');
}
{
  const g = board([cell({ 49: 4 }), cell({ 49: 3 })]);
  g.move(unit(49, 1));
  ok('the wall at the end of axis 50 ends the run',
     g.over && g.cause === CAUSE.WALL);
}
{
  // A slab pinned at axis 20 = 3, axis 41 in {2, 3}. The head is level with it
  // on axis 41, so a step up axis 20 lands inside.
  const size = Array(D).fill(5), origin = Array(D).fill(0);
  size[20] = 1; origin[20] = 3;
  size[41] = 2; origin[41] = 2;
  const g = board([cell(), cell({ 0: 1 })], { lava: [{ origin, size }] });
  eq('the slab is one step up axis 20', g.plan(unit(20, 1)).cause, CAUSE.LAVA);
  ok('but not up axis 19', g.plan(unit(19, 1)).kind === 'move');
}
{
  const apple = cell({ 13: 3 });
  const g = board([cell(), cell({ 0: 1 })], { apple });
  const plan = g.move(unit(13, 1));
  ok('eating an apple scores', plan.eats && g.score === 10);
  ok('and places another off the snake', !!g.apple && !g.occupied(g.apple));
  g.move(unit(14, 1));
  g.move(unit(14, 1));
  eq('and grows two over the next two turns', g.length, 4);
  ok('the new apple is a real cell', g.apple.length === D && !cellEq(g.apple, apple));
}

console.log('\nlava reshuffles on every apple');
{
  // A long snake coiled through the first panel, with an apple one step ahead.
  let body = [];
  for (let y = 4; y >= 0; y--) {
    for (let x = 0; x < 5; x++) body.push(cell({ 0: y % 2 ? 4 - x : x, 1: y }));
  }
  body = body.reverse().slice(0, 24);
  const head = body[0];
  let onBody = 0, appleInLava = 0, unchanged = 0, kept = 0;
  for (let s = 0; s < 200; s++) {
    const g = new Snake50({ seed: s });
    g.body = body.map((p) => p.slice());
    g.pending = 0;
    g.over = false;
    // Up axis 3 from the head, which nothing occupies.
    g.apple = head.map((v, d) => (d === 2 ? v + 1 : v));
    g.lava = [];
    const before = JSON.stringify(g.lava);
    g.move(unit(2, 1));
    if (JSON.stringify(g.lava) === before) unchanged++;
    if (g.body.some((p) => g.isLava(p))) onBody++;
    if (!g.apple || g.isLava(g.apple)) appleInLava++;
    kept += g.lava.length;
  }
  eq('every eat draws new lava', unchanged, 0);
  eq('no slab ever lands on the snake', onBody, 0);
  eq('the new apple is never in lava', appleInLava, 0);
  ok('and the full sixteen nearly always fit round a 24-cell snake',
     kept / 200 > 15.5, `mean ${kept / 200}`);
}
{
  const g = new Snake50({ seed: 4 });
  const before = JSON.stringify(g.lava);
  const plan = g.move(g.plan(unit(0, 1)).kind === 'move' ? unit(0, 1) : unit(1, 1));
  ok('an ordinary move leaves the lava where it was',
     plan.eats || JSON.stringify(g.lava) === before);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
