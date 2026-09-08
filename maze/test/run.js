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
import { generate, prune, pruneWLeaves, stats, distances, diameter, components,
  Maze, DEFAULTS } from '../src/maze.js';
import { jointRadius, needsJoint, junctionKind, axesAt }
  from '../../shared/junction.js';
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

// ---------------------------------------------------------------------------
// Junctions: the shape of a place where passages meet.
//
// Unknot draws a path, so it never joints more than two segments. A maze is a
// graph and can meet four at a cell, which is what these are about.
// ---------------------------------------------------------------------------
console.log('\njunction: the shape where passages meet');

{
  const T = 0.115;
  ok('a straight run gets a joint no wider than the tube',
     jointRadius(T, 1) === T, `${jointRadius(T, 1)}`);
  ok('a bend gets one that reaches the seam',
     Math.abs(jointRadius(T, 2) - T * Math.SQRT2) < 1e-12);
  ok('three passages want the same radius as two',
     jointRadius(T, 3) === jointRadius(T, 2));
  ok('and so do four',
     jointRadius(T, 4) === jointRadius(T, 2));
  ok('a Set of axes is accepted as well as a count',
     jointRadius(T, new Set([0, 1, 2])) === jointRadius(T, 3));

  // The check that caught the formula being wrong.
  //
  // The seam between tube surfaces is at r*sqrt(2) however many tubes meet --
  // NOT r*sqrt(3) for three, which is the intuitive answer and the one that was
  // written here first. (r,r,r) is not on any tube's surface: it stands
  // r*sqrt(2) from each axis, which is outside a tube of radius r. So it is a
  // point in space past the corner rather than a corner.
  //
  // Rather than trust that argument -- the first one was just as convincing --
  // this measures the union of tubes directly and finds its furthest point near
  // the vertex.
  const inTube = (p, ax) => {
    let s = 0;
    for (let i = 0; i < 3; i++) if (i !== ax) s += p[i] * p[i];
    return Math.sqrt(s) <= T;
  };
  const furthestSeam = (axes) => {
    let worst = 0;
    const N = 90, lim = T * 2;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        for (let k = 0; k <= N; k++) {
          const p = [-lim + 2 * lim * i / N, -lim + 2 * lim * j / N,
                     -lim + 2 * lim * k / N];
          // Only the neighbourhood of the vertex: further along a tube is the
          // tube's own length, which no joint is meant to cover.
          if (!axes.every((a) => Math.abs(p[a]) <= T)) continue;
          if (!axes.some((a) => inTube(p, a))) continue;
          worst = Math.max(worst, Math.hypot(...p));
        }
      }
    }
    return worst;
  };
  for (const axes of [[0, 1], [0, 1, 2]]) {
    const seam = furthestSeam(axes);
    const r = jointRadius(T, axes.length);
    ok(`the joint covers the seam where ${axes.length} tubes meet`,
       r + 0.004 >= seam, `seam ${seam.toFixed(4)}, joint ${r.toFixed(4)}`);
  }
  // And it must not swallow the passages it joins: a sphere reaching the
  // neighbouring cell would close the maze up into blobs.
  ok('the joint stays well inside its own cell', jointRadius(T, 4) < 0.5,
     `${jointRadius(T, 4)}`);

  // The view draws a junction's joint larger than the geometry needs, to mark
  // it. How much larger is a judgement, but there is a limit that is not: a
  // mark wider than the gap between two cells touches its neighbours, and the
  // maze stops reading as passages and starts reading as a heap of beads. It
  // was first drawn at 1.9x, which did exactly that.
  const MARK = 1.25;
  ok('a junction mark stays smaller than the gap it sits in',
     jointRadius(T, 3) * MARK < 0.5,
     `${(jointRadius(T, 3) * MARK).toFixed(3)} against a half-cell of 0.5`);
  ok('a junction mark is still wider than the passage it interrupts',
     jointRadius(T, 3) * MARK > T,
     'a mark no wider than the tube would not be a mark');
}

{
  ok('a cell the passage runs straight through needs no joint',
     needsJoint(2, 1) === false);
  ok('a bend needs one', needsJoint(2, 2) === true);
  ok('a dead end is capped', needsJoint(1, 1) === true);
  ok('a three-way needs one', needsJoint(3, 2) === true);
  // Four passages on two axes is a crossing, not a straight run: it has four
  // notches between the arms even though each pair of opposite arms is flush.
  ok('a crossing needs one', needsJoint(4, 2) === true);
  ok('a lone cell is drawn as something', needsJoint(0, 0) === true);
}

