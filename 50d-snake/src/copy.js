// Everything the player reads in 50D Snake.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.

// The end-of-run words are 4D Snake's, already read and approved there, and a
// death should read the same in either game.
export { GAME_OVER, VERBS, INTO, DIED_PLAINLY } from '../../snake/src/copy.js';

export const HUD = {
  title: '50 D Snake', //kenan approved
  blurb: 'Five cells to a side in 50 directions.', //kenan approved
  score: 'Score', //kenan approved
  length: 'Length', //kenan approved
  // How many of the twenty-five slices already have the head level with the
  // apple on both of their axes. Twenty-five is the apple.
  aligned: 'Apple slices lined up', //kenan approved
  // How much of the board the snake fills. Filling it is how snake is won.
  complete: 'Complete', //kenan approved
  padFoot: 'menu · drag to look', //kenan approved
};

// The bar under the pad: Space, and what pressing it will do now. While
// looking it says how to get back, since the snake is waiting until you do.
export const MODE = {
  key: 'Space', //kenan approved
  steering: 'look around', //kenan approved
  looking: 'steer again', //kenan approved
};

// The percentage under "Complete", written out in full.
export const COMPLETE = (pct) => `${pct}%`; //kenan approved

// The axes are numbered from one, as a player would count them.
export const AXIS = (d) => `${d + 1}`; //kenan approved

// Under each panel: which axis runs across it and which runs up it.
export const PANEL_CAPTION = (h, v) => `↔ ${h} · ↕ ${v}`; //kenan approved

// The names under the pad's buttons. WASD chooses a slice; the arrows' names
// follow the chosen slice, so they say which axis they move along.
export const PAD = {
  sliceUp: 'slice up', //kenan approved
  sliceDown: 'slice down', //kenan approved
  sliceLeft: 'slice left', //kenan approved
  sliceRight: 'slice right', //kenan approved
  minus: (axis) => `${axis} −`, //kenan approved
  plus: (axis) => `${axis} +`, //kenan approved
};

// A death, with the axis it happened along: "You bonked up axis 17 into the
// lava."
export const DIED = (verb, axis, sign, into) =>
  `You ${verb} ${sign > 0 ? 'up' : 'down'} axis ${axis} ${into}.`; //kenan approved
