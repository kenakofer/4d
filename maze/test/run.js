// Maze model tests. Run with: npm test
//
// Two kinds of test here. The first kind is the ordinary sort -- a graph
// invariant that must hold for every maze, checked over many seeds.
//
// The second kind is statistical, and it is the reason this file is worth
// reading. The direction matrix is a claim about proportions: w is taken 5% of
// the time when there is a choice, y less often than x and z, passages run
// straight rather than jitter. None of that can be checked on one maze, and all
// of it is easy to break without breaking anything that throws. So the numbers
// are measured over a batch of seeds and asserted against the spec, with the
// tolerance written down. A change to the weights that moves these is meant to
// fail here and be looked at, not to pass quietly.
import { generate, prune, stats, distances, diameter, components, Maze, DEFAULTS }
  from '../src/maze.js';
import { key } from '../../shared/grid.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}
function near(name, got, want, tol, unit = '') {
  ok(name, Math.abs(got - want) <= tol,
     `got ${got.toFixed(3)}${unit} want ${want}±${tol}${unit}`);
}

const SEEDS = 60;
const batch = [];
for (let s = 0; s < SEEDS; s++) batch.push(generate({ seed: s }));

console.log('maze: structure');

// --- every passage is a unit step between cells that exist -----------------
{
  let bad = 0, offGrid = 0, dangling = 0;
  for (const { maze } of batch) {
    for (const [a, b] of maze.edges()) {
      const p = a.split(',').map(Number), q = b.split(',').map(Number);
      let diff = 0;
      for (let i = 0; i < p.length; i++) {
        const d = Math.abs(p[i] - q[i]);
        if (d === 1) diff++;
        else if (d !== 0) diff = 99;
      }
      if (diff !== 1) bad++;
      for (const c of [p, q]) {
        for (let i = 0; i < c.length; i++) {
          if (c[i] < 0 || c[i] >= maze.dims[i]) offGrid++;
        }
      }
      if (!maze.has(a) || !maze.has(b)) dangling++;
    }
  }
  ok('every passage is a unit step along one axis', bad === 0, `${bad} bad`);
  ok('every cell is inside the board', offGrid === 0, `${offGrid} outside`);
  ok('no passage reaches a cell that was removed', dangling === 0, `${dangling} dangling`);
}

// --- adjacency is symmetric ------------------------------------------------
{
  let asym = 0, dup = 0, self = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      const ns = maze.neighbours(k);
      if (new Set(ns).size !== ns.length) dup++;
      if (ns.includes(k)) self++;
      for (const n of ns) if (!maze.neighbours(n).includes(k)) asym++;
    }
  }
  ok('adjacency is symmetric', asym === 0, `${asym} one-way`);
  ok('no passage is recorded twice', dup === 0, `${dup} duplicated`);
  ok('no cell joins itself', self === 0, `${self} loops`);
}

// --- the degree cap --------------------------------------------------------
{
  let over = 0, worst = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      const d = maze.degree(k);
      worst = Math.max(worst, d);
      if (d > DEFAULTS.maxDegree) over++;
    }
  }
  ok(`no vertex exceeds ${DEFAULTS.maxDegree} passages`, over === 0,
     `${over} over, worst ${worst}`);
  // The cap is only meaningful if something actually approaches it. A maze of
  // pure corridors would pass the test above while making it pointless.
  const busy = batch.reduce((t, { maze }) =>
    t + maze.cells.filter((k) => maze.degree(k) >= 3).length, 0) / SEEDS;
  ok('junctions exist for the cap to be about', busy > 10,
     `only ${busy.toFixed(1)} per maze`);
}

// --- the cap is enforced, not merely unmet ---------------------------------
{
  // Squeeze the maze until vertices genuinely want more than two ways out, and
  // check the cap still holds. A small board with no stopping and no w does it.
  let over = 0;
  for (let s = 0; s < 20; s++) {
    const { maze } = generate({
      seed: s, dims: [4, 4, 4, 1], stopProbability: 0, minBranch: 0,
      newestBias: 0, maxDegree: 3, minFill: 0,
    });
    for (const k of maze.cells) if (maze.degree(k) > 3) over++;
  }
  ok('a tighter cap holds under pressure', over === 0, `${over} over`);
}

