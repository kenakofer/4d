import { LEVEL_TEXT } from './copy.js';

// Level definitions. Each level is a starting path in a grid.
//
// The SHAPES live here; the name and blurb the player reads live in copy.js,
// under the `id` each level carries. They are joined below, so a level is still
// one object with a `name` and a `blurb` on it -- adding a level means an entry
// in each file, and the export checks that neither was forgotten.
//
// Every level is played in four dimensions -- a 3D path is lifted to w = 0 as it loads -- so
// they are all solvable; `knotted` marks the ones whose 3D shadow is a real
// knot, which is what makes the fourth direction necessary rather than a
// convenience. The suite checks that claim.
const TREFOIL_3D = [[0,3,4],[1,3,4],[2,3,4],[3,3,4],[4,3,4],[5,3,4],[5,4,4],[6,4,4],[6,4,3],[7,4,3],[7,5,3],[7,5,2],[8,5,2],[8,6,2],[8,6,3],[8,7,3],[8,7,4],[7,7,4],[7,7,5],[6,7,5],[6,7,6],[5,7,6],[5,7,5],[4,7,5],[4,6,5],[4,6,4],[4,5,4],[4,4,4],[4,4,3],[4,3,3],[4,3,2],[4,2,2],[4,2,3],[5,2,3],[5,2,4],[6,2,4],[6,2,5],[6,3,5],[6,3,6],[6,4,6],[6,4,5],[6,5,5],[6,6,5],[6,6,4],[5,6,4],[5,7,4],[5,7,3],[4,7,3],[4,7,2],[3,7,2],[3,7,3],[2,7,3],[2,7,4],[2,6,4],[2,6,5],[3,6,5],[3,5,5],[3,5,6],[4,5,6],[4,4,6],[4,4,5],[5,4,5],[5,5,5],[5,5,6],[6,5,6],[7,5,6],[8,5,6],[9,5,6]];

const LIFT_TREFOIL = TREFOIL_3D.map((p) => [...p, 0]);

const SHAPES = [
  {
    id: 'bump',
    dims: [8, 8, 8],
    path: [[1,1,1],[2,1,1],[2,2,1],[3,2,1],[4,2,1],[4,1,1],[5,1,1],[6,1,1]],
  },
  {
    id: 'bend',
    dims: [10, 10, 10],
    // A long straight run with a detour parked in the middle of it. Walking
    // the bend along the rope brings the slack to where it can be pulled in.
    path: [[1,1,1],[2,1,1],[3,1,1],[3,2,1],[4,2,1],[5,2,1],[5,1,1],
           [6,1,1],[7,1,1],[8,1,1]],
  },
  {
    id: 'staircase',
    dims: [8, 8, 8],
    path: [[1,1,1],[1,1,2],[1,2,2],[2,2,2],[2,2,3],[2,3,3],[3,3,3],
           [3,3,2],[3,2,2],[3,2,1],[4,2,1],[4,1,1],[5,1,1]],
  },
  {
    id: 'tangle',
    dims: [8, 8, 8],
    path: [[1,3,3],[2,3,3],[2,4,3],[2,4,4],[3,4,4],[3,3,4],[4,3,4],[4,3,3],
           [4,2,3],[3,2,3],[3,2,4],[3,2,5],[4,2,5],[5,2,5],[5,3,5],[5,4,5],
           [5,4,4],[5,4,3],[5,5,3],[6,5,3]],
  },
  {
    id: 'trefoil',
    // Symmetric so the 4D view can be rotated between any pair of axes.
    dims: [10, 10, 10, 10],
    // Its 3D shadow is a genuine trefoil, which is why three directions are
    // not enough. Checked by the suite.
    knotted: true,
    // Stuck at 27 steps if the w moves are never used; reaches the taut 13
    // once they are. That gap is the whole demonstration.
    path: LIFT_TREFOIL,
  },
];

// The shape and its words, joined into the one object the game and the tests
// use. A level with no text (or text with no level) is a mistake that would
// otherwise show up as `undefined` on the page, so it throws here instead.
export const LEVELS = SHAPES.map((L) => {
  const text = LEVEL_TEXT[L.id];
  if (!text) throw new Error(`level '${L.id}' has no name or blurb in copy.js`);
  return { ...L, ...text };
});

for (const id of Object.keys(LEVEL_TEXT)) {
  if (!SHAPES.some((L) => L.id === id)) {
    throw new Error(`copy.js describes a level '${id}' that does not exist`);
  }
}
