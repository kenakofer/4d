// The shape of a place where passages meet.
//
// Unknot draws a path, so every cell it joints has at most two segments and the
// answer is always the same: a sphere of r*sqrt(2) fills the notch between two
// perpendicular tubes exactly. A maze is a graph, not a path -- three and four
// passages can meet at one cell -- and that single radius stops being right.
//
// This is arithmetic about tubes and spheres, with no three.js in it, so the
// suite can check the radii rather than the renderer having to be looked at.

// How far the exposed corner between a set of tubes sits from the vertex.
//
// The answer is r*sqrt(2), and it does not depend on how many passages meet.
//
// That is worth stating because the obvious guess is wrong. Two perpendicular
// tubes leave a notch whose corner is at (r, r, 0), which is r*sqrt(2) away --
// so it looks as though three mutually perpendicular tubes should leave one at
// (r, r, r) and want r*sqrt(3). They do not: (r, r, r) is not on any of the
// three tube surfaces. Its distance from the x axis is r*sqrt(2), which is
// outside the x tube, and the same for the other two. It is a point in empty
// space beyond the corner, not a corner.
//
// The furthest point of the tube union near the vertex is where two cylinder
// surfaces cross, and that is r*sqrt(2) whether two tubes meet there or four:
// adding a third tube fills part of the gap between the first two, it does not
// push the seam outward. Measured numerically over the union of tubes rather
// than reasoned about, because the reasoning above went wrong the first time.
//
// So the radius is a constant, and `axes` decides only whether a joint is
// wanted at all -- a straight run wants none, and everything else wants this
// one. The parameter is kept so the rule reads as a property of the vertex
// rather than a magic number, and so a future tube of varying radius has
// somewhere to put the dependency.
export function jointRadius(tube, axes) {
  const n = axes instanceof Set ? axes.size : axes;
  // One axis is a straight run or a dead end: a cap flush with the tube, which
  // is the tube's own radius. Anything else has a seam to cover.
  return n <= 1 ? tube : tube * Math.SQRT2;
}

// Which axes the passages at a vertex run along.
export function axesAt(neighbours, at, axisOf) {
  const set = new Set();
  for (const n of neighbours) set.add(axisOf(at, n));
  return set;
}

// Does this vertex need a joint drawn at all?
//
// A cell the rope runs straight through does not: the two segments are
// collinear and meet flush, and a ball there is the lump that makes rope look
// beaded. Anything else does -- a bend, a dead end that needs capping, and
// every junction of three or four.
//
// A crossing of two straight runs (four passages on two axes) is NOT flush:
// the four tubes leave four notches between them, so it wants a joint even
// though no single pair of opposite arms bends.
export function needsJoint(degree, axes) {
  const n = axes instanceof Set ? axes.size : axes;
  if (degree === 0) return true;             // a lone cell, nothing to hide it
  if (degree === 1) return true;             // cap the open end
  if (degree === 2 && n === 1) return false; // straight through: flush
  return true;
}

// How many ways out a vertex has, described for a reader rather than counted.
// The renderer uses this to decide how loudly to mark a junction: a place where
// you must choose is worth seeing from across the room, and a corner is not.
export function junctionKind(degree, axes) {
  const n = axes instanceof Set ? axes.size : axes;
  if (degree <= 1) return 'end';
  if (degree === 2) return n === 1 ? 'through' : 'corner';
  return 'junction';
}

// ---------------------------------------------------------------------------
// Straight runs
//
// A rope is built one cylinder per passage, so a corridor five cells long is
// five cylinders meeting end to end at the four cells between. Those cells have
// no joint -- a straight-through cell is left bare on purpose, because a ball
// there is the beading the joints exist to avoid -- so each of those four seams
// is two cylinder ends touching with nothing over them. For the rope that is
// harmless: the two cylinders are the same colour and the same radius, and the
// seam does not show. For the HALO it is the whole problem, because a back face
// on a shared plane is the nearest halo surface at the seam and paints a ring
// across its neighbour.
//
// overshoot() answers that by making the shells overlap past the seam. This
// answers it by not making the seam at all: consecutive collinear passages are
// welded into one run, and a corridor becomes a single cylinder whose only ends
// are at the two joints that terminate it. There is nothing at the cells in
// between to overlap, to nick, or to band, because nothing is drawn there.
//
// The seams that remain are exactly the cells that DO have a joint, which is
// the one place a seam is already covered -- the ball sits over it.
//
// `edges` are pairs of vertices, `axisOf(a, b)` names the axis a passage runs
// along, and `jointAt(k)` says whether a cell has a ball on it. Vertices are
// compared as keys, so anything a Map can hold will do: this is arithmetic
// about a graph, with no geometry and no dimension count in it.
export function straightRuns(edges, { axisOf, jointAt }) {
  // Every passage, indexed by the cells it touches, so a run can be walked out
  // from one end without searching the whole list again at each step.
  const out = new Map();       // cell -> [{ to, axis }]
  const link = (a, b) => {
    if (!out.has(a)) out.set(a, []);
    out.get(a).push({ to: b, axis: axisOf(a, b) });
  };
  for (const [a, b] of edges) { link(a, b); link(b, a); }

  // A cell is passed THROUGH by a run when it has no joint and exactly one
  // passage carrying on along the same axis. Anywhere else the run stops, which
  // is what puts every run's ends on joints.
  const onward = (k, axis, from) => {
    if (jointAt(k)) return null;
    let next = null;
    for (const e of out.get(k) || []) {
      if (e.axis !== axis || e.to === from) continue;
      if (next !== null) return null;   // two ways on: not a run, whatever it is
      next = e.to;
    }
    return next;
  };

  const seen = new Set();
  const pair = (a, b) => (a < b ? `${a} ${b}` : `${b} ${a}`);

  const runs = [];
  for (const [a, b] of edges) {
    if (seen.has(pair(a, b))) continue;
    const axis = axisOf(a, b);
    seen.add(pair(a, b));
    // Walk to the far end in each direction. A run is symmetric, so it is the
    // same walk twice with the two ends swapped.
    let head = a, prev = b, next;
    while ((next = onward(head, axis, prev)) !== null) {
      seen.add(pair(head, next)); prev = head; head = next;
    }
    let tail = b; prev = a;
    while ((next = onward(tail, axis, prev)) !== null) {
      seen.add(pair(tail, next)); prev = tail; tail = next;
    }
    runs.push({ from: head, to: tail, axis });
  }
  return runs;
}
