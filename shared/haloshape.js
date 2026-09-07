// The shape of a joint's halo: which parts of the ball are a halo at all.
//
// A joint is a ball of radius jointR = tube * sqrt(2), because that is what
// fills the notch where two perpendicular tubes meet. Its halo is that ball
// scaled by (1 + HALO), and because sqrt(2) and (1 + HALO) commute, the halo
// ball is exactly the sphere that fills the notch between two SLEEVES. It is
// the right size. That is worth saying plainly, because the first instinct is
// to shrink it, and it cannot shrink: anything smaller stops covering the rope
// ball underneath and the joint gets a bare rim.
//
// The trouble is that a sphere is the right size in every direction at once,
// and the notch it is filling only exists BETWEEN the arms. Along an arm there
// is no notch -- there is a tube, already wearing its own sleeve -- and there
// the ball stands proud of that sleeve by
//
//     jointR*(1+HALO) - tube*(1+HALO)  =  tube*(1+HALO)*(sqrt(2)-1)
//
// which at the sizes these games use is about three times the halo width the
// sleeve itself has. Seen side on it is a collar around the joint. Seen END ON
// -- a passage receding from the camera -- it is a dark disc almost four times
// the intended outline, and it occludes whatever is behind it, because the halo
// writes depth. That is the whole complaint: a receding edge wears a blob.
//
// So the ball keeps its radius and gives up the parts of itself that lie along
// an arm. What is removed is a CONE around each arm direction, and the angle
// falls out of the geometry rather than being chosen:
//
//   a fragment on the unit sphere sits at |p| = 1
//   its distance from an arm's axis is the PERPENDICULAR part, length(p - a*(p.a))
//   the sleeve around that arm has radius sleeve/ball = 1/sqrt(2) in these units
//   so the fragment is inside the sleeve when perp < 1/sqrt(2), i.e. within 45
//   degrees of the arm
//
// and 45 degrees is exactly where the sleeve surface crosses the ball surface,
// which is where the collar tapers to nothing. The cut ends where the problem
// ends and touches nothing else on the sphere.
//
// It is worth writing the wrong version down too, because it is the natural one
// and it is silently useless. Testing |p.a| > sqrt(1 - sleeve^2) also describes
// a region 45 degrees from the arm, but the region ON THE OTHER SIDE: the polar
// cap, which is the part of the ball buried inside the tube where nothing can
// see it. Cutting it changes the picture not at all. The collar lives at the
// arm's equator -- small distance along, large distance across -- and the test
// has to be on the perpendicular, not the axial, component.
//
// This file is arithmetic only, so the suite can check the angles rather than
// the renderer having to be looked at. The shader in halo.js does the same sum
// per fragment.

// The six signed axis directions a passage can leave a cell by, in the order
// their bits are assigned: +x, -x, +y, -y, +z, -z.
//
// A joint carries its arms as a bitmask because it is drawn instanced -- one
// sphere, hundreds of copies -- so each copy can afford one number and not a
// list. Six directions fit in six bits with room to spare in a float.
export const ARM_DIRS = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

// Pack a joint's arm directions into that mask.
//
// `dirs` are vectors from the joint toward its neighbours, in render space;
// only their direction matters and only the three rendered axes count. A step
// that leaves the slice is not an arm: it is not drawn as a tube, so there is
// no sleeve along it and the ball must keep its halo in that direction. Such a
// step has no component on the three axes here, so it drops out by itself.
export function armMask(dirs) {
  let mask = 0;
  for (const d of dirs) {
    const v = Array.isArray(d) ? d : [d.x, d.y, d.z];
    // The dominant axis, and only if there genuinely is one. A zero-length
    // direction names no arm, and neither does one that lies off the three
    // axes entirely.
    let best = -1, mag = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(v[i]) > mag) { mag = Math.abs(v[i]); best = i; }
    }
    if (best < 0 || mag < 1e-9) continue;
    mask |= 1 << (best * 2 + (v[best] > 0 ? 0 : 1));
  }
  return mask;
}

// Which arms a mask names, as unit vectors. The inverse of armMask, for tests
// and for anything that wants to reason about a joint without unpacking bits.
export function armsOf(mask) {
  return ARM_DIRS.filter((_, i) => (mask & (1 << i)) !== 0);
}

// The cosine of the half-angle of the cone cut around each arm.
//
// Expressed as the sleeve radius over the ball radius, which is the number the
// shader compares a perpendicular distance against. For a joint whose ball is
// jointR*(1+HALO) and whose arms are tube*(1+HALO), it is tube/jointR -- the
// (1 + HALO) cancels, which is why the halo width does not appear here at all.
export function sleeveFraction(tube, jointR) {
  if (!(jointR > 0)) return 0;
  // Clamped, because the sleeve can be WIDER than the ball it is cutting into.
  // A dead end's joint is a cap flush with its own tube, so its ball is the
  // tube's radius -- and once the ball wears a thinner shell than the tube
  // does, the sleeve is the larger of the two. Left unclamped the test would
  // then be true over the whole hemisphere and cut the end cap's halo away
  // entirely, which is the one halo on a dead end that there is.
  //
  // Clamping to 1 makes the cone a hemisphere at most: everything on the arm's
  // side goes, everything behind it stays. For a cap that is right -- the arm's
  // side of it IS the tube -- and it degrades gently rather than vanishing.
  return Math.min(1, tube / jointR);
}

// Is a point on the unit sphere inside the sleeve around one of `mask`'s arms?
//
// `p` is a point in the joint's own object space, on the unit sphere. `s` is
// sleeveFraction. This is the test the fragment shader runs, written once here
// where it can be checked against numbers.
export function inSleeve(p, mask, s) {
  const v = Array.isArray(p) ? p : [p.x, p.y, p.z];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const n = [v[0] / len, v[1] / len, v[2] / len];
  for (const a of armsOf(mask)) {
    const along = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    // Behind the joint relative to this arm: a different arm's business.
    if (along <= 0) continue;
    // Distance from the arm's axis, which is what the sleeve is measured on.
    const perp = Math.sqrt(Math.max(0, 1 - along * along));
    if (perp < s) return true;
  }
  return false;
}