{
  ok('a through-cell is named as one', junctionKind(2, 1) === 'through');
  ok('a corner is named as one', junctionKind(2, 2) === 'corner');
  ok('a dead end is named as one', junctionKind(1, 1) === 'end');
  ok('three ways out is a junction', junctionKind(3, 3) === 'junction');
  ok('four ways out is a junction', junctionKind(4, 2) === 'junction');
}

{
  // axesAt reads the axes off the neighbours, which is how the renderer gets
  // the count it feeds to everything above.
  const axisOf = (a, b) => Maze.axisOf(a, b);
  const at = '2,2,2,2';
  const straight = axesAt(['1,2,2,2', '3,2,2,2'], at, axisOf);
  ok('a straight run is one axis', straight.size === 1);
  const corner = axesAt(['1,2,2,2', '2,3,2,2'], at, axisOf);
  ok('a bend is two axes', corner.size === 2);
  const wJunction = axesAt(['1,2,2,2', '2,3,2,2', '2,2,2,3'], at, axisOf);
  ok('a junction into w counts w among its axes',
     wJunction.size === 3 && wJunction.has(3));
}

// ---------------------------------------------------------------------------
// The view's use of shared names.
//
// The renderer imports three.js from a CDN, so it cannot be loaded here and
// none of the drawing can be tested directly. What CAN be checked is that the
// names it reaches for actually exist -- read out of the source as text.
//
// This is here because of a real bug rather than as a formality. The scene's
// background was set from `COLORS.sky`, and there is no `sky` in COLORS: the
// key is `bg`. Reading a missing property gives `undefined`, THREE.Color turns
// `undefined` into WHITE, and the game shipped with a white sky in a family of
// games with dark ones. Nothing threw, nothing logged, and the suite was
// entirely green -- the only evidence was a screenshot looking wrong.
// ---------------------------------------------------------------------------
console.log('\nmaze: the view refers to things that exist');

{
  const fs = await import('node:fs');
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const app = read('../src/app.js');

  // Every COLORS.<key> the view uses must be a key COLORS actually has.
  const declared = read('../../shared/scene.js')
    .match(/export const COLORS = \{([\s\S]*?)\n\}/)[1];
  const have = [...declared.matchAll(/(\w+):/g)].map((m) => m[1]);
  const used = [...new Set([...app.matchAll(/COLORS\.(\w+)/g)].map((m) => m[1]))];
  const missing = used.filter((k) => !have.includes(k));
  ok('every shared colour the view names exists', missing.length === 0,
     `missing ${missing.join(', ')}`);
  ok('the view actually uses the shared palette', used.length > 0);

  // The same check for the game's own copy: a missing string renders as
  // "undefined" on the page, which is just as quiet.
  const copy = await import('../src/copy.js');
  const wanted = [...new Set([...app.matchAll(/\b(HUD|WON|FOURTH|PANELS)\.(\w+)/g)]
    .map((m) => m[1] + '.' + m[2]))];
  const absent = wanted.filter((w) => {
    const [mod, k] = w.split('.');
    return !copy[mod] || !(k in copy[mod]);
  });
  ok('every copy string the view names exists', absent.length === 0,
     `missing ${absent.join(', ')}`);
  ok('the view actually reads its copy file', wanted.length > 3);
}

// ---------------------------------------------------------------------------
// What the slice panels must show.
//
// The panel draws a cross-section and the player steps by it, so the shapes on
// it have to follow the PASSAGES. Two cells side by side with no passage
// between them must be drawn apart -- that gap is the wall -- and two cells a
// passage joins must be drawn as one continuous strand, the way Snake's body
// is drawn on the same panel.
//
// The maze asks for this with `network` rather than `cellFill`, and the
// distinction is what these tests are really guarding. `cellFill` marks
// terrain: cells are grouped into regions and each region drawn as one slab,
// with grouping BY COLOUR. A maze shades every cell by its distance from the
// exit, so no two neighbours ever share a shade and nothing merges -- the first
// attempt at this drew the maze as a field of separate dots however connected
// it actually was, which is the opposite of what the panel is for.
//
// SliceMap builds SVG through the DOM and cannot be loaded here, so what is
// checked is the data the view hands it and the strand structure that implies.
// ---------------------------------------------------------------------------
console.log('\nmaze: what the slice panels must show');

