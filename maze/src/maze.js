// Maze, in as many dimensions as you like.
//
// The model knows nothing about drawing. It builds a graph of lattice cells
// joined by unit steps and hands it over; what a renderer does with that --
// here, draws the passages as rope in unknot's style -- is none of its
// business. Keeping the split lets the generator run under Node in the test
// suite, where the statistics below can actually be measured.
//
// WHAT IS DRAWN IS THE PASSAGES, NOT THE WALLS. That inverts the usual maze:
// there are no walls anywhere in this file, only the edges you may travel
// along. In four dimensions a wall is a solid you would have to see through to
// find your way, whereas a passage is a rope, and a rope reads.
//
// Dimension is not hardcoded: cells are arrays of length D and every rule below
// is written over their length. The weights in DEFAULTS name four axes because
// that is the board the game ships, but nothing here breaks at three or five.

import { key, step, makeRng } from '../../shared/grid.js';

export const DEFAULTS = {
  // Symmetric, like unknot's Trefoil, so the 4D view can be rotated between
  // any pair of axes without one of them being the odd short one.
  dims: [5, 5, 5, 5],

  // ------------------------------------------------------------------------
  // The direction matrix.
  //
  // A weight per axis, applied to whichever directions are still open when a
  // step is chosen. The shape of the maze is almost entirely this table plus
  // `newestBias` below, so both are written out with what they are for.
  //
  // x and z are equal and heaviest; y is lighter, so the maze spreads out more
  // than it climbs. w is a special case, see `axisWeight[3]`.
  // ------------------------------------------------------------------------
  axisWeight: [1.0, 0.6, 1.0, 0.137],

  // Why 0.137 and not 0.05, when the brief was "5% of the time".
  //
  // The brief is a share of CHOICES, and these are weights. With all eight
  // directions open, w's share of the draw is w/(1 + 0.6 + 1 + w), and
  // 0.137/2.737 is 5.0%. Setting the weight itself to 0.05 would give 1.8%,
  // which is a different instruction.
  //
  // The realised share across a whole maze comes out nearer 10%, and that is
  // not a bug in the weight. Against a wall the spatial options are gone and w
  // is taken because it is the only thing left, not because it was chosen --
  // and "when it has a choice" is exactly the case the weight governs. The
  // suite measures both numbers separately for that reason.
  //
  // The weight alone is not enough to hold that 5%, because inertia moves the
  // target underneath it: a free step mid-corridor has the continuing axis
  // multiplied to 3, so w competes against 4.6 rather than 2.6 and its share
  // falls to 2.9%. Weighting for one case breaks the other -- 0.137 is right
  // only with inertia off, 0.242 only with it on. Rather than split the
  // difference and be wrong in both, `wShare` below fixes the share directly
  // and lets the weight follow from whatever else is on the table.

  // Inertia: a step continuing the previous axis AND sign is multiplied by
  // this. It is what makes the passages run in straight lines long enough to
  // follow with your eye instead of jittering cell by cell.
  //
  // w is deliberately excluded. The other three are directions you can see and
  // keep going in; w is a step sideways out of the visible world, and a fourth
  // dimension that carried inertia would produce long runs through w that the
  // slice view can only show as a stack of disconnected dots.
  inertia: 3,
  inertiaAxes: [true, true, true, false],

  // The share of the draw w gets when every direction is open, held exactly
  // regardless of what inertia is doing to the other axes. When this is set,
  // w's weight is computed per step as a fraction of the spatial weights on the
  // table rather than read from `axisWeight` -- which is what makes "5% of the
  // time when it has a choice" mean 5% and not 2.9%.
  //
  // Set it to null to use the fixed `axisWeight[3]` instead.
  wShare: 0.05,
  wAxis: 3,

  // No vertex may have more than this many passages meeting at it. Four ways
  // out of one cell is already a lot to read in a projection.
  maxDegree: 4,

  // The chance that a passage is abandoned rather than continued, checked each
  // time its end is chosen. This is the sparsity knob, and it matters more than
  // anything else here for whether the map is readable.
  //
  // It is not applied while the frontier is a single cell (see `generate`).
  // Early on that cell is the entire maze, and stopping it stops everything --
  // roughly one seed in thirty came out with a maze of two or three cells
  // before that guard existed.
  //
  // Without it the generator produces a SPANNING maze -- every cell of the grid
  // visited, 583 passages in a 625-cell board -- because that is what a maze
  // normally is. Drawn as walls that is fine. Drawn as rope it is a solid block
  // of noodles with no space to see through, which is the one thing this
  // rendering cannot survive. At 0.2 the board comes out around two thirds
  // full.
  stopProbability: 0.2,

  // How often the growing tree extends its NEWEST passage rather than a random
  // one. This is the choice of algorithm, and it is a dial rather than a switch:
  //
  //   1.0  depth-first (recursive backtracker) -- one enormous snake, diameter
  //        ~519 on a 5^4 board, almost no junctions at all
  //   0.0  Prim-ish -- bushy, shallow, and it hands w far more of the map than
  //        the matrix asks for
  //
  // Breadth-first is the other obvious choice and is worse than either: it
  // fills each shell around the start before moving outward, so the spatial
  // neighbours are all used up by the time the wavefront arrives and w gets
  // taken by exhaustion. Measured share of w edges under BFS is 63%, against a
  // matrix that asks for 5%, and the maze it builds has diameter 25 -- broad,
  // shallow, and nowhere to go.
  //
  // 0.75 keeps the long routes that make a maze worth walking (diameter ~86)
  // while opening up enough junctions for the degree cap to mean something.
  newestBias: 0.75,

  // Dead ends this short are erased after generation, repeatedly, until none
  // are left. A stub of one or two cells is not a decision the player can make,
  // it is a smudge on the map.
  minBranch: 2,

  // And a dead end reached by stepping in w is cut whatever its length, one
  // cell at a time.
  //
  // A stub off a corridor you can see is a decision, however small: you look
  // down it, you see it ends, you carry on. A stub through w is not, because
  // you cannot look down it. The slice view draws a step in w as an arrow --
  // there is no rope to follow with your eye, since the cell is in another
  // frame -- so the player is offered a way out of the slice, spends a move
  // taking it, and arrives at a cell with nothing but the way back.
  //
  // That is the worst move a maze can offer. It costs a step, it teaches
  // nothing, and it is indistinguishable beforehand from the w-steps that
  // matter, which is what makes it corrosive: it trains the player to
  // distrust the arrows, and the arrows are how the fourth dimension is
  // played.
  //
  // "By one" is the whole rule. Only the leaf itself goes, not the corridor
  // behind it -- what was wrong was the last step being a blind one, and
  // removing that step fixes it. The cell it hung off keeps whatever else it
  // had, and if that leaves a NEW w-leaf behind, the next pass takes that one
  // too, one cell at a time. See pruneWLeaves.
  pruneWLeaves: true,

  // The smallest maze worth playing, as a fraction of the board. Growth is
  // random and occasionally dies young: every live passage can stop within the
  // same short window while the maze is still a handful of cells, which left
  // about one seed in 140 with a board too small to be a game. Rather than
  // lower `stopProbability` -- which would change the look of every maze to fix
  // a rare one -- generation simply runs again from a derived seed until it
  // clears this bar. See `generate`.
  minFill: 0.25,
  maxAttempts: 20,
};

