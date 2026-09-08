// How big a w-arrow has to be drawn to look the same size in every game.
//
// The arithmetic only, with no three.js in it, so the suite can reach it --
// warrow.js draws and imports this. Same split as tableshape.js beside table.js
// and orbshape.js beside orbs.js.
//
// The problem it solves: LEN is a size in CELLS, and a size in cells is not a
// size on screen. Each game frames its board by pulling the camera back a
// multiple of the board's width, and the multiples differ -- the maze rests at
// 2.4 board-widths through a 52-degree lens, Snake at 3.75 through a 45. The
// same arrow therefore came out at about three quarters its maze size in Snake,
// and rather larger than it in unknot. Identical in the world, three different
// sizes on screen.

// The framing LEN is calibrated against: the MAZE's, which is the game the
// arrows were tuned in and the one they look right in.
export const REF_REST = 2.4;
export const REF_FOV = 52;

// How much to scale an arrow so it LOOKS the size LEN asks for.
//
// A world length L at distance d subtends an angle of about L/d, and the screen
// spans 2*tan(fov/2) at unit distance -- so the fraction of the screen it
// covers is (L/d) / (2*tan(fov/2)). Pulling the camera back shrinks it; opening
// the lens wider shrinks it too, since the same angle is now a smaller share of
// the view.
//
// Matching that fraction to the reference framing means scaling by how much
// smaller this game draws it, which is the reference fraction over this one:
//
//   scale = (restInWidths * tan(fov/2)) / (REF_REST * tan(REF_FOV/2))
//
// A camera further back gives a factor above 1, and a wider lens does too.
// Getting this the wrong way up is easy and quiet -- it hands unknot, which
// looks through a narrower lens than the maze and therefore already draws its
// arrows larger, a factor that makes them smaller still. The suite checks the
// direction rather than only the arithmetic.
//
// Distance is given in BOARD WIDTHS rather than world units, because that is
// what a game actually chooses -- `rest = X * 2.4` -- and it makes the number
// independent of how many cells across the board is.
export function sizeFor(restInWidths = REF_REST, fovDeg = REF_FOV) {
  const tan = (d) => Math.tan((d * Math.PI) / 360);
  return (restInWidths * tan(fovDeg)) / (REF_REST * tan(REF_FOV));
}

// What fraction of the screen's width a world length covers at this framing.
// Exported because it is what "the same size on screen" MEANS, and the suite
// checks the claim rather than re-deriving it.
export function onScreen(len, restInWidths, fovDeg) {
  return (len / restInWidths) / (2 * Math.tan((fovDeg * Math.PI) / 360));
}