// --- pruning ---------------------------------------------------------------
{
  let stubs = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      if (maze.degree(k) !== 1) continue;
      // Walk in from the dead end to the first junction.
      let len = 1, cur = k, prev = null;
      for (;;) {
        const next = maze.neighbours(cur).filter((n) => n !== prev);
        if (next.length !== 1) break;
        prev = cur; cur = next[0];
        if (maze.degree(cur) > 2) break;
        len++;
        if (maze.degree(cur) === 1) break;
      }
      // A chain with a dead end at BOTH ends is a whole component, not a
      // branch off something -- pruning leaves those alone, and the
      // connectivity test below is what governs them.
      if (maze.degree(cur) > 2 && len <= DEFAULTS.minBranch) stubs++;
    }
  }
  ok(`no dead-end branch of ${DEFAULTS.minBranch} or fewer survives`, stubs === 0,
     `${stubs} stubs`);
}

// --- pruning, on a shape built by hand -------------------------------------
{
  //  A-B-C-D-E---F---G-H-I     a trunk long enough to survive
  //            |
  //            J               a one-cell stub, must go
  //
  // The arms either side of the junction are four cells each. That matters:
  // an arm of two or fewer is itself a prunable branch, and a shape whose every
  // branch is short prunes down to a corridor rather than to a trunk with a
  // stub removed.
  const m = new Maze([20, 20, 20, 20]);
  const at = (x, y) => key([x, y, 0, 0]);
  const trunk = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((x) => at(x, 0));
  for (let i = 1; i < trunk.length; i++) m.link(trunk[i - 1], trunk[i]);
  m.link(at(4, 0), at(4, 1));
  prune(m, 2);
  ok('a one-cell stub is pruned', !m.has(at(4, 1)));
  ok('the trunk survives pruning', trunk.every((k) => m.has(k)));
  ok('the junction loses its third passage', m.degree(at(4, 0)) === 2);
}

// --- a cut can strand the junction it hung off -----------------------------
{
  //  A---B---C  with two stubs on C. Cutting the first leaves C a corridor
  //  rather than a junction, so the second stub is no longer a branch off
  //  anything -- it is one end of the corridor. Pruning has to re-measure
  //  after every cut to see that, which is why it rescans rather than working
  //  from a list.
  const m = new Maze([9, 9, 9, 9]);
  const at = (x, y, z) => key([x, y, z, 0]);
  m.link(at(0, 0, 0), at(1, 0, 0));
  m.link(at(1, 0, 0), at(2, 0, 0));
  m.link(at(2, 0, 0), at(2, 1, 0));
  m.link(at(2, 0, 0), at(2, 0, 1));
  prune(m, 2);
  ok('cutting a stub re-measures what is left', m.size < 5, `left ${m.size} cells`);
  ok('no dead-end branch survives at a junction',
     m.cells.every((k) => m.degree(k) <= 2), 'a junction still has a stub');
}

// --- a lone corridor is left alone -----------------------------------------
{
  // A chain with a free end at both ends is a whole component, not a branch
  // hanging off something, and pruning is not the rule that governs it.
  // Deleting it would erase a maze rather than tidy one.
  const m = new Maze([20, 20, 20, 20]);
  const at = (x) => key([x, 0, 0, 0]);
  m.link(at(0), at(1));
  m.link(at(1), at(2));
  prune(m, 2);
  ok('a free-standing corridor is not pruned away', m.size === 3, `left ${m.size}`);
}

// --- connectivity ----------------------------------------------------------
{
  const singles = batch.filter(({ maze }) => components(maze).length === 1).length;
  ok('the maze is one connected piece', singles === SEEDS,
     `${SEEDS - singles} of ${SEEDS} came apart`);
}

// --- a maze big enough to be a game ---------------------------------------
{
  const floor = DEFAULTS.minFill * DEFAULTS.dims.reduce((a, b) => a * b, 1);
  const runt = batch.filter(({ maze }) => maze.size < floor).length;
  ok('no maze comes out too small to play', runt === 0,
     `${runt} under ${floor} cells`);
}