// Every unit step, tagged with the axis and sign it moves along, because the
// weighting needs both and recomputing them from the vector at every candidate
// is wasted work in the innermost loop of the generator.
function taggedDirs(D) {
  const out = [];
  for (let d = 0; d < D; d++) {
    for (const s of [-1, 1]) {
      const v = Array(D).fill(0);
      v[d] = s;
      out.push({ v, axis: d, sign: s });
    }
  }
  return out;
}

// An undirected graph of cells. Passages are stored once per endpoint, and the
// canonical form of an edge is the pair of keys in sorted order -- which is
// what `edges()` hands out, so a renderer never draws the same passage twice.
export class Maze {
  constructor(dims) {
    this.dims = dims.slice();
    this.adj = new Map();
  }

  get D() { return this.dims.length; }

  get cells() { return [...this.adj.keys()]; }

  get size() { return this.adj.size; }

  has(k) { return this.adj.has(k); }

  neighbours(k) { return this.adj.get(k) || []; }

  degree(k) { return (this.adj.get(k) || []).length; }

  add(k) {
    if (!this.adj.has(k)) this.adj.set(k, []);
  }

  link(a, b) {
    this.add(a); this.add(b);
    if (!this.adj.get(a).includes(b)) this.adj.get(a).push(b);
    if (!this.adj.get(b).includes(a)) this.adj.get(b).push(a);
  }

