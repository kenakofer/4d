// The dark halo around a rope.
//
// Three of these games draw the same object -- a strand of tube with a ball at
// each bend -- and all three had the same problem with it. A rope that crosses
// itself, or crosses another rope, meets at a seam one pixel wide: two green
// tubes touching edge to edge, with nothing to say which one is in front. The
// depth buffer knows, and the picture does not show it. In a still frame you
// simply cannot tell, and in four dimensions, where two strands in different
// slices are drawn side by side on purpose, it is worse.
//
// A cartoonist would draw a gap. Where one rope passes in front of another, the
// far one stops short and starts again on the other side, and the break is what
// reads as depth -- no shading, no perspective, just an interruption. This is
// that gap.
//
// HOW IT WORKS. Each rope piece gets a second copy of itself, a little fatter,
// in the background colour, drawn before the rope. The shell is opaque and
// writes depth, so it hides whatever is behind it; the rope then draws on top
// of its own shell and covers it entirely. What survives is the rim of the
// shell that the rope does not cover -- a dark outline, one that OCCLUDES
// rather than merely darkening, which is the whole point. Anything further away
// is gone behind it, so the near strand visibly breaks the far one.
//
// The shell is rendered back faces only. A front-faced shell would be the
// nearest surface at every pixel of the rope, and since it is opaque the rope
// would never be seen at all -- you would get a scene made of dark sausages.
// Back faces put the shell's depth on the FAR side of the rope, so the rope
// wins the pixels it covers and the shell keeps the ones around the edge.
// Rendering back faces has a second use: a shell drawn this way cannot hide the
// piece it belongs to, however fat it is, so the width is free to be chosen for
// how it looks.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { COLORS } from './scene.js';

// How much fatter the shell is than the piece it wraps, as a fraction of the
// tube radius.
//
// This is the width of the gap, and it is the only number here that is a matter
// of taste. Too thin and a crossing still reads as a seam; too thick and the
// rope looks outlined, like a cartoon, and the halo starts eating the thin
// strands behind it even where they are not really occluded. A sixth of a tube
// radius is enough: the break only has to be VISIBLE, and once it is, every
// extra pixel is width taken out of the strand behind it for nothing.
export const HALO = 0.17;

// The halo's colour. The scene's own background, so the gap reads as a hole
// punched through to nothing rather than as a dark line drawn on top -- which
// is what it is: the far rope is not there, because the near one is in the way.
export const HALO_COLOR = COLORS.bg;

// The material every shell shares.
//
// `opacity` fades the whole halo with its slice. An unfocused slice's rope is
// drawn at half strength, and a halo that stayed solid black around it would be
// the loudest thing on screen -- the parts of the picture that are meant to
// recede would be outlined hardest. So the halo fades with what it wraps.
//
// It still writes depth when it is faded, which is deliberate: a translucent
// surface that writes depth normally causes trouble, but here the surface being
// hidden is another rope in the same faded slice, and hiding it is exactly what
// the halo is for. What is lost is the ability to see a far strand faintly
// through a near one's halo, which was never wanted.
export function haloMaterial(opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: HALO_COLOR,
    side: THREE.BackSide,
    transparent: opacity < 1,
    opacity,
  });
}

// The scale factor that fattens a piece of radius `r` by the halo width.
//
// A cylinder is only fattened ACROSS its axis. A sphere has no axis and takes
// it on all three.
export function fatten(r) {
  return (r + HALO * r) / r;   // = 1 + HALO, written so the units are visible
}

// How much LONGER a segment's shell is than the segment, at each end, in world
// units.
//
// A rope is drawn as one cylinder per cell, so a straight run is a line of
// segments meeting end to end -- and so, at first, were their shells. That is
// the one arrangement this cannot survive. Two shells that meet exactly share a
// plane, and a back face on that plane is the nearest halo surface at the seam
// with nothing of its own in front of it, so it paints a dark ring across its
// neighbour. A straight run came out banded at every cell: the beading the
// joints were shaped to avoid, arriving by another route.
//
// Shortening the shells is the wrong cure -- it swaps the black band for a nick
// of sky, because a straight run has no joint at the cells it passes through by
// design, and so has nothing there to cover the gap.
//
// The cure is to make them OVERLAP. Two coaxial shells that overlap show
// nothing at the seam: each one's end cap is buried inside the other, and the
// outside of their union is a smooth tube. So a shell reaches past its segment
// at both ends, and the only surfaces left anywhere on a straight run are the
// two at its far ends -- which is what a halo around a straight run should be.
//
// How far it may reach is set by the bends, not by the straight runs. A segment
// that ends at a bend has a joint there, and the joint's own shell is a ball of
// radius jointR * (1 + HALO). Overshoot by less than that and the overshoot is
// swallowed: it ends up inside the ball, where it cannot be seen and cannot
// poke out of the far side of the corner. So that radius is the ceiling, and
// taking most of it leaves the seams comfortably overlapped -- far more than
// depth precision needs -- while staying inside the ball with room to spare.
export function overshoot(jointR) {
  return 0.8 * jointR * (1 + HALO);
}

// The shell's own cylinder: OPEN ENDED, unlike the rope's.
//
// This is the last piece of the straight-run problem, and the one that actually
// finished it. A shell overshoots its segment so that consecutive shells
// overlap and their seam disappears -- but three.js closes a cylinder with end
// caps, and the overshoot carries a cap out past the seam into the middle of
// the neighbouring segment. Rendered back faces, that cap faces the camera and
// sits proud of the neighbour's own surface, so it paints the dark ring the
// overlap was supposed to prevent. The band moved; it did not go.
//
// A shell has no need of caps. It is a sleeve around a tube, and what closes it
// at a free end is the joint's shell, which is a ball. So the tube is built
// open and there is nothing left to paint a ring with. `openEnded` is the third
// positional flag after the height segments, which is why this is a function
// rather than each game passing six arguments it would have to get right.
export function shellGeometry(r, radial = 12) {
  return new THREE.CylinderGeometry(r, r, 1, radial, 1, true);
}

// Every halo draws before every rope, and both draw after the scenery. A rope's
// own halo has to sit under the rope, and one strand's halo has to sit under
// ANOTHER strand -- so the whole halo layer goes down first and the whole rope
// layer over it, rather than each piece carrying its shell along beside it.
// Interleaving them would let a far strand's rope paint over a near strand's
// halo, which is the bug this exists to fix.
export const HALO_ORDER = 0.9;
export const ROPE_ORDER = 1;
