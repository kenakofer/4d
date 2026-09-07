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
// The panel draws a cross-section, and the player uses it to decide where to
// step. So the shapes on it have to follow the PASSAGES, not the grid: two
// cells side by side with no passage between them must be drawn apart, or the
// panel says there is a way through where there is none. That is the one thing
// a maze panel must not get wrong, and it is the default behaviour for terrain
// -- a slab of lava is one region and merging its cells is right -- so the
// maze has to ask for the other rule explicitly.
//
// SliceMap itself cannot be loaded here (it builds SVG through the DOM), so
// what is checked is the rule the view hands it: `joined`, and the count of
// connected pieces it implies.
// ---------------------------------------------------------------------------
console.log('\nmaze: what the slice panels must show');

{
  const { maze } = generate({ seed: 11 });
  const dims = DEFAULTS.dims;
  // The predicate the view gives the panel.
  const joined = (a, b) => maze.neighbours(key(a)).includes(key(b));

  // Pieces within one slice, joined only through passages lying IN that slice.
  const piecesIn = (focus, H, V, useJoined) => {
    const cells = maze.cells.map((k) => k.split(',').map(Number))
      .filter((p) => p.every((c, i) => (i === H || i === V) || c === focus[i]));
    const ks = new Set(cells.map((p) => key(p)));
    const seen = new Set();
    let pieces = 0;
    for (const c of cells) {
      if (seen.has(key(c))) continue;
      pieces++;
      const stack = [c];
      seen.add(key(c));
      while (stack.length) {
        const cur = stack.pop();
        for (const [ax, d] of [[H, 1], [H, -1], [V, 1], [V, -1]]) {
          const n = cur.slice();
          n[ax] += d;
          const nk = key(n);
          if (!ks.has(nk) || seen.has(nk)) continue;
          // The whole difference: by grid adjacency, or by real passages.
          if (useJoined && !joined(cur, n)) continue;
          seen.add(nk);
          stack.push(n);
        }
      }
    }
    return { cells: cells.length, pieces };
  };

  const focus = maze.cells[0].split(',').map(Number);
  let anySplit = false, everMerged = false;
  for (const [H, V] of [[3, 1], [0, 2]]) {
    const real = piecesIn(focus, H, V, true);
    const naive = piecesIn(focus, H, V, false);
    ok(`a panel's shapes follow passages, not the grid (${H}-${V})`,
       real.pieces >= naive.pieces,
       `${real.pieces} by passage vs ${naive.pieces} by adjacency`);
    if (real.pieces > naive.pieces) anySplit = true;
    if (real.cells > real.pieces) everMerged = true;
  }
  ok('drawing by adjacency really would merge things that are not connected',
     anySplit, 'the two rules agreed everywhere, so this proves nothing');
  ok('cells joined by a passage are still drawn as one shape', everMerged,
     'every cell came out separate, which would draw no corridors at all');

  // The predicate itself, which is the thing actually handed to the panel.
  const a = maze.cells.find((k) => maze.degree(k) >= 1);
  const b = maze.neighbours(a)[0];
  ok('joined says yes to a real passage',
     joined(a.split(',').map(Number), b.split(',').map(Number)));
  // A neighbouring cell on the grid that is NOT a passage.
  const p = a.split(',').map(Number);
  let sawWall = false;
  for (let ax = 0; ax < dims.length && !sawWall; ax++) {
    for (const d of [1, -1]) {
      const q = p.slice();
      q[ax] += d;
      if (q[ax] < 0 || q[ax] >= dims[ax]) continue;
      if (!maze.has(key(q))) continue;
      if (joined(p, q)) continue;
      sawWall = true;
      ok('joined says no to two cells with a wall between them', true);
      break;
    }
  }
  ok('a wall between neighbouring cells exists to be tested', sawWall,
     'no such pair found, so the negative case went unchecked');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
