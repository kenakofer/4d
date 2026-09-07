// The mark for a step that leaves the slice.
//
// Every one of these games has steps that do not lie in the room you are
// looking at: the rope continues in the next w-slice, the snake's head is
// already in the one behind, a passage leads out of this frame entirely. None
// of them is a length of anything in space, so none can be drawn as rope --
// drawing it as rope would claim a distance that is not there.
//
// They were drawn as thin grey lines from one frame to the other, and with more
// than a handful on screen that stopped working. The lines are long, they cross
// every frame between their two ends, and they cross each other; a maze, which
// has one at nearly every cell, came out under a grey cobweb with the maze
// somewhere behind it. The line also says the wrong thing. It draws the space
// BETWEEN two slices, which is the one part of the picture that means nothing:
// the gap between frames is a layout convenience, not somewhere the player can
// be.
//
// What the player actually needs at a cell is local and small: there is a way
// out of here, and it goes THAT WAY. So each end of the link gets its own
// arrow, sitting just off its own cell and pointing toward the far end -- and
// nothing is drawn in between. Two arrows, each one entirely inside the frame
// it belongs to, replace one line that belonged to neither.
//
// The arrow is a flat triangle held facing the camera, so it reads as an arrow
// from wherever you are standing rather than foreshortening to a sliver at the
// angles where you most need it. It takes its rope's own colour, so which
// strand is leaving is never in question, and the same dark halo as the rope,
// so it breaks whatever it passes in front of exactly as the rope does.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';
import { haloMaterial, HALO } from './halo.js';

// The arrow's length, tip to base, in cells.
//
// Small. The arrow is a road sign, not a landmark: it has to be findable at the
// cell you are standing at and ignorable everywhere else. The first size tried
// was half a cell, and in a maze -- which has one of these at a large fraction
// of its cells -- the board turned into a field of arrows with the maze behind
// them, which is the fault the grey lines had, wearing a different coat.
export const LEN = 0.3;

// How wide the base is, as a fraction of the length. A touch under a right
// angle at the tip, which is the shape that reads as "arrow" at the smallest
// size rather than as a diamond or a needle.
export const WIDTH = 0.72;

// How far the tail sits from the cell centre, in cells.
//
// Close enough to TOUCH the joint that is always drawn there -- a step that
// leaves the slice gets a joint at both ends, because the tube is cut off --
// so the arrow reads as growing out of the ball rather than floating beside it.
// It is the difference between a mark that belongs to a cell and a mark that
// happens to be near one, and at this size the gap was doing real damage: a
// small arrow standing a little apart looked like a fleck of scenery.
export const STANDOFF = 0.13;

// The triangle, pointing along +y in its own plane, tail at the origin.
//
// Built once and shared. Orientation is the mesh's business, and every arrow
// wants the same shape, so there is no reason for each to carry its own.
export function arrowGeometry(len = LEN, width = WIDTH) {
  const w = len * width / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, len, 0,   // tip
    -w, 0, 0,    // base, one side
    w, 0, 0,     // base, the other
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(
    [0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return g;
}

// How much of its rope's colour an arrow keeps.
//
// The rope is drawn with a lit material and sits in a dim scene, so its colours
// reach the eye softened. An arrow is unlit -- it is a flat token held up to the
// camera, not a surface in the world -- so the SAME colour comes out at full
// strength, and the arrows read as a separate, louder set of objects than the
// rope they belong to. Damping them to roughly what the lighting does to the
// rope puts the two back in the same picture.
export const TINT = 0.62;

// A material for the arrow itself. Unlit and double sided: it should not take
// shading from where the lights happen to be, and it should not vanish when the
// camera crosses behind its plane.
//
// The arrow's tail is deliberately buried in the joint it grows out of -- that
// is what makes it read as attached rather than parked nearby -- and a joint is
// an opaque ball that writes depth. Tested against that depth the buried part
// simply loses, and what survives is a chevron floating clear of the ball with
// the ball's own halo cutting between the two. Raising renderOrder does not fix
// it: both are opaque, so the depth buffer decides and draw order does not come
// into it.
//
// The first answer was to switch depthTest off entirely, and it went too far.
// An arrow that never asks about depth is not merely un-occluded by its own
// joint -- it is un-occluded by EVERYTHING, so it shows through the table it is
// standing over and through any strand nearer the camera than itself. The table
// says of itself that nothing about the game should ever be read through it,
// and the arrows were reading through it.
//
// So the arrow tests depth like everything else, and is biased toward the
// camera by roughly the depth of the ball it grows out of. It wins against its
// own joint, which is a fixed small distance away, and loses to the table and
// to strands in front of it, which are not. POLYGON_OFFSET is in depth-buffer
// units rather than world ones, which is what makes it hold at any distance the
// camera reaches rather than needing to be retuned per zoom.
export function arrowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: color.clone().multiplyScalar(TINT),
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET,
    polygonOffsetUnits: POLYGON_OFFSET,
  });
}

