// Marks on the walls of a room, saying where a cell sits along each axis.
//
// A cell floating in a box is three unknowns at once: the eye can see the thing
// but not read its coordinates off, because a point in perspective is
// consistent with a whole line of positions. Flattening it onto the walls
// resolves that -- each wall drops one coordinate, so the marks together are a
// plan and two elevations, which is how a shape in a box is read.
//
// This is the arithmetic only. It is here rather than in a game because unknot
// and the maze both want it and neither should own it, and because the parts
// worth getting right -- which walls face the viewer, where the corners of a
// square on a wall go -- are testable and were wrong at least once each.
//
// Everything is plain arrays, and nothing here knows what a THREE.Vector3 is.

// How far a mark sits off its wall.
//
// Just enough to win the depth test against the frame's own edge lines, and no
// more. This is a nudge, not an inset -- pushed in by any visible amount the
// marks stop looking painted on the wall and start floating in the room, which
// is the one thing they exist not to do.
export const WALL_NUDGE = 0.004;

// Which walls of a box the eye can see the INSIDE of, as {axis, at} pairs.
//
// A wall faces the viewer from inside whenever the eye is on the interior side
// of it: the low wall on an axis shows while the eye is beyond its coordinate,
// the high wall while the eye is short of it. Looking squarely into a corner
// gives three, from a typical angle four, from low down five.
//
// `origin` is the lowest cell centre in the box and `dims` its size in cells,
// so the walls sit half a cell outside the outermost centres -- a cell is a
// unit cube about its centre, and the room's face is the face of the cells at
// its edge.
//
// The set changes as the camera moves, which is the point: marks are only ever
// drawn on walls the player can actually see into. A mark on the far side of a
// wall the eye is outside of would be hidden by that wall, or worse, visible
// through it and read as being somewhere it is not.
export function visibleWalls(eye, origin, dims) {
  const out = [];
  for (let d = 0; d < 3; d++) {
    const lo = origin[d] - 0.5, hi = origin[d] + dims[d] - 0.5;
    if (eye[d] > lo) out.push({ axis: d, at: lo + WALL_NUDGE });
    if (eye[d] < hi) out.push({ axis: d, at: hi - WALL_NUDGE });
  }
  return out;
}

// A square of side 2h on the wall {axis, at}, centred under the point `p`.
//
// Returns six points -- two triangles -- flat, as [x, y, z] triples, ready to
// go straight into a position buffer. The point is flattened onto the wall
// first, so what comes back is where `p` would land if it fell straight onto
// that wall.
//
// The two axes that are not the wall's own are taken in cyclic order, so the
// winding is consistent from wall to wall. It does not matter for a material
// drawn double-sided, and it matters immediately for one that is not.
export function wallSquare(p, axis, at, h) {
  const a = (axis + 1) % 3, b = (axis + 2) % 3;
  const corner = (da, db) => {
    const v = [0, 0, 0];
    v[axis] = at;
    v[a] = p[a] + da;
    v[b] = p[b] + db;
    return v;
  };
  return [
    corner(-h, -h), corner(h, -h), corner(h, h),
    corner(-h, -h), corner(h, h), corner(-h, h),
  ];
}

// Every mark for one cell, across all the walls the eye can see into.
//
// The flat list of vertices a single buffer wants, rather than a square at a
// time: the caller is filling one mesh, and handing back the pieces to be
// concatenated only moves the same loop somewhere less tested.
export function cellMarks(p, eye, origin, dims, h) {
  const out = [];
  for (const { axis, at } of visibleWalls(eye, origin, dims)) {
    for (const v of wallSquare(p, axis, at, h)) out.push(v[0], v[1], v[2]);
  }
  return out;
}
