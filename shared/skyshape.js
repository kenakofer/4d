// Where the stars go, and how bright each one is.
//
// Arithmetic only, with no three.js in it, so the suite can reach it -- sky.js
// draws. The same split as tableshape.js beside table.js and orbshape.js beside
// orbs.js.
//
// A star is a direction and a brightness. There is no distance, because there
// is nothing a distance would do: the sky is drawn on a shell far enough out
// that nothing in the game ever approaches it, so two stars at different radii
// on the same bearing are the same pixel. Giving them radii would be inventing
// a number that no part of the picture reads.

// How the sky is spread.
//
// Stars are scattered uniformly over the SPHERE, not over a patch of it, and
// the reason is worth stating: the camera in these games orbits all the way
// round and tips between about 20 and 60 degrees, so any patch left empty is a
// hole the player can find by looking. A uniform sphere has no such hole.
//
// Uniformity is by the usual trick -- pick z evenly and the azimuth evenly, and
// the band of sphere between any two heights gets its fair share. Picking the
// polar ANGLE evenly instead crowds the poles, which shows up as two bright
// caps directly above and below the board.
export function starDirection(u, v) {
  const z = 2 * u - 1;                       // even in height, not in angle
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const a = 2 * Math.PI * v;
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

// How bright a star is, from a uniform draw.
//
// Biased hard toward the dim end. A sky of evenly bright stars reads as noise --
// a grey dusting with no shape to it -- because the eye finds constellations in
// the CONTRAST between a few bright points and many faint ones. The exponent is
// what buys that: most draws land near the floor and a handful reach the top.
export const DIM = 0.18;
export const BRIGHT = 1.0;
export const FALLOFF = 3.2;
export function starBrightness(u) {
  return DIM + (BRIGHT - DIM) * Math.pow(u, FALLOFF);
}

// How big a star is drawn, relative to its brightness.
//
// Tied together on purpose: a brighter star is a bigger dot as well as a paler
// one. Size alone at constant colour reads as "nearer" rather than "brighter",
// and colour alone leaves the bright ones too easy to miss on a small screen.
// The floor keeps the faintest ones from falling below a pixel and flickering
// as the camera turns.
export const MIN_SIZE = 0.35;
export function starSize(brightness) {
  return MIN_SIZE + (1 - MIN_SIZE) * brightness;
}

// The whole sky, as flat arrays ready to become a geometry.
//
// `rng` is seeded by the caller, so a given game always has the same sky. The
// point of these scenes is that they are somewhere you can come back to, and a
// sky reshuffled on every reload is a different room each time.
export function makeStars(count, rng) {
  const dirs = new Float32Array(count * 3);
  const bright = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = starDirection(rng(), rng());
    dirs[i * 3] = x; dirs[i * 3 + 1] = y; dirs[i * 3 + 2] = z;
    const b = starBrightness(rng());
    bright[i] = b;
    size[i] = starSize(b);
  }
  return { dirs, bright, size, count };
}
