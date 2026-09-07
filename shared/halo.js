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
// strands behind it even where they are not really occluded. The break only has
// to be VISIBLE, and once it is, every extra pixel is width taken out of the
// strand behind it for nothing.
//
// It was a sixth of a tube radius, and that was too much. The case that shows
// it is a passage running away from the camera: seen end on it is a small disc
// of rope, and every part of the halo around it -- the sleeve's whole
// circumference -- is pointed straight at the eye at once. There is nothing
// behind such an edge for the halo to break, so the entire ring is width spent
// on an occlusion that is not happening, and a maze full of receding passages
// reads as a field of dark rings with rope inside them. Halved, the break is
// still plainly there where two strands cross -- which is the only place it was
// ever needed -- and a passage pointing at you is nearly all rope.
export const HALO = 0.085;

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

// How much of the halo width a JOINT's ball gets. A fraction of HALO, not HALO.
//
// fatten() is a ratio, so a bigger sphere gets a proportionally thicker shell:
// a joint ball of tube*sqrt(2) comes out with a rim sqrt(2) times the tube's,
// for no reason except that it is bigger. That is backwards. A joint is the
// same strand as the tube it joins -- it is a bend in a rope, not a bead on it
// -- and its outline should not announce itself more loudly than the rope's
// does merely for being round.
//
// So the ball takes half the width, which lands its rim slightly INSIDE the
// tube's and lets the joint read as the strand turning a corner rather than as
// a knuckle wearing its own outline.
export const JOINT_HALO = 0.5;

// The scale factor for a joint's shell: the ball, plus its share of the width.
export function fattenJoint(r) {
  return (r + HALO * JOINT_HALO * r) / r;   // = 1 + HALO * JOINT_HALO
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

// The joint halo's material: the ball, minus the parts that lie along an arm.
//
// See haloshape.js for why the ball cannot simply be made smaller, and for the
// arithmetic this shader runs. In short: the ball is exactly the size needed to
// fill the notch between two sleeves, but a sphere is that size in every
// direction, and along an arm there is no notch to fill -- only a tube already
// wearing its own sleeve. The ball standing proud of that sleeve is a collar,
// and end on, where a passage recedes from the camera, the collar is a dark
// disc nearly four times the outline the rope asked for.
//
// So each arm takes a cone out of the ball. The angle is not a taste: at 45
// degrees the sleeve surface crosses the ball surface, which is exactly where
// the collar tapers to nothing, so the cut removes the collar and nothing else.
//
// Each joint carries its arms as a bitmask in an instanced attribute, because
// the joints are drawn instanced and a mask is one number where a list would be
// several. `armMask` in haloshape.js packs it.
//
// The discard is in the fragment shader rather than the geometry because the
// joints share one sphere between hundreds of instances -- that is the point of
// instancing them -- and the cut is different for every one.
export function jointHaloMaterial(opacity = 1) {
  const m = haloMaterial(opacity);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float armMask;
        attribute float sleeveFrac;
        varying float vArmMask;
        varying float vSleeveFrac;
        varying vec3 vBallPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vArmMask = armMask;
        vSleeveFrac = sleeveFrac;
        // The position on the ball in the joint's OWN space, before the
        // instance matrix scales it. The sphere is built at unit radius and
        // scaled per instance, so this is already the unit sphere the
        // arithmetic in haloshape.js is written for.
        vBallPos = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vArmMask;
        varying float vSleeveFrac;
        varying vec3 vBallPos;

        // Is this fragment inside the sleeve around the arm in direction a?
        bool inSleeve(vec3 n, vec3 a, float s) {
          float along = dot(n, a);
          // Behind the joint as far as this arm is concerned: another arm's
          // business, and cutting it here would punch through the far side.
          if (along <= 0.0) return false;
          float perp = sqrt(max(0.0, 1.0 - along * along));
          return perp < s;
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 n = normalize(vBallPos);
          int mask = int(vArmMask + 0.5);
          bool cut = false;
          // The six signed axes, in the bit order haloshape.js assigns them.
          if ((mask & 1) != 0 && inSleeve(n, vec3( 1.0, 0.0, 0.0), vSleeveFrac)) cut = true;
          if ((mask & 2) != 0 && inSleeve(n, vec3(-1.0, 0.0, 0.0), vSleeveFrac)) cut = true;
          if ((mask & 4) != 0 && inSleeve(n, vec3( 0.0, 1.0, 0.0), vSleeveFrac)) cut = true;
          if ((mask & 8) != 0 && inSleeve(n, vec3( 0.0,-1.0, 0.0), vSleeveFrac)) cut = true;
          if ((mask & 16) != 0 && inSleeve(n, vec3( 0.0, 0.0, 1.0), vSleeveFrac)) cut = true;
          if ((mask & 32) != 0 && inSleeve(n, vec3( 0.0, 0.0,-1.0), vSleeveFrac)) cut = true;
          if (cut) discard;
        }`);
  };
  // The cut angle travels per instance rather than as a uniform, because a
  // junction's ball is scaled up to mark it while its arms stay the width they
  // were -- so its sleeve is a smaller fraction of its ball than a corner's.
  // One material, one compiled program, a different angle per joint.
  //
  // Three keys a material's shader program by onBeforeCompile.toString() unless
  // told otherwise, and every joint halo shares that source, so the default key
  // is right. Adding a unique one would leak a compiled program per rebuild.
  return m;
}