// How far toward the camera the arrow and its halo are biased, in depth-buffer
// units.
//
// Enough to clear the joint the arrow grows out of, which is the only thing it
// is entitled to win against. Small enough that a strand genuinely in front of
// the arrow still hides it -- that is the whole reason the halo exists, and an
// arrow that cheated its way past would be making the same claim the halo is
// there to deny.
export const POLYGON_OFFSET = -4;

// The arrow's halo: the same shell the rope wears, so an arrow crossing a rope
// breaks it exactly as a rope would and the two read as the same kind of object.
//
// A flat triangle cannot be given a shell by scaling it -- scaling about the
// centroid moves the tip as well as the edges, so the halo would be a bigger
// arrow pointing slightly further, not an outline. It is drawn as a slightly
// larger copy set back: same shape grown by the halo width, pushed a hair away
// from the camera so the arrow paints over the middle and only the rim survives.
//
// The growth is FORWARD ONLY, away from the base. An outline along the base is
// a dark line drawn exactly where the arrow meets its joint, and it reads as a
// gap -- the arrow stops looking like it grows out of the ball and starts
// looking like a separate token parked in front of one. The two edges that
// need a halo are the two the eye follows to the tip; the base is not an
// outside edge at all, it is a join.
export function arrowHaloMaterial(opacity = 1) {
  const m = haloMaterial(opacity);
  m.side = THREE.DoubleSide;
  // Biased forward by the same amount as the arrow, for the same reason: it has
  // to reach the same pixels the arrow does, including the ones inside the
  // joint. Any difference between the two offsets would show as the halo
  // detaching from its arrow at some angles.
  m.polygonOffset = true;
  m.polygonOffsetFactor = POLYGON_OFFSET;
  m.polygonOffsetUnits = POLYGON_OFFSET;
  return m;
}

// The halo triangle: wider and longer than the arrow, but standing on the same
// base line, so it rims the two leading edges and nothing along the bottom.
export function haloGeometry(len = LEN, width = WIDTH) {
  const grow = LEN * HALO;
  const w = len * width / 2 + grow;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, len + grow, 0,
    -w, 0, 0,
    w, 0, 0,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(
    [0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  return g;
}

// How far behind the arrow its halo sits, in cells. Enough to lose the depth
// tie reliably at any distance the camera reaches, small enough that the two
// never visibly separate.
export const HALO_BACK = 0.012;

// Aim an arrow: place it `STANDOFF` from `from`, pointing at `to`, and turn it
// to face `eye`.
//
// The direction is the honest one -- straight at the far end of the link,
// wherever that frame has been laid out -- so an arrow always points at the
// place the step actually goes, and swings as the ring turns.
//
// Facing the camera is done by building the frame from two directions rather
// than by lookAt: the arrow must point ALONG the link on screen, which fixes
// its y axis, and it must face the eye, which fixes its z as nearly as the
// first constraint allows. Gram-Schmidt is exactly that -- keep y, take the
// component of the view direction perpendicular to it, and let x follow. An
// ordinary lookAt would honour the facing and lose the aim.
export function aim(mesh, from, to, eye) {
  const along = to.clone().sub(from);
  if (along.lengthSq() < 1e-12) return false;
  along.normalize();

  const view = eye.clone().sub(from);
  // Straight down the link: there is no plane that both points along it and
  // faces the eye, so the arrow would be edge on however it were turned. It is
  // pointing at the camera, which the standoff and the halo already say more
  // clearly than a zero-area triangle would.
  let z = view.sub(along.clone().multiplyScalar(view.dot(along)));
  if (z.lengthSq() < 1e-9) return false;
  z.normalize();

  const x = new THREE.Vector3().crossVectors(along, z);
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, along, z));
  mesh.position.copy(from).addScaledVector(along, STANDOFF);
  return true;
}