// --- determinism -----------------------------------------------------------
{
  const a = generate({ seed: 42 }), b = generate({ seed: 42 });
  ok('the same seed builds the same maze',
     JSON.stringify(a.maze.edges()) === JSON.stringify(b.maze.edges()));
  const c = generate({ seed: 43 });
  ok('a different seed builds a different maze',
     JSON.stringify(a.maze.edges()) !== JSON.stringify(c.maze.edges()));
}

// --- dimension-agnostic ----------------------------------------------------
{
  // The rule from CLAUDE.md, as a test: nothing in the generator may assume
  // there are four axes. These are the same call in 2D, 3D and 5D.
  for (const dims of [[8, 8], [6, 6, 6], [4, 4, 4, 4, 4]]) {
    const { maze } = generate({ seed: 3, dims, minFill: 0.1 });
    const okDim = maze.cells.every((k) => k.split(',').length === dims.length);
    ok(`runs in ${dims.length}D`, maze.size > 0 && okDim, `${maze.size} cells`);
  }

  // A fifth axis has no weight of its own in the table, and must fall back to
  // an ordinary spatial one rather than to `undefined`. The failure this
  // catches is quiet: a NaN weight makes an axis either never chosen or always
  // chosen, and the maze still generates, so nothing else here would notice.
  const { maze } = generate({ seed: 3, dims: [4, 4, 4, 4, 4], minFill: 0.1 });
  const byAxis = [0, 0, 0, 0, 0];
  for (const [a, b] of maze.edges()) byAxis[Maze.axisOf(a, b)]++;
  ok('an unweighted fifth axis behaves like an ordinary one',
     byAxis[4] > byAxis[3] && byAxis[4] < byAxis[0] * 1.5,
     `axes ${JSON.stringify(byAxis)}`);

  // And in fewer than four dimensions there is no w to hold to a share.
  const flat = generate({ seed: 3, dims: [10, 10], minFill: 0.1 });
  ok('a board with no fourth axis still builds', flat.maze.size > 20,
     `${flat.maze.size} cells`);
}

console.log('\nmaze: the direction matrix');

// --- w is taken 5% of the time when there IS a choice -----------------------
{
  let free = 0, freeW = 0;
  for (const { tally } of batch) {
    free += tally.freeSteps;
    freeW += tally.free[3];
  }
  near('w is taken ~5% of the time when every axis is open',
       100 * freeW / free, 5, 1.0, '%');
}

// --- and more often overall, because walls force it ------------------------
{
  let tot = 0, w = 0;
  for (const { tally } of batch) {
    tot += tally.chosen.reduce((a, b) => a + b, 0);
    w += tally.chosen[3];
  }
  const share = 100 * w / tot;
  // Not a target, a fact worth pinning: against a wall w is often the only way
  // out, so its overall share runs at about twice the chosen share. If this
  // moves a lot, the shape of the maze has changed even if the matrix has not.
  ok('w ends up commoner than 5% overall, because walls force it',
     share > 6 && share < 15, `${share.toFixed(1)}%`);
}

// --- y is used less than x and z, which are alike --------------------------
{
  const byAxis = [0, 0, 0, 0];
  for (const { maze } of batch) {
    for (const [a, b] of maze.edges()) byAxis[Maze.axisOf(a, b)]++;
  }
  const tot = byAxis.reduce((a, b) => a + b, 0);
  const pct = byAxis.map((n) => 100 * n / tot);
  ok('y is used less than x', pct[1] < pct[0], `y ${pct[1].toFixed(1)} x ${pct[0].toFixed(1)}`);
  ok('y is used less than z', pct[1] < pct[2], `y ${pct[1].toFixed(1)} z ${pct[2].toFixed(1)}`);
  near('x and z are used about equally', pct[0] - pct[2], 0, 4, '%');
  ok('w is the rarest axis', pct[3] < pct[1], `w ${pct[3].toFixed(1)} y ${pct[1].toFixed(1)}`);
}