{
  const { maze } = generate({ seed: 5 });
  const joined = (a, b) => maze.neighbours(key(a)).includes(key(b));
  const focus = maze.cells[0].split(',').map(Number);

  // Within one slice: how many neighbouring pairs touch on the panel, and how
  // many of those are really linked.
  const survey = (H, V) => {
    const inSlice = (p) => p.every((c, i) => (i === H || i === V) || c === focus[i]);
    const cells = maze.cells.map((k) => k.split(',').map(Number)).filter(inSlice);
    const ks = new Set(cells.map((p) => key(p)));
    let touch = 0, link = 0, withLink = 0;
    for (const c of cells) {
      let any = false;
      for (const [ax, d] of [[H, 1], [H, -1], [V, 1], [V, -1]]) {
        const n = c.slice();
        n[ax] += d;
        if (!ks.has(key(n))) continue;
        if (d === 1) touch++;                 // count each pair once
        if (joined(c, n)) { if (d === 1) link++; any = true; }
      }
      if (any) withLink++;
    }
    return { cells: cells.length, touch, link, withLink };
  };

  // How connected a plane is depends on WHICH axes it pairs, and the direction
  // matrix makes that vary a lot. Averaged over seeds: x-z is 91% connected,
  // x-y and y-z about 81%, and w-y only 53% -- because w-y pairs the two rarest
  // axes, w at 5% of free choices and y at the lightest spatial weight. The
  // w-y panel really is sparser than the other, and that is the matrix showing
  // through rather than a fault in the drawing.
  //
  // So the bar is low, and it is a bar against DOTS: a panel where nothing
  // joins anything is broken however rare the axes are.
  for (const [H, V, name, floor] of [[3, 1, 'w-y', 0.2], [0, 2, 'x-z', 0.6]]) {
    const s = survey(H, V);
    ok(`cells in the ${name} slice join their neighbours`,
       s.withLink > s.cells * floor,
       `${s.withLink} of ${s.cells} had any link`);
    // And it must draw walls: some touching pairs are not linked, so a panel
    // that joined everything it touched would be inventing routes.
    ok(`the ${name} slice has touching cells that are NOT linked`,
       s.touch > s.link,
       `${s.touch} touching, ${s.link} linked -- nothing to distinguish`);
  }

  // The predicate itself, which is what the panel is actually given.
  const a = maze.cells.find((k) => maze.degree(k) >= 1);
  const b = maze.neighbours(a)[0];
  ok('joined says yes to a real passage',
     joined(a.split(',').map(Number), b.split(',').map(Number)));

  const p = a.split(',').map(Number);
  let sawWall = false;
  for (let ax = 0; ax < DEFAULTS.dims.length && !sawWall; ax++) {
    for (const d of [1, -1]) {
      const q = p.slice();
      q[ax] += d;
      if (q[ax] < 0 || q[ax] >= DEFAULTS.dims[ax]) continue;
      if (!maze.has(key(q)) || joined(p, q)) continue;
      sawWall = true;
      break;
    }
  }
  ok('joined says no to two cells with a wall between them', sawWall);

  // --- junctions on the panel ---------------------------------------------
  //
  // A cell where three or four passages meet has to be drawn as one shape with
  // three or four arms. The panel builds it per cell -- each cell reaching
  // toward every neighbour it is linked to -- so a junction is not a special
  // case in the drawing code, but it is the case most likely to be wrong: a
  // corridor still looks right if reaching only works one way along an axis,
  // and a T does not.
  //
  // This replays that geometry: reach by the inset toward each linked
  // neighbour, then check that linked cells' rectangles actually meet and
  // unlinked ones do not.
  {
    const CELL = 30, INSET = CELL * 0.16;
    const px = (h) => h * CELL;
    const py = (v, flip, ny) => (flip ? v : ny - 1 - v) * CELL;

    const meet = (a, b) => a.x0 < b.x1 + 0.01 && b.x0 < a.x1 + 0.01 &&
                           a.y0 < b.y1 + 0.01 && b.y0 < a.y1 + 0.01;

    let linked = 0, linkedMeet = 0, apart = 0, apartMeet = 0;
    let threeWay = 0, fourWay = 0;
    // Enough slices to be sure of meeting a four-way crossing. They are rare --
    // a cell needs four passages AND all four in the one plane -- so a small
    // sample finds three-ways and misses crossings entirely, which would leave
    // the hardest case silently unchecked.
    for (let sd = 0; sd < 25; sd++) {
      const m = generate({ seed: sd }).maze;
      const jn = (a, b) => m.neighbours(key(a)).includes(key(b));
      for (const start of m.cells.slice(0, 40)) {
        const f = start.split(',').map(Number);
        for (const [H, V, flip] of [[0, 2, true], [3, 1, false]]) {
          const ny = DEFAULTS.dims[V];
          const inSlice = (q) => q.every((c, i) => (i === H || i === V) || c === f[i]);
          const cells = m.cells.map((k) => k.split(',').map(Number)).filter(inSlice);
          const rf = (p) => {
            let x0 = px(p[H]) + INSET, y0 = py(p[V], flip, ny) + INSET;
            let x1 = px(p[H]) + CELL - INSET, y1 = py(p[V], flip, ny) + CELL - INSET;
            let arms = 0;
            for (const [dh, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const q = p.slice();
              q[H] += dh; q[V] += dv;
              if (!inSlice(q) || !m.has(key(q)) || !jn(p, q)) continue;
              arms++;
              if (dh === 1) x1 += INSET;
              else if (dh === -1) x0 -= INSET;
              else if (py(q[V], flip, ny) < py(p[V], flip, ny)) y0 -= INSET;
              else y1 += INSET;
            }
            return { x0, y0, x1, y1, arms };
          };
          for (const a of cells) {
            const ra = rf(a);
            if (ra.arms === 3) threeWay++;
            if (ra.arms === 4) fourWay++;
            for (const [dh, dv] of [[1, 0], [0, 1]]) {
              const b = a.slice();
              b[H] += dh; b[V] += dv;
              if (!inSlice(b) || !m.has(key(b))) continue;
              const rb = rf(b);
              if (jn(a, b)) { linked++; if (meet(ra, rb)) linkedMeet++; }
              else { apart++; if (meet(ra, rb)) apartMeet++; }
            }
          }
        }
      }
    }
    ok('every linked pair is drawn meeting', linked === linkedMeet,
       `${linkedMeet} of ${linked}`);
    ok('no unlinked pair is drawn meeting', apartMeet === 0,
       `${apartMeet} of ${apart} wrongly met`);
    // The junction cases have to actually occur, or the two checks above are
    // only testing corridors.
    ok('three-way junctions occur on a panel and were checked', threeWay > 0,
       `${threeWay} found`);
    ok('four-way crossings occur on a panel and were checked', fourWay > 0,
       `${fourWay} found`);
  }

  // The colour ramp is what broke the first attempt: it gives neighbours
  // different shades, so any drawing that merges cells BY COLOUR draws a maze
  // of separate dots. Nothing may depend on two linked cells matching.
  const dist = distances(maze, maze.cells[0]);
  let differing = 0, pairs = 0;
  for (const [x, y] of maze.edges()) {
    if (!dist.has(x) || !dist.has(y)) continue;
    pairs++;
    if (dist.get(x) !== dist.get(y)) differing++;
  }
  ok('linked cells almost never share a distance, so colour cannot group them',
     pairs > 0 && differing === pairs,
     `${differing} of ${pairs} pairs differ`);
}


console.log('\nmaze: dead ends through the fourth dimension');
{
  // A dead end reached by a w-step is the one move the maze must never offer:
  // the panel draws it as an arrow out of the slice, so it cannot be seen to
  // be a dead end until the step has been spent. See pruneWLeaves in the model.
  const wLeaves = (maze) => maze.cells.filter((k) =>
    maze.degree(k) === 1 && Maze.axisOf(k, maze.neighbours(k)[0]) === DEFAULTS.wAxis);

  let found = 0;
  for (const { maze } of batch) found += wLeaves(maze).length;
  ok('no maze offers a blind step out of the slice', found === 0,
     `${found} across ${SEEDS} mazes`);

  // And the generator really is producing them to be cut -- otherwise the test
  // above passes by describing a case that never arises, which is the way a
  // rule like this quietly stops being enforced.
  let before = 0;
  for (let s = 0; s < SEEDS; s++) {
    before += wLeaves(generate({ seed: s, pruneWLeaves: false }).maze).length;
  }
  ok('and they exist to be cut', before > 0, `${before} before pruning`);
}
{
  // "By one" is the rule: the leaf goes, the corridor behind it stays. A single
  // w-step off a run of ordinary corridor should cost exactly one cell.
  const m = new Maze([5, 5, 5, 5]);
  m.link('0,0,0,0', '1,0,0,0');
  m.link('1,0,0,0', '2,0,0,0');
  m.link('2,0,0,0', '3,0,0,0');
  m.link('1,0,0,0', '1,0,0,1');       // the blind step out of the slice
  pruneWLeaves(m, 3);
  ok('the blind cell goes', !m.has('1,0,0,1'));
  ok('and nothing else does', m.size === 4);
  ok('the cell it hung off keeps its own passages',
     m.degree('1,0,0,0') === 2);
}
{
  // A chain of them unwinds one cell at a time, because cutting a leaf can
  // expose the next -- which is why this repeats rather than making one pass.
  const m = new Maze([5, 5, 5, 5]);
  m.link('0,0,0,0', '1,0,0,0');
  m.link('1,0,0,0', '1,0,0,1');
  m.link('1,0,0,1', '1,0,0,2');
  m.link('1,0,0,2', '1,0,0,3');
  pruneWLeaves(m, 3);
  ok('a whole tail of w-steps unwinds', m.size === 2, `left ${m.size}`);
  ok('down to the cells reachable without one',
     m.has('0,0,0,0') && m.has('1,0,0,0'));
}
{
  // A w-step that is NOT a dead end is left alone. The rule is about blind
  // steps, not about w -- cutting real routes through the fourth dimension
  // would take away the thing the game is for.
  // The w-step is in the MIDDLE here, with ordinary corridor either side, so
  // neither of its cells is a leaf and the crossing is a real route.
  const m = new Maze([5, 5, 5, 5]);
  m.link('0,0,0,0', '1,0,0,0');
  m.link('1,0,0,0', '1,0,0,1');       // the crossing
  m.link('1,0,0,1', '2,0,0,1');
  pruneWLeaves(m, 3);
  ok('a w-step leading somewhere survives',
     m.size === 4 && m.neighbours('1,0,0,0').includes('1,0,0,1'));

  // Even when it is the only way on: a leaf here is '0,0,0,0', whose one
  // passage runs along w -- and cutting it would be cutting the corridor's end
  // rather than a stub off it. It goes, and the route beyond it does not.
  const m2 = new Maze([5, 5, 5, 5]);
  m2.link('0,0,0,0', '0,0,0,1');
  m2.link('0,0,0,1', '1,0,0,1');
  pruneWLeaves(m2, 3);
  ok('but a leaf is a leaf however the corridor runs',
     !m2.has('0,0,0,0') && m2.has('1,0,0,1'));
}
{
  // The degenerate board: everything joined along w only. Every end is a
  // w-leaf, so an unguarded rule eats the entire maze. It stops at one cell.
  const m = new Maze([2, 2, 2, 5]);
  for (let w = 0; w < 4; w++) m.link(`0,0,0,${w}`, `0,0,0,${w + 1}`);
  pruneWLeaves(m, 3);
  ok('an all-w corridor is not erased entirely', m.size === 1);

  // And a board with no fourth axis at all has nothing to do here.
  const flat = new Maze([5, 5, 5]);
  flat.link('0,0,0', '1,0,0');
  pruneWLeaves(flat, -1);
  ok('a board with no w axis is left alone', flat.size === 2);
}
{
  // What it costs. The point of measuring is that the cut must not change the
  // maze it is cleaning up: if pruning shortened the longest route, or split
  // the board, it would be buying readability with the game.
  const on = [], off = [];
  for (let s = 0; s < SEEDS; s++) {
    on.push(generate({ seed: s }).maze);
    off.push(generate({ seed: s, pruneWLeaves: false }).maze);
  }
  const mean = (a, f) => a.reduce((t, m) => t + f(m), 0) / a.length;
  const lost = mean(off, (m) => m.size) - mean(on, (m) => m.size);
  ok('it costs a handful of cells per maze', lost > 0 && lost < 20,
     `${lost.toFixed(1)} cells`);
  near('and leaves the longest route where it was',
       mean(on, (m) => diameter(m).length),
       mean(off, (m) => diameter(m).length), 4, ' cells');
  ok('the maze stays in one piece',
     on.every((m) => components(m).length === 1));
}


{
  // The rings on the panel: cells with a way OFF it.
  //
  // A panel is a cross-section, so a passage along either of the two axes it
  // pins has nowhere to go on it. The cell is drawn as plain strand -- or as a
  // strand that simply stops -- and nothing says a way out was standing there.
  // That is the one thing a flat map of a 4D maze cannot show and most needs
  // to, so it is marked.
  //
  // Marking BRANCHING was the first attempt and marked the wrong thing: a cell
  // with three passages is a junction, the room already paints it yellow, and
  // ringing it here only repeated on the map what the territory made plain.
  // Most cells with a way off the panel are not junctions at all.
  const { maze } = generate({ seed: 5 });
  const focus = maze.cells[0].split(',').map(Number);
  const panel = (H, V) => {
    const inSlice = (p) => p.every((c, i) => (i === H || i === V) || c === focus[i]);
    const drawn = maze.cells.filter((k) => inSlice(k.split(',').map(Number)));
    const ringed = drawn.filter((k) =>
      maze.neighbours(k).some((n) => !inSlice(n.split(',').map(Number))));
    return { inSlice, drawn, ringed };
  };

  const xz = panel(0, 2);
  ok('the x-z panel has cells with a way off it', xz.ringed.length > 0,
     `${xz.ringed.length} of ${xz.drawn.length}`);
  // And it must be selective there, or the mark says nothing. This is the
  // panel that pairs the two heaviest axes, so most of its passages are ones
  // it can draw.
  ok('but not all of them -- the mark distinguishes', xz.ringed.length < xz.drawn.length,
     `${xz.ringed.length} of ${xz.drawn.length} ringed`);

  // The mark is NOT the room's junction rule. Most ringed cells have exactly
  // two passages, which is what makes this worth drawing separately: the room
  // has nothing to say about them.
  const plain = xz.ringed.filter((k) => maze.degree(k) === 2);
  ok('and most ringed cells are not junctions at all', plain.length > 0,
     `${plain.length} of ${xz.ringed.length} ringed have degree 2`);

  // The other direction: a junction whose passages all lie on the panel is not
  // ringed, because there is nothing hidden about it.
  const openJunctions = xz.drawn.filter((k) =>
    maze.degree(k) >= 3 && !xz.ringed.includes(k));
  ok('a junction fully drawn on the panel needs no ring',
     openJunctions.every((k) =>
       maze.neighbours(k).every((n) => xz.inSlice(n.split(',').map(Number)))));
}
{
  // The w-y panel pairs the two RAREST axes -- w at 5% of free choices, y at
  // the lightest spatial weight -- so nearly every cell on it has a passage it
  // cannot draw. The mark is close to universal there.
  //
  // That is the matrix showing through rather than a fault: the panel really
  // does hide almost everything, and a mark that appears almost everywhere on
  // it is telling the truth. Asserted so the number is written down and a
  // change to the weights that moves it has to be looked at.
  const focus0 = (maze) => maze.cells[0].split(',').map(Number);
  let ringed = 0, drawn = 0;
  for (const { maze } of batch) {
    const focus = focus0(maze);
    const inSlice = (p) => p.every((c, i) => (i === 3 || i === 1) || c === focus[i]);
    for (const k of maze.cells) {
      const p = k.split(',').map(Number);
      if (!inSlice(p)) continue;
      drawn++;
      if (maze.neighbours(k).some((n) => !inSlice(n.split(',').map(Number)))) ringed++;
    }
  }
  const share = ringed / drawn;
  near('nearly every cell on the w-y panel has a way off it', share, 0.92, 0.06);
}
{
  // Isolated cells are drawn as a dot, not a lone rounded square.
  //
  // A cell with no neighbour the panel can draw has no strand to be part of.
  // Drawn as a square it claimed a length of corridor that is not there, and
  // since every such cell also has a way off the panel it wore a ring as well
  // -- two marks, one of them wrong, saying the one thing the other said.
  //
  // The whole rule rests on "every isolated cell has a way off", so that is
  // asserted rather than assumed: it follows from the generator only because a
  // cell with no passage at all is not in the maze, and a cell whose every
  // passage leaves the panel is exactly what an isolated cell is.
  let isolated = 0, stranded = 0, drawn = 0;
  for (const { maze } of batch) {
    const focus = maze.cells[0].split(',').map(Number);
    for (const [H, V] of [[3, 1], [0, 2]]) {
      const inSlice = (p) => p.every((c, i) => (i === H || i === V) || c === focus[i]);
      for (const k of maze.cells) {
        const p = k.split(',').map(Number);
        if (!inSlice(p)) continue;
        drawn++;
        const onPanel = maze.neighbours(k).some((n) => {
          const q = n.split(',').map(Number);
          return inSlice(q) && Math.abs(q[H] - p[H]) + Math.abs(q[V] - p[V]) === 1;
        });
        if (onPanel) continue;
        isolated++;
        // No neighbour on the panel, so every passage it has leaves -- unless
        // it has none, which would be a cell the maze never joined to anything.
        if (!maze.neighbours(k).some((n) => !inSlice(n.split(',').map(Number)))) {
          stranded++;
        }
      }
    }
  }
  ok('panels carry isolated cells, so the case is real', isolated > 0,
     `${isolated} of ${drawn} drawn cells`);
  ok('and every one of them has a way off the panel', stranded === 0,
     `${stranded} isolated cells with no passage at all`);
  // If this were rare the dot would not be worth a branch. It is not rare.
  ok('they are common enough to matter', isolated > drawn * 0.1,
     `${(100 * isolated / drawn).toFixed(0)}% of drawn cells`);
}

console.log('\nmaze: every cell is drawn as something');
{
  // A cell must be visible as EITHER a ball or a length of rope. The one way
  // to be neither is to have no rope and no ball, and that is what the middle
  // of a straight run of w-moves was: needsJoint asks whether two cylinders may
  // meet flush without a ball over the seam, and answered "yes, straight
  // through" for a cell whose two passages were both arrows -- so no ball was
  // drawn, and no cylinders existed to meet. A bare point with two arrows
  // aiming at it.
  //
  // This is the view's rule, restated: a cell is left bare only when the rope's
  // own rule says so AND every passage there is rope.
  const W = DEFAULTS.wAxis;
  const bare = (maze, k) => {
    const rope = maze.neighbours(k).filter((n) => Maze.axisOf(k, n) !== W);
    return maze.degree(k) === rope.length &&
           !needsJoint(rope.length, axesAt(rope, k, Maze.axisOf));
  };

  let invisible = 0, runs = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      const rope = maze.neighbours(k).filter((n) => Maze.axisOf(k, n) !== W);
      // A cell with no rope at all: whatever else is true, it must get a ball.
      if (rope.length === 0) {
        runs++;
        if (bare(maze, k)) invisible++;
      }
    }
  }
  ok('straight runs of w-moves occur, so the case is real', runs > 0,
     `${runs} cells whose every passage steps in w`);
  ok('and none of them is drawn as nothing', invisible === 0,
     `${invisible} cells with neither ball nor rope`);

  // The old rule really did lose them -- otherwise the test above passes
  // against a bug that was never there.
  let lostBefore = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      if (maze.neighbours(k).some((n) => Maze.axisOf(k, n) !== W)) continue;
      if (!needsJoint(maze.degree(k), axesAt(maze.neighbours(k), k, Maze.axisOf))) {
        lostBefore++;
      }
    }
  }
  ok('the rope-only rule would have lost them', lostBefore > 0,
     `${lostBefore} would have gone unmarked`);
}
{
  // And the other half: a w-step branching off a straight corridor is a
  // junction, and keeps its ball. Asking needsJoint about the rope ALONE would
  // see a corridor running straight through and drop it, hiding the choice.
  const W = DEFAULTS.wAxis;
  let branchings = 0, kept = 0;
  for (const { maze } of batch) {
    for (const k of maze.cells) {
      const rope = maze.neighbours(k).filter((n) => Maze.axisOf(k, n) !== W);
      // Rope straight through, plus at least one way out through w.
      if (rope.length !== 2 || maze.degree(k) === rope.length) continue;
      if (axesAt(rope, k, Maze.axisOf).size !== 1) continue;
      branchings++;
      const bare = maze.degree(k) === rope.length &&
                   !needsJoint(rope.length, axesAt(rope, k, Maze.axisOf));
      if (!bare) kept++;
      // It is a junction by the rule the room marks junctions with, too.
      if (junctionKind(maze.degree(k),
                       axesAt(maze.neighbours(k), k, Maze.axisOf)) !== 'junction') {
        kept--;
      }
    }
  }
  ok('a w-step off a straight corridor happens', branchings > 0,
     `${branchings} found`);
  ok('and every one keeps its ball, marked as a junction',
     kept === branchings, `${kept} of ${branchings}`);
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
