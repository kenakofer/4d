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