  // Forget a cell and every passage that reached it.
  drop(k) {
    for (const n of this.adj.get(k) || []) {
      this.adj.set(n, (this.adj.get(n) || []).filter((x) => x !== k));
    }
    this.adj.delete(k);
  }

  // Each passage once, as [a, b] with a < b.
  edges() {
    const out = [];
    for (const [k, ns] of this.adj) {
      for (const n of ns) if (k < n) out.push([k, n]);
    }
    return out;
  }

  // Which axis a passage runs along. Used by the view to decide whether a step
  // is drawn as rope inside a slice or as a link between two of them.
  static axisOf(a, b) {
    const p = a.split(',').map(Number), q = b.split(',').map(Number);
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return i;
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Generation
//
// Growing tree. A frontier of cells that might still sprout a passage; each
// round picks one, weights its open directions by the matrix, and either
// extends it or gives up on it. Which cell gets picked is the whole difference
// between depth-first, breadth-first and everything between -- see newestBias.
// ---------------------------------------------------------------------------

// Build a maze, retrying if growth dies young. The retry reseeds rather than
// resuming, because a maze that stopped at five cells has nothing worth
// keeping -- and a caller passing an explicit seed still gets a deterministic
// result, since the derived seeds are a fixed function of theirs.
export function generate(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const floor = Math.floor(cfg.minFill * cfg.dims.reduce((a, b) => a * b, 1));
  let last = null;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    // A caller supplying its own rng gets one attempt: the rng is theirs, it
    // may not be reseedable, and drawing from it again is not a fresh start.
    const o = cfg.rng
      ? cfg
      : { ...cfg, seed: cfg.seed === undefined ? undefined : cfg.seed + attempt * 7919 };
    last = grow(o);
    if (last.maze.size >= floor) return last;
    if (cfg.rng) return last;
  }
  return last;
}

function grow(cfg) {
  const dims = cfg.dims.slice();
  const D = dims.length;

  // The weights name four axes because that is the board this game ships. In
  // any other number of dimensions the table is the wrong length, and the
  // sensible reading of a missing weight is "an ordinary spatial axis" -- the
  // alternative is `undefined` arithmetic, which produces a NaN weight and an
  // axis that is either never taken or always taken, silently. An axis beyond
  // the fourth gets x's weight and x's inertia.
  const axisWeight = Array.from({ length: D },
    (_, d) => cfg.axisWeight[d] ?? cfg.axisWeight[0]);
  const inertiaAxes = Array.from({ length: D },
    (_, d) => cfg.inertiaAxes[d] ?? true);
  // Likewise the special axis: in fewer dimensions than four there is no w, and
  // the share it was to be held to is simply not applicable.
  const wAxis = cfg.wAxis < D ? cfg.wAxis : -1;
  const rng = cfg.rng || (cfg.seed === undefined ? Math.random : makeRng(cfg.seed));
  const dirs = taggedDirs(D);
  const wrap = Array(D).fill(false);

  const maze = new Maze(dims);
  // Counted separately from the graph so that "how often was w picked when
  // there was a real choice" survives into the stats. It cannot be recovered
  // from the finished maze, because the finished maze does not record which
  // steps were forced.
  const tally = { chosen: Array(D).fill(0), free: Array(D).fill(0), freeSteps: 0 };

  const start = dims.map((n) => Math.floor(rng() * n));
  maze.add(key(start));
  const frontier = [{ cell: start, axis: -1, sign: 0 }];

  while (frontier.length) {
    const idx = rng() < cfg.newestBias
      ? frontier.length - 1
      : Math.floor(rng() * frontier.length);
    const node = frontier[idx];
    const k = key(node.cell);

    // Give up on this passage -- but never on the last one alive, which would
    // end the maze rather than that corridor. A stop is a decision about one
    // branch among several, and with a single cell on the frontier there is no
    // "among several" for it to be about.
    if (frontier.length > 1 && maze.degree(k) >= 1 && rng() < cfg.stopProbability) {
      frontier.splice(idx, 1);
      continue;
    }

    const open = [];
    if (maze.degree(k) < cfg.maxDegree) {
      for (const d of dirs) {
        const np = step(node.cell, d.v, dims, wrap);
        if (!np) continue;
        const nk = key(np);
        if (maze.has(nk)) continue;
        let weight = axisWeight[d.axis];
        if (inertiaAxes[d.axis] && d.axis === node.axis && d.sign === node.sign) {
          weight *= cfg.inertia;
        }
        open.push({ d, np, nk, weight });
      }
    }
    if (!open.length) { frontier.splice(idx, 1); continue; }

    // Hold w to its share of the draw, whatever inertia has done to the rest.
    // Solving share = w/(spatial + w) for w gives the weight that lands it
    // exactly, so the fourth direction stays as rare as it was specified to be
    // rather than as rare as the other weights happen to leave it.
    if (wAxis >= 0 && cfg.wShare !== null && cfg.wShare !== undefined) {
      const spatial = open.reduce((t, c) => c.d.axis === wAxis ? t : t + c.weight, 0);
      const ws = open.filter((c) => c.d.axis === wAxis);
      if (ws.length && spatial > 0) {
        // Split between the two w directions, so the SHARE is the axis's, not
        // each way along it.
        const wTotal = cfg.wShare * spatial / (1 - cfg.wShare);
        for (const c of ws) c.weight = wTotal / ws.length;
      }
    }

    // A free step is one where every axis was still available -- the case the
    // matrix is written for, and the only one where its percentages mean what
    // they say.
    const axesOpen = new Set(open.map((c) => c.d.axis));
    const free = axesOpen.size === D;
    if (free) tally.freeSteps++;

    const total = open.reduce((s, c) => s + c.weight, 0);
    let r = rng() * total;
    let pick = open[open.length - 1];
    for (const c of open) { if ((r -= c.weight) <= 0) { pick = c; break; } }

    tally.chosen[pick.d.axis]++;
    if (free) tally.free[pick.d.axis]++;

    maze.link(k, pick.nk);
    frontier.push({ cell: pick.np, axis: pick.d.axis, sign: pick.d.sign });
  }

  // The two prunes are run to a JOINT fixed point rather than one after the
  // other, because each makes work for the other. Cutting a short stub can
  // leave the cell it hung off a leaf, and that leaf may be reached by a
  // w-step; cutting a w-leaf can leave a stub two cells long where there was a
  // junction. Either prune run alone terminates, but running them in sequence
  // leaves the debris the second one made -- which showed up as short stubs
  // surviving a `minBranch` of 2.
  for (;;) {
    const before = maze.size;
    prune(maze, cfg.minBranch);
    if (cfg.pruneWLeaves) pruneWLeaves(maze, cfg.wAxis);
    if (maze.size === before) break;
  }
  return { maze, tally };
}

// ---------------------------------------------------------------------------
// Pruning
//
// Walk in from every dead end to the first junction; if the corridor collected
// on the way is short enough, erase all of it. Removing a stub can strand the
// junction it hung off -- a three-way with two stubs cut becomes a dead end
// itself -- so this repeats until a pass changes nothing.
// ---------------------------------------------------------------------------

export function prune(maze, minBranch) {
  if (minBranch <= 0) return maze;
  for (;;) {
    // One cut at a time, rescanning after each.
    //
    // Cutting a branch changes the shape around it: a three-way junction with
    // one branch removed becomes a corridor, and a dead end that was measured
    // from that junction is now part of a longer chain running through where
    // the junction was. A pass that cut every branch it had listed at the start
    // would be measuring some of them against a maze that no longer exists, and
    // would leave stubs standing next to junctions it had already dismantled.
    const end = maze.cells.find((k) => maze.degree(k) === 1 &&
                                       chainFrom(maze, k).length <= minBranch);
    if (end === undefined) return maze;
    for (const c of chainFrom(maze, end)) maze.drop(c);
  }
}

// Cut every dead end whose one passage is a step along `axis`, a cell at a time.
//
// The leaf only -- see pruneWLeaves in DEFAULTS for why "by one" is the rule
// rather than a length. Cutting it can expose another, either because the cell
// behind it was a three-way that is now a corridor end, or because that cell is
// itself only reachable through w; so this repeats until a pass finds none,
// exactly as prune() does and for the same reason.
//
// The last cell is never cut. A maze of one cell is not a maze, and a rule
// about which dead ends are worth walking to has nothing to say when there is
// nowhere to walk.
export function pruneWLeaves(maze, axis) {
  if (axis === undefined || axis === null || axis < 0) return maze;
  for (;;) {
    if (maze.size <= 1) return maze;
    const leaf = maze.cells.find((k) => maze.degree(k) === 1 &&
                                        Maze.axisOf(k, maze.neighbours(k)[0]) === axis);
    if (leaf === undefined) return maze;
    maze.drop(leaf);
  }
}

// The dead-end branch reaching back from `end`: every cell up to but not
// including the first junction. A chain with a free end at both ends is a whole
// component rather than a branch off anything, and comes back whole.
function chainFrom(maze, end) {
  const chain = [end];
  let cur = end, prev = null;
  for (;;) {
    const next = maze.neighbours(cur).filter((n) => n !== prev);
    if (next.length !== 1) return chain;      // a junction, or the far end
    prev = cur;
    cur = next[0];
    if (maze.degree(cur) > 2) return chain;   // junction: stop before it
    chain.push(cur);
    if (maze.degree(cur) === 1) return chain; // stranded segment, both ends free
  }
}

// ---------------------------------------------------------------------------
// Reading the finished maze
// ---------------------------------------------------------------------------

// Distances from one cell to every cell it can reach.
export function distances(maze, from) {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const n of maze.neighbours(c)) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(c) + 1);
      queue.push(n);
    }
  }
  return dist;
}