// --- inertia makes passages run straight -----------------------------------
{
  // A cell with exactly two passages is either a corner or part of a straight
  // run. Inertia should leave far more of the latter.
  let straight = 0, corner = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      if (maze.degree(k) !== 2) continue;
      const [a, b] = maze.neighbours(k);
      if (Maze.axisOf(k, a) === Maze.axisOf(k, b)) straight++; else corner++;
    }
  }
  const pct = 100 * straight / (straight + corner);
  // The bar is low because the board is small, not because inertia is weak.
  // A 5-cell axis leaves four steps of room while eight directions compete for
  // the next cell, so a passage that keeps going straight runs out of board
  // almost immediately -- on an open 20x20 the same weights give 86% straight,
  // and on this one they give a quarter. What is being checked is that inertia
  // is doing something at all; how much it can do here is set by the geometry.
  ok('passages run straight some of the time', pct > 20,
     `${pct.toFixed(0)}% straight`);

  // And the comparison that shows it is inertia doing it, not the lattice.
  let s2 = 0, c2 = 0;
  for (let s = 0; s < 20; s++) {
    const { maze } = generate({ seed: s, inertia: 1 });
    for (const k of maze.cells) {
      if (maze.degree(k) !== 2) continue;
      const [a, b] = maze.neighbours(k);
      if (Maze.axisOf(k, a) === Maze.axisOf(k, b)) s2++; else c2++;
    }
  }
  const flat = 100 * s2 / (s2 + c2);
  ok('turning inertia off makes them turn more', flat < pct - 3,
     `${flat.toFixed(0)}% straight without, ${pct.toFixed(0)}% with`);

  // The same weights on an open 2D board, where a passage has room to run.
  // This is what says the low figure above is the board's doing and not a bug
  // in how inertia is applied -- if inertia ever stops working, this falls to
  // about 60% while the test above still passes.
  let s3 = 0, c3 = 0;
  for (let s = 0; s < 8; s++) {
    const { maze } = generate({
      seed: s, dims: [20, 20], newestBias: 1, stopProbability: 0,
      minBranch: 0, minFill: 0, inertia: 20,
    });
    for (const k of maze.cells) {
      if (maze.degree(k) !== 2) continue;
      const [a, b] = maze.neighbours(k);
      if (Maze.axisOf(k, a) === Maze.axisOf(k, b)) s3++; else c3++;
    }
  }
  const open = 100 * s3 / (s3 + c3);
  ok('given room, inertia makes long straight runs', open > 75,
     `${open.toFixed(0)}% straight on an open board`);
}

// --- w carries no inertia --------------------------------------------------
{
  // A run of two w steps in a row should be rare: w is a step out of the
  // visible world and is not meant to build corridors.
  let wRuns = 0, wCells = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      if (maze.degree(k) !== 2) continue;
      const [a, b] = maze.neighbours(k);
      const ax = Maze.axisOf(k, a), bx = Maze.axisOf(k, b);
      if (ax === 3 || bx === 3) wCells++;
      if (ax === 3 && bx === 3) wRuns++;
    }
  }
  ok('w rarely runs two steps together', wRuns / Math.max(1, wCells) < 0.15,
     `${wRuns} runs in ${wCells} w cells`);
}

// --- the algorithm is the blend it claims to be ----------------------------
{
  // newestBias 0.75 is chosen for the shape it gives: long routes, but not the
  // single enormous snake that pure depth-first builds. Both ends are checked,
  // so the dial cannot be nudged to either extreme without this failing.
  const mid = batch.reduce((t, { maze }) => t + diameter(maze).length, 0) / SEEDS;
  let dfs = 0, prim = 0;
  for (let s = 0; s < 15; s++) {
    dfs += diameter(generate({ seed: s, newestBias: 1 }).maze).length;
    prim += diameter(generate({ seed: s, newestBias: 0 }).maze).length;
  }
  dfs /= 15; prim /= 15;
  ok('routes are longer than a bushy maze gives', mid > prim * 1.3,
     `${mid.toFixed(0)} vs prim ${prim.toFixed(0)}`);
  ok('routes are shorter than one long snake', mid < dfs * 0.7,
     `${mid.toFixed(0)} vs dfs ${dfs.toFixed(0)}`);
}