// ---------------------------------------------------------------------------
// A set of arrows that keep facing the camera.
//
// The aiming has to be redone every frame -- the camera rocks constantly, and
// an arrow that was turned once is edge on a moment later -- so the arrows are
// collected rather than left loose in the scene. Each game builds the set when
// its rope changes and calls face() once per frame; nothing else needs saying
// on either side.
//
// The geometry is shared across every arrow in the set and disposed with it,
// which matters for the maze: it has one of these at a large fraction of its
// cells, and a triangle apiece would be a lot of buffers for six vertices.
// ---------------------------------------------------------------------------
export class Arrows {
  // Above the rope, and above its halo. Both arrow and shell now test depth, so
  // this ordering no longer decides what wins -- the depth buffer does. It
  // still settles the tie between an arrow and its OWN halo, which sit at the
  // same offset and must go down halo first.
  constructor(parent, { order = 3, haloOrder = 2.9 } = {}) {
    this.parent = parent;
    this.order = order;
    this.haloOrder = haloOrder;
    this.group = new THREE.Group();
    this.geo = arrowGeometry();
    this.haloGeo = haloGeometry();
    this.items = [];
    parent.add(this.group);
  }

  // One link: an arrow just off `from`, pointing at `to`.
  //
  // Both ends of a w-step want one, so a caller with a link in hand adds two --
  // this end pointing there, that end pointing back. Nothing here assumes the
  // pair, because a maze also has links whose far end is off screen.
  add(from, to, color, opacity = 1) {
    const halo = new THREE.Mesh(this.haloGeo, arrowHaloMaterial(opacity));
    halo.renderOrder = this.haloOrder;
    const arrow = new THREE.Mesh(this.geo, arrowMaterial(color, opacity));
    arrow.renderOrder = this.order;
    this.group.add(halo, arrow);
    this.items.push({ arrow, halo, from: from.clone(), to: to.clone() });
  }

  // Turn every arrow to face `eye`. Called once a frame.
  //
  // An arrow pointing straight at the camera has no readable orientation and is
  // hidden rather than drawn as the sliver it would collapse to; it comes back
  // by itself as soon as the camera moves off the line.
  face(eye) {
    for (const it of this.items) {
      const ok = aim(it.arrow, it.from, it.to, eye);
      it.arrow.visible = ok;
      it.halo.visible = ok;
      if (!ok) continue;
      it.halo.position.copy(it.arrow.position);
      it.halo.quaternion.copy(it.arrow.quaternion);
      // Set back along the view, so the arrow paints over its middle and only
      // the rim shows. Along the VIEW rather than the arrow's own normal,
      // because the two differ once the arrow is turned to aim as well as face,
      // and it is the camera that has to see the arrow in front.
      const back = it.arrow.position.clone().sub(eye).normalize();
      it.halo.position.addScaledVector(back, HALO_BACK);
    }
  }

  clear() {
    for (const it of this.items) {
      this.group.remove(it.arrow, it.halo);
      it.arrow.material.dispose();
      it.halo.material.dispose();
    }
    this.items = [];
  }

  dispose() {
    this.clear();
    this.parent.remove(this.group);
    this.geo.dispose();
    this.haloGeo.dispose();
  }
}