// The two cells furthest apart along the passages, and how far that is. Double
// sweep: the furthest cell from anywhere is an end of some longest path, and
// the furthest cell from THAT is the other end. Exact on a tree; on a maze
// carrying loops it is a lower bound, which is all the callers here need.
export function diameter(maze) {
  if (!maze.size) return { from: null, to: null, length: 0 };
  const first = maze.cells[0];
  const a = furthest(distances(maze, first));
  const b = furthest(distances(maze, a.cell));
  return { from: a.cell, to: b.cell, length: b.dist };
}

function furthest(dist) {
  let cell = null, best = -1;
  for (const [k, d] of dist) if (d > best) { best = d; cell = k; }
  return { cell, dist: best };
}

// The pieces the maze falls into. Pruning can sever one, and a caller that
// wants a maze you can cross needs to know which piece is the real one.
export function components(maze) {
  const seen = new Set();
  const out = [];
  for (const c of maze.cells) {
    if (seen.has(c)) continue;
    const d = distances(maze, c);
    for (const k of d.keys()) seen.add(k);
    out.push([...d.keys()]);
  }
  return out.sort((a, b) => b.length - a.length);
}

// Everything the suite measures and the view might want to show. Kept here
// rather than in the tests because these are the numbers the matrix is tuned
// against, and they should be reproducible outside the suite.
export function stats(maze, tally = null) {
  const edges = maze.edges();
  const byAxis = Array(maze.D).fill(0);
  for (const [a, b] of edges) byAxis[Maze.axisOf(a, b)]++;
  const degrees = new Map();
  for (const k of maze.cells) {
    const d = maze.degree(k);
    degrees.set(d, (degrees.get(d) || 0) + 1);
  }
  const capacity = maze.dims.reduce((a, b) => a * b, 1);
  const out = {
    cells: maze.size,
    capacity,
    fill: maze.size / capacity,
    edges: edges.length,
    edgesByAxis: byAxis,
    degrees,
    maxDegree: Math.max(0, ...[...degrees.keys()]),
    diameter: diameter(maze).length,
    components: components(maze).length,
  };
  if (tally) {
    // The share of w among steps that had every axis to choose from -- the
    // number the matrix is actually written to control.
    out.freeShare = tally.free.map((n) => (tally.freeSteps ? n / tally.freeSteps : 0));
    out.chosenShare = tally.chosen.map((n) => {
      const t = tally.chosen.reduce((a, b) => a + b, 0);
      return t ? n / t : 0;
    });
  }
  return out;
}