// --- the frontier policy changes how much of the maze w gets ---------------
{
  // Why the algorithm is a growing tree biased toward its newest passage, and
  // not breadth-first.
  //
  // BFS fills each shell around the start before moving outward, so by the time
  // the wavefront reaches a cell its spatial neighbours are already taken and w
  // is the only way on -- it gets taken by exhaustion, not by choice, and the
  // matrix stops governing anything. Measured on this board, BFS gives w 63% of
  // the passages against a matrix asking for 5%.
  //
  // The generator has no BFS setting to test that with, deliberately: it is not
  // an option, it is a rejected design. What CAN be checked is the direction of
  // the effect, using the bushy end of the dial that does exist. The more the
  // frontier spreads out rather than driving forward, the more of the maze goes
  // to w.
  const wShareAt = (bias) => {
    let w = 0, tot = 0;
    for (let s = 0; s < 10; s++) {
      const { maze } = generate({ seed: s, newestBias: bias });
      for (const [a, b] of maze.edges()) { tot++; if (Maze.axisOf(a, b) === 3) w++; }
    }
    return 100 * w / tot;
  };
  const bushy = wShareAt(0), chosen = wShareAt(DEFAULTS.newestBias);
  ok('spreading the frontier hands w more of the maze', bushy > chosen,
     `bushy ${bushy.toFixed(0)}% vs ${chosen.toFixed(0)}%`);
  ok('the chosen policy keeps w near what the matrix asks',
     chosen < 15, `${chosen.toFixed(0)}%`);
}

// --- the board is readable, not packed solid -------------------------------
{
  const fill = batch.reduce((t, { maze }) => t + maze.size, 0) / SEEDS
             / DEFAULTS.dims.reduce((a, b) => a * b, 1);
  ok('the board is not filled solid', fill < 0.85, `${(100 * fill).toFixed(0)}% full`);
  ok('the board is not nearly empty', fill > 0.4, `${(100 * fill).toFixed(0)}% full`);

  // Without a stop probability it WOULD be solid -- the contrast that justifies
  // the knob existing.
  let packed = 0;
  for (let s = 0; s < 10; s++) {
    packed += generate({ seed: s, stopProbability: 0, minBranch: 0 }).maze.size;
  }
  packed /= 10 * DEFAULTS.dims.reduce((a, b) => a * b, 1);
  ok('without stopping it would fill the board', packed > 0.9,
     `${(100 * packed).toFixed(0)}% full`);
}

console.log('\nmaze: reading the graph');

// --- distances and diameter ------------------------------------------------
{
  const m = new Maze([9, 9, 9, 9]);
  const at = (x) => key([x, 0, 0, 0]);
  for (let i = 1; i < 6; i++) m.link(at(i - 1), at(i));
  const d = distances(m, at(0));
  ok('distance along a straight run counts steps', d.get(at(5)) === 5, `${d.get(at(5))}`);
  ok('diameter of a straight run is its length', diameter(m).length === 5);
  ok('a lone cell has diameter zero', diameter(new Maze([2, 2])).length === 0);
}

// --- components ------------------------------------------------------------
{
  const m = new Maze([9, 9, 9, 9]);
  const at = (x, y) => key([x, y, 0, 0]);
  m.link(at(0, 0), at(1, 0));
  m.link(at(4, 4), at(5, 4));
  m.link(at(5, 4), at(6, 4));
  const cs = components(m);
  ok('two separate pieces are counted separately', cs.length === 2, `${cs.length}`);
  ok('the biggest piece comes first', cs[0].length === 3, `${cs[0].length}`);
}

// --- axisOf ----------------------------------------------------------------
{
  ok('axisOf names the axis a passage runs along',
     Maze.axisOf('1,1,1,1', '1,1,1,2') === 3 && Maze.axisOf('1,1,1,1', '2,1,1,1') === 0);
}

// --- stats reports what the view needs ------------------------------------
{
  const { maze, tally } = generate({ seed: 5 });
  const st = stats(maze, tally);
  ok('stats counts every passage once',
     st.edges === maze.edges().length && st.edges === maze.size - 1,
     `${st.edges} edges, ${st.size} cells`);
  ok('stats splits passages by axis',
     st.edgesByAxis.reduce((a, b) => a + b, 0) === st.edges);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
